/**
 * Spec → PNG pipeline for Node, shared by the CLI and the MCP server.
 */
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { renderCompositeCanvas } from '../../export/canvasExporter';
import { serializeAnnotationsToMarkdown } from '../../export/markdownSerializer';
import { compileSpec, CompiledDocument, parseSpec, DocumentSpec } from '../../spec';
import { createNodeBackend, decodeImage, encodePng } from './backend';

export interface ImageInfo {
  width: number;
  height: number;
}

export async function inspectImage(source: string, baseDir?: string): Promise<ImageInfo> {
  const img = await decodeImage(source, baseDir);
  return { width: img.width, height: img.height };
}

/**
 * Loads the spec's image to learn its dimensions, then compiles the spec against them.
 */
export async function compileSpecWithImage(
  input: unknown,
  baseDir?: string
): Promise<{ spec: DocumentSpec; compiled: CompiledDocument }> {
  const spec = parseSpec(input);
  const dims = await inspectImage(spec.image.source, baseDir);
  return { spec, compiled: compileSpec(spec, dims) };
}

export interface RenderResult {
  png: Buffer;
  width: number;
  height: number;
  markdown: string;
  compiled: CompiledDocument;
}

/**
 * Renders a spec at the image's natural resolution; `scale` resamples the final PNG (e.g. 2 for a 2x export).
 */
export async function renderSpec(input: unknown, options: { baseDir?: string; scale?: number } = {}): Promise<RenderResult> {
  const { compiled } = await compileSpecWithImage(input, options.baseDir);
  const backend = createNodeBackend(options.baseDir);
  const canvas = await renderCompositeCanvas(
    {
      id: 'spec-image',
      src: compiled.image.source,
      naturalWidth: compiled.image.width,
      naturalHeight: compiled.image.height,
      fileName: path.basename(compiled.image.source),
      fileSize: 0,
    },
    compiled.annotations,
    [],
    { backend, frame: compiled.frame }
  );
  const outputScale = options.scale ?? 1;
  const output =
    outputScale === 1
      ? { png: encodePng(canvas), width: canvas.width, height: canvas.height }
      : await resizePng(encodePng(canvas), outputScale);
  return {
    ...output,
    markdown: serializeAnnotationsToMarkdown(compiled.annotations, 'list'),
    compiled,
  };
}

async function resizePng(png: Buffer, ratio: number): Promise<{ png: Buffer; width: number; height: number }> {
  const img = await decodeImage(`data:image/png;base64,${png.toString('base64')}`);
  const width = Math.max(1, Math.round(img.width * ratio));
  const height = Math.max(1, Math.round(img.height * ratio));
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  return { png: canvas.toBuffer('image/png'), width, height };
}

/**
 * Downscales a PNG so its longer side is at most maxSide pixels (for vision-model previews).
 */
export async function downscalePng(
  png: Buffer,
  maxSide: number,
  size?: { width: number; height: number }
): Promise<{ png: Buffer; width: number; height: number }> {
  const { width, height } = size ?? (await decodeImage(`data:image/png;base64,${png.toString('base64')}`));
  const ratio = maxSide / Math.max(width, height);
  return ratio >= 1 ? { png, width, height } : resizePng(png, ratio);
}
