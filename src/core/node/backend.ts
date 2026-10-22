/**
 * Node render backend for the Canvas2D exporter, built on @napi-rs/canvas.
 * Lets the CLI and MCP server render exactly what the browser export produces.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';
import type { RenderBackend } from '../../export/canvasExporter';

const DATA_URL_PATTERN = /^data:([^;,]*)(;base64)?,(.*)$/s;

/**
 * Reads image bytes from a data URL, http(s) URL, or file path (relative paths resolve against baseDir).
 */
export async function readImageSource(src: string, baseDir: string = process.cwd()): Promise<Buffer> {
  const dataMatch = DATA_URL_PATTERN.exec(src);
  if (dataMatch) {
    const [, , isBase64, payload] = dataMatch;
    return isBase64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload), 'utf8');
  }
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Failed to fetch image ${src}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const filePath = src.startsWith('file://') ? new URL(src).pathname : path.resolve(baseDir, src);
  return readFile(filePath);
}

export async function decodeImage(src: string, baseDir?: string): Promise<Image> {
  return loadImage(await readImageSource(src, baseDir));
}

export function createNodeBackend(baseDir?: string): RenderBackend {
  // Each source is decoded once per backend, even when drawn several times (base image, blur passes)
  const cache = new Map<string, Promise<Image>>();
  return {
    createCanvas: (width, height) =>
      createCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height))) as unknown as HTMLCanvasElement,
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
