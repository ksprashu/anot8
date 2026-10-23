/**
 * Node render backend for the Canvas2D exporter, built on @napi-rs/canvas.
 * Lets the CLI and MCP server render exactly what the browser export produces.
 */
import dns from 'node:dns/promises';
import { readFile, stat } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';
import type { RenderBackend } from '../../export/canvasExporter';

const DATA_URL_PATTERN = /^data:([^;,]*)(;base64)?,(.*)$/s;

/** Maximum image payload size (50 MB) to guard against memory exhaustion. */
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
/** Maximum data URL character length (~68 MB base64 for 50 MB binary). */
const MAX_DATA_URL_CHARS = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4096;
/** Maximum canvas side length (16384 px) and pixel count (64 MP) to guard against OOM. */
export const MAX_CANVAS_SIDE = 16_384;
export const MAX_CANVAS_PIXELS = 67_108_864;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata',
]);

function isPrivateIpv4Octets(a: number, b: number, c: number, _d: number): boolean {
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateEmbeddedIpv4Words(hiWord: number, loWord: number): boolean {
  const a = (hiWord >> 8) & 0xff;
  const b = hiWord & 0xff;
  const c = (loWord >> 8) & 0xff;
  const d = loWord & 0xff;
  return isPrivateIpv4Octets(a, b, c, d);
}

/**
 * Expands an IPv6 address into 8 16-bit words (or null if invalid).
 */
function parseIpv6Words(addr: string): number[] | null {
  const zoneStripped = addr.split('%')[0];
  const v4Suffix = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(zoneStripped);
  let normalized = zoneStripped;
  if (v4Suffix) {
    const octets = v4Suffix[2].split('.').map(Number);
    if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    normalized = `${v4Suffix[1]}${hi}:${lo}`;
  }
  const halves = normalized.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - (left.length + right.length);
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const full = [...left, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...right];
  if (full.length !== 8) return null;
  const words = full.map((w) => parseInt(w, 16));
  if (words.some((w) => !Number.isFinite(w) || w < 0 || w > 0xffff)) return null;
  return words;
}

/**
 * Checks whether an IPv4 or IPv6 literal falls in loopback, private, link-local, or reserved ranges.
 */
export function isPrivateOrReservedIp(host: string): boolean {
  const unwrapped = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  const zoneStripped = unwrapped.split('%')[0];
  const version = net.isIP(zoneStripped);
  if (version === 4) {
    const [a, b, c, d] = zoneStripped.split('.').map(Number);
    return isPrivateIpv4Octets(a, b, c, d);
  }
  if (version === 6) {
    const words = parseIpv6Words(zoneStripped);
    if (!words) return true;
    const isAllZero = words.every((w) => w === 0);
    const isLoopback = words.slice(0, 7).every((w) => w === 0) && words[7] === 1;
    if (isAllZero || isLoopback) return true;
    // Link-local fe80::/10, Unique local fc00::/7, Multicast ff00::/8
    if ((words[0] & 0xffc0) === 0xfe80) return true;
    if ((words[0] & 0xfe00) === 0xfc00) return true;
    if ((words[0] & 0xff00) === 0xff00) return true;
    // Teredo (2001:0000::/32), Benchmarking (2001:0002::/48), Documentation (2001:0db8::/32)
    if (words[0] === 0x2001 && (words[1] === 0x0000 || words[1] === 0x0002 || words[1] === 0x0db8)) {
      return true;
    }
    // NAT64 well-known prefix (64:ff9b::/96) and local-use NAT64 (64:ff9b:1::/48)
    if (words[0] === 0x0064 && words[1] === 0xff9b) {
      return true;
    }
    // IPv4-mapped (::ffff:w6:w7), IPv4-translated (::ffff:0:w6:w7), or IPv4-compatible (::w6:w7)
    const isMappedPrefix =
      words.slice(0, 4).every((w) => w === 0) &&
      ((words[4] === 0 && (words[5] === 0xffff || words[5] === 0)) || (words[4] === 0xffff && words[5] === 0));
    if (isMappedPrefix) {
      return isPrivateEmbeddedIpv4Words(words[6], words[7]);
    }
    // 6to4 (2002::/16) embeds an IPv4 address in words[1..2]
    if (words[0] === 0x2002) {
      return isPrivateEmbeddedIpv4Words(words[1], words[2]);
    }
    return false;
  }
  return false;
}

/**
 * Validates that a remote URL uses http(s), has no embedded credentials, and does not target
 * loopback, link-local, or private network hosts (unless ANOT8_ALLOW_PRIVATE_URLS=1 is set).
 */
export function assertSafeHttpUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported URL protocol "${parsed.protocol}"`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('URLs with embedded credentials are not allowed');
  }
  if (process.env.ANOT8_ALLOW_PRIVATE_URLS === '1') {
    return parsed;
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    isPrivateOrReservedIp(hostname)
  ) {
    throw new Error(`Refusing to fetch private or loopback host "${parsed.hostname}"`);
  }
  return parsed;
}

async function assertResolvedHostIsPublic(parsed: URL): Promise<void> {
  if (process.env.ANOT8_ALLOW_PRIVATE_URLS === '1') return;
  const unwrapped = parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
    ? parsed.hostname.slice(1, -1)
    : parsed.hostname;
  if (net.isIP(unwrapped)) {
    if (isPrivateOrReservedIp(unwrapped)) {
      throw new Error(`Refusing to fetch private or loopback IP "${parsed.hostname}"`);
    }
    return;
  }
  const records = await dns.lookup(unwrapped, { all: true });
  if (records.length === 0) {
    throw new Error(`Could not resolve host "${parsed.hostname}"`);
  }
  for (const record of records) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new Error(`Refusing to fetch "${parsed.hostname}" (resolves to private IP ${record.address})`);
    }
  }
}

async function readResponseWithCap(res: Response, maxBytes: number): Promise<Buffer> {
  const contentLength = Number(res.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`Image exceeds maximum size of ${maxBytes} bytes`);
  }
  if (!res.body) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) throw new Error(`Image exceeds maximum size of ${maxBytes} bytes`);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`Image exceeds maximum size of ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks, total);
}

async function fetchImageBytes(rawUrl: string): Promise<Buffer> {
  let currentUrl = rawUrl;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const parsed = assertSafeHttpUrl(currentUrl);
    await assertResolvedHostIsPublic(parsed);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(parsed, { redirect: 'manual', signal: controller.signal });
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel().catch(() => undefined);
        const location = res.headers.get('location');
        if (!location) throw new Error(`Redirect missing Location header from ${currentUrl}`);
        currentUrl = new URL(location, parsed).toString();
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        throw new Error(`Failed to fetch image ${currentUrl}: HTTP ${res.status}`);
      }
      return await readResponseWithCap(res, MAX_IMAGE_BYTES);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Too many redirects fetching image ${rawUrl}`);
}

export function assertCanvasDimensions(width: number, height: number): { width: number; height: number } {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w > MAX_CANVAS_SIDE || h > MAX_CANVAS_SIDE || w * h > MAX_CANVAS_PIXELS) {
    throw new Error(
      `Canvas dimensions ${w}x${h} exceed maximum allowed (${MAX_CANVAS_SIDE}px per side, ${MAX_CANVAS_PIXELS} pixels total)`
    );
  }
  return { width: w, height: h };
}

/**
 * Reads image bytes from a data URL, http(s) URL, or file path (relative paths resolve against baseDir).
 */
export async function readImageSource(src: string, baseDir: string = process.cwd()): Promise<Buffer> {
  if (src.startsWith('data:')) {
    if (src.length > MAX_DATA_URL_CHARS) {
      throw new Error(`Data URL image exceeds maximum size of ${MAX_IMAGE_BYTES} bytes`);
    }
    const dataMatch = DATA_URL_PATTERN.exec(src);
    if (!dataMatch) throw new Error('Invalid data URL');
    const [, , isBase64, payload] = dataMatch;
    const buf = isBase64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload), 'utf8');
    if (buf.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(`Data URL image exceeds maximum size of ${MAX_IMAGE_BYTES} bytes`);
    }
    return buf;
  }
  if (/^https?:\/\//i.test(src)) {
    return fetchImageBytes(src);
  }
  const filePath = src.startsWith('file://') ? fileURLToPath(src) : path.resolve(baseDir, src);
  const info = await stat(filePath);
  if (info.size > MAX_IMAGE_BYTES) {
    throw new Error(`Image file exceeds maximum size of ${MAX_IMAGE_BYTES} bytes`);
  }
  return readFile(filePath);
}

export async function decodeImageBuffer(buf: Buffer): Promise<Image> {
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Image buffer exceeds maximum size of ${MAX_IMAGE_BYTES} bytes`);
  }
  const img = await loadImage(buf);
  assertCanvasDimensions(img.width, img.height);
  return img;
}

export async function decodeImage(src: string, baseDir?: string): Promise<Image> {
  return decodeImageBuffer(await readImageSource(src, baseDir));
}

export function createNodeBackend(baseDir?: string): RenderBackend {
  // Each source is decoded once per backend, even when drawn several times (base image, blur passes)
  const cache = new Map<string, Promise<Image>>();
  return {
    createCanvas: (width, height) => {
      const dims = assertCanvasDimensions(width, height);
      return createCanvas(dims.width, dims.height) as unknown as HTMLCanvasElement;
    },
    loadImage: (src) => {
      if (!cache.has(src)) cache.set(src, decodeImage(src, baseDir));
      return cache.get(src)! as unknown as Promise<CanvasImageSource>;
    },
  };
}

/**
 * Encodes a canvas created by the Node backend as PNG bytes.
 */
export function encodePng(canvas: HTMLCanvasElement): Buffer {
  return (canvas as unknown as { toBuffer(mime: 'image/png'): Buffer }).toBuffer('image/png');
}
