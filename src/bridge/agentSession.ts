/**
 * Spec-level editing session behind window.anot8. It keeps the last spec it loaded so anchors stay live
 * across apply() calls; once a person edits the canvas, it falls back to a pixel spec derived from state.
 */
import { AppAction, AppState, BaseImage } from '../types';
import { RenderBackend, browserBackend, exportCompositeBlob } from '../export/canvasExporter';
import { serializeAnnotationsToMarkdown } from '../export/markdownSerializer';
import {
  DocumentSpec,
  OpsSchema,
  SpecError,
  applyOps,
  compileSpec,
  fileNameFromSource,
  getSpecJsonSchema,
  parseSpec,
  toSpec,
} from '../spec';
import { z } from 'zod';

export { fileNameFromSource };

export interface AgentSessionHost {
  getState: () => AppState;
  /** Must apply the action synchronously so getState() reflects it right away (e.g. via flushSync). */
  dispatch: (action: AppAction) => void;
  backend?: RenderBackend;
}

interface Synced {
  spec: DocumentSpec;
  image: BaseImage;
  annotations: AppState['annotations'];
  frame: AppState['frame'];
}

const BROWSER_IMAGE_SOURCE_PATTERN = /^(https?:\/\/|data:image\/|blob:)/i;

function assertSafeBrowserImageSource(source: string): void {
  if (!BROWSER_IMAGE_SOURCE_PATTERN.test(source)) {
    throw new SpecError([
      {
        path: 'image.source',
        message: 'Browser specs must use an http(s), data:image/*, or blob: URL',
      },
    ]);
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

export class AgentSession {
  private synced: Synced | null = null;
  /** Data URL emitted for a blob: image, so a round-tripped spec keeps the same image. */
  private embedded: { src: string; dataUrl: string } | null = null;

  constructor(private readonly host: AgentSessionHost) {}

  private get backend(): RenderBackend {
    return this.host.backend ?? browserBackend;
  }

  schema(): { spec: Record<string, unknown>; ops: Record<string, unknown> } {
    return { spec: getSpecJsonSchema(), ops: z.toJSONSchema(OpsSchema) as Record<string, unknown> };
  }

  /** True while the canvas still shows exactly what the session last loaded. */
  private isInSync(state: AppState): boolean {
    const s = this.synced;
    return Boolean(s && state.image === s.image && state.annotations === s.annotations && state.frame === s.frame);
  }

  private async embedImage(image: BaseImage): Promise<string> {
    if (this.embedded?.src === image.src) return this.embedded.dataUrl;
    const img = (await this.backend.loadImage(image.src)) as HTMLImageElement;
    const canvas = this.backend.createCanvas(image.naturalWidth, image.naturalHeight);
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    this.embedded = { src: image.src, dataUrl };
    return dataUrl;
  }

  private isSameImage(source: string, image: BaseImage | null): image is BaseImage {
    return Boolean(image && (source === image.src || (this.embedded?.src === image.src && source === this.embedded.dataUrl)));
  }

  /**
   * Returns the current document as a spec. blob: image URLs only work inside this page,
   * so they are embedded as data URLs; pass embedImage to embed any image.
   */
  async getSpec(options: { embedImage?: boolean } = {}): Promise<DocumentSpec> {
    const state = this.host.getState();
    if (!state.image) throw new Error('No image is loaded');
    const spec = this.isInSync(state) ? this.synced!.spec : toSpec(state);
    const src = state.image.src;
    if (src.startsWith('blob:') || (options.embedImage && !src.startsWith('data:'))) {
      return { ...spec, image: { ...spec.image, source: await this.embedImage(state.image) } };
    }
    return spec;
  }

  /**
   * Loads a spec. If it references the image already on the canvas, only annotations and frame change
   * (one undoable step); otherwise the image is replaced, which resets undo history like any new image.
   */
  async loadSpec(input: unknown): Promise<{ annotations: { id: string; type: string; index: number }[] }> {
    const spec = parseSpec(input);
    const previousImage = this.host.getState().image;
    let image = previousImage;
    if (!this.isSameImage(spec.image.source, image)) {
      assertSafeBrowserImageSource(spec.image.source);
      const element = (await this.backend.loadImage(spec.image.source)) as HTMLImageElement;
      image = {
        id: `spec-${Date.now()}`,
        src: spec.image.source,
        naturalWidth: element.naturalWidth || element.width,
        naturalHeight: element.naturalHeight || element.height,
        fileName: fileNameFromSource(spec.image.source),
        fileSize: 0,
      };
      // Compile before touching state so an invalid spec leaves the canvas as it was.
      compileSpec(spec, { width: image.naturalWidth, height: image.naturalHeight });
      this.host.dispatch({ type: 'SET_IMAGE', payload: image });
      if (previousImage?.src.startsWith('blob:') && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        try {
          URL.revokeObjectURL(previousImage.src);
        } catch {
          // Ignore revoke errors in test environments
        }
      }
    }
    return this.commit(spec, image);
  }

  /** Applies edit ops (see schema().ops) to the current document. */
  async apply(ops: unknown): Promise<{ addedIds: string[]; spec: DocumentSpec }> {
    const state = this.host.getState();
    if (!state.image) throw new Error('No image is loaded');
    const base = this.isInSync(state) ? this.synced!.spec : toSpec(state);
    const { spec, addedIds } = applyOps(base, Array.isArray(ops) ? ops : [ops], {
      width: state.image.naturalWidth,
      height: state.image.naturalHeight,
    });
    this.commit(spec, state.image);
    return { addedIds, spec };
  }

  private commit(spec: DocumentSpec, image: BaseImage) {
    const compiled = compileSpec(spec, { width: image.naturalWidth, height: image.naturalHeight });
    const now = Date.now();
    this.host.dispatch({
      type: 'SET_ANNOTATIONS',
      payload: compiled.annotations.map((a) => ({ ...a, createdAt: now, updatedAt: now })),
    });
    this.host.dispatch({ type: 'SET_FRAME', payload: compiled.frame ?? null });
    const state = this.host.getState();
    this.synced = { spec, image, annotations: state.annotations, frame: state.frame };
    return {
      annotations: state.annotations.map((a) => ({ id: a.id, type: a.geometry.type, index: a.index })),
    };
  }

  /** Renders the composite PNG exactly as the Export button would, as a data URL. */
  async render(): Promise<string> {
    const state = this.host.getState();
    if (!state.image) throw new Error('No image is loaded');
    const blob = await exportCompositeBlob(state.image, state.annotations, state.overlays, {
      frame: state.frame,
      backend: this.backend,
    });
    return blobToDataUrl(blob);
  }

  markdown(): string {
    const state = this.host.getState();
    return serializeAnnotationsToMarkdown(state.annotations, 'list', { imageFileName: state.image?.fileName });
  }
}

/** Maximum decoded #spec= hash length (2 MB) to guard against oversized URL payloads. */
export const MAX_SPEC_HASH_CHARS = 2 * 1024 * 1024;

/** Decodes a spec from a "#spec=<base64url JSON>" location hash, or returns null if there is none. */
export function decodeSpecHash(hash: string): unknown | null {
  if (!hash.startsWith('#spec=')) return null;
  if (hash.length > MAX_SPEC_HASH_CHARS) {
    throw new Error('The #spec link exceeds the maximum allowed size');
  }
  const match = /^#spec=([A-Za-z0-9_-]+={0,2})$/.exec(hash);
  if (!match) throw new Error('The #spec link is not valid base64url');
  const base64 = match[1].replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function encodeSpecHash(spec: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(spec));
  const estimatedHashLen = 6 + Math.ceil((bytes.byteLength * 4) / 3);
  if (estimatedHashLen > MAX_SPEC_HASH_CHARS) {
    throw new SpecError([
      {
        path: 'image.source',
        message: `Encoded #spec URL (~${estimatedHashLen} chars) exceeds maximum allowed size (${MAX_SPEC_HASH_CHARS} chars)`,
      },
    ]);
  }
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  const hash = `#spec=${btoa(parts.join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
  if (hash.length > MAX_SPEC_HASH_CHARS) {
    throw new SpecError([
      {
        path: 'image.source',
        message: `Encoded #spec URL (${hash.length} chars) exceeds maximum allowed size (${MAX_SPEC_HASH_CHARS} chars)`,
      },
    ]);
  }
  return hash;
}

/** Heuristic for dropped/pasted files and text: does this look like an Anot8 spec? */
export function looksLikeSpec(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    'image' in value &&
    Array.isArray((value as { annotations?: unknown }).annotations)
  );
}
