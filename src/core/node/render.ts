/**
 * Spec → PNG pipeline for Node, shared by the CLI and the MCP server.
 */
import path from 'node:path';
import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import { clampCrop, renderCompositeCanvas } from '../../export/canvasExporter';
import { MarkdownExportFormat, serializeAnnotationsToMarkdown, serializeToFullReport } from '../../export/markdownSerializer';
import { getGeometryBoundingBox } from '../../math/geometry';
import { computeResolutionScale } from '../../math/badges';
import { labelFont, layoutTextLabel, TextMeasurer } from '../../math/text';
import {
  compileSpec,
  CompiledDocument,
  parseSpec,
  DocumentSpec,
  SpecError,
  SPEC_VERSION,
  AnnotationSpec,
  FrameSpec,
  fileNameFromSource,
} from '../../spec';
import { assertCanvasDimensions, createNodeBackend, decodeImage, decodeImageBuffer, encodePng } from './backend';

export interface ImageInfo {
  width: number;
  height: number;
}

export async function inspectImage(source: string, baseDir?: string): Promise<ImageInfo> {
  const img = await decodeImage(source, baseDir);
  return { width: img.width, height: img.height };
}

/**
 * Inspects image dimensions for validation/apply: tolerates ENOENT only when explicit
 * image.width and image.height are already set on the spec (e.g. inline synthetic specs),
 * while surfacing corrupt files, oversized images, or blocked URLs as a SpecError.
 */
export async function inspectImageForSpec(
  spec: DocumentSpec,
  baseDir?: string
): Promise<ImageInfo | undefined> {
  const hasExplicitDims = Boolean(spec.image.width && spec.image.height);
  try {
    return await inspectImage(spec.image.source, baseDir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (hasExplicitDims && code === 'ENOENT') {
      return undefined;
    }
    const detail = err instanceof Error ? err.message : String(err);
    throw new SpecError([{ path: 'image.source', message: `Could not load image "${spec.image.source}": ${detail}` }]);
  }
}

export interface BoundingBoxSummary {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CompiledAnnotationSummary {
  id: string;
  type: string;
  index: number;
  /** Bounding box in natural base-image pixels (matches spec coordinate space). */
  bounds: BoundingBoxSummary;
  /** Bounding box in rendered output PNG pixels (included when crop, padding, or scale !== 1 is applied). */
  outputBounds?: BoundingBoxSummary;
  note?: string;
}

export interface RenderResult {
  png: Buffer;
  width: number;
  height: number;
  markdown: string;
  compiled: CompiledDocument;
  annotationSummaries: CompiledAnnotationSummary[];
}

export interface RenderSpecOptions {
  baseDir?: string;
  scale?: number;
  markdownFormat?: MarkdownExportFormat;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

let sharedMeasureCtx: SKRSContext2D | null = null;

const nodeTextMeasurer: TextMeasurer = (text, fontSize) => {
  if (!sharedMeasureCtx) {
    sharedMeasureCtx = createCanvas(1, 1).getContext('2d');
  }
  sharedMeasureCtx.font = labelFont(fontSize);
  return sharedMeasureCtx.measureText(text).width;
};

export function summarizeCompiledAnnotations(
  compiled: CompiledDocument,
  options: { scale?: number } = {}
): CompiledAnnotationSummary[] {
  const { width, height } = compiled.image;
  const resScale = computeResolutionScale(width, height);
  const outputScale = options.scale ?? 1;
  const frame = compiled.frame;
  const crop = clampCrop(frame?.crop, width, height);
  const padding = Math.max(0, frame?.padding ?? 0);
  const hasOutputTransform =
    outputScale !== 1 || padding > 0 || crop.x !== 0 || crop.y !== 0 || crop.width !== width || crop.height !== height;

  return compiled.annotations.map((a) => {
    const raw =
      a.geometry.type === 'text'
        ? layoutTextLabel(a.geometry, nodeTextMeasurer).box
        : getGeometryBoundingBox(a.geometry, resScale);
    const bounds: BoundingBoxSummary = {
      x: round2(raw.x),
      y: round2(raw.y),
      width: round2(raw.width),
      height: round2(raw.height),
    };
    const outputBounds: BoundingBoxSummary | undefined = hasOutputTransform
      ? {
          x: round2((raw.x - crop.x + padding) * outputScale),
          y: round2((raw.y - crop.y + padding) * outputScale),
          width: round2(raw.width * outputScale),
          height: round2(raw.height * outputScale),
        }
      : undefined;
    return {
      id: a.id,
      type: a.geometry.type,
      index: a.index,
      bounds,
      ...(outputBounds ? { outputBounds } : {}),
      ...(a.note ? { note: a.note } : {}),
    };
  });
}

export function renderSpecMarkdown(
  compiled: CompiledDocument,
  format: MarkdownExportFormat = 'list'
): string {
  const fileName = fileNameFromSource(compiled.image.source);
  const baseImage = {
    id: 'spec-image',
    src: compiled.image.source,
    naturalWidth: compiled.image.width,
    naturalHeight: compiled.image.height,
    fileName,
    fileSize: 0,
  };
  if (format === 'report') {
    return serializeToFullReport(compiled.annotations, baseImage);
  }
  return serializeAnnotationsToMarkdown(compiled.annotations, format, {
    imageFileName: baseImage.fileName,
  });
}

/**
 * Prepares a validated DocumentSpec for browser #spec= sharing: if image.source is a local file path,
 * re-encodes the decoded image as a PNG data URL so the browser can render it without filesystem access.
 */
export async function prepareShareableSpec(input: unknown, baseDir?: string): Promise<DocumentSpec> {
  const spec = parseSpec(input);
  const isBrowserUrl = /^(https?:\/\/|data:image\/)/i.test(spec.image.source);
  if (isBrowserUrl) {
    const dims = await inspectImageForSpec(spec, baseDir);
    const next: DocumentSpec =
      dims && (!spec.image.width || !spec.image.height)
        ? { ...spec, image: { ...spec.image, width: dims.width, height: dims.height } }
        : spec;
    compileSpec(next, dims);
    return next;
  }
  const img = await decodeImage(spec.image.source, baseDir);
  const { width, height } = assertCanvasDimensions(img.width, img.height);
  const canvas = createCanvas(width, height);
  canvas.getContext('2d').drawImage(img, 0, 0);
  const dataUrl = `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`;
  const embedded: DocumentSpec = {
    ...spec,
    image: { source: dataUrl, width, height },
  };
  compileSpec(embedded, { width, height });
  return embedded;
}

/**
 * Builds a starter DocumentSpec for an image (inspecting its natural dimensions and computing
 * a portable relative source path when outPath is provided).
 */
export async function buildStarterSpec(options: {
  image: string;
  baseDir?: string;
  outPath?: string;
  frame?: FrameSpec;
  defaults?: DocumentSpec['defaults'];
  annotations?: AnnotationSpec[];
}): Promise<{ spec: DocumentSpec; width: number; height: number }> {
  const resolvedBase = path.resolve(options.baseDir ?? process.cwd());
  const { width, height } = await inspectImage(options.image, resolvedBase);
  let source = options.image;
  const isUrlOrData = /^(https?:|data:|file:)/i.test(options.image);
  if (!isUrlOrData && options.outPath) {
    const outDir = path.dirname(path.resolve(resolvedBase, options.outPath));
    const imagePath = path.resolve(resolvedBase, options.image);
    const outRoot = path.parse(outDir).root;
    const imgRoot = path.parse(imagePath).root;
    const outFirstSeg = outDir.slice(outRoot.length).split(path.sep)[0];
    const imgFirstSeg = imagePath.slice(imgRoot.length).split(path.sep)[0];
    if (outRoot === imgRoot && outFirstSeg === imgFirstSeg) {
      const rel = path.relative(outDir, imagePath) || path.basename(imagePath);
      source = rel.split(path.sep).join('/');
    } else {
      source = imagePath;
    }
  }
  const candidate: DocumentSpec = {
    version: SPEC_VERSION,
    image: { source, width, height },
    ...(options.frame ? { frame: options.frame } : {}),
    ...(options.defaults ? { defaults: options.defaults } : {}),
    annotations: options.annotations ?? [],
  };
  const validated = parseSpec(candidate);
  compileSpec(validated, { width, height });
  return { spec: validated, width, height };
}

/**
 * Renders a spec at the image's natural resolution; `scale` resamples the final PNG (e.g. 2 for a 2x export).
 */
export async function renderSpec(input: unknown, options: RenderSpecOptions = {}): Promise<RenderResult> {
  const outputScale = options.scale ?? 1;
  if (!Number.isFinite(outputScale) || outputScale <= 0 || outputScale > 8) {
    throw new SpecError([{ path: 'scale', message: 'scale must be a positive number between 0 and 8' }]);
  }
  const spec = parseSpec(input);
  const backend = createNodeBackend(options.baseDir);
  const decoded = (await backend.loadImage(spec.image.source)) as unknown as { width: number; height: number };
  const compiled = compileSpec(spec, { width: decoded.width, height: decoded.height });
  const canvas = await renderCompositeCanvas(
    {
      id: 'spec-image',
      src: compiled.image.source,
      naturalWidth: compiled.image.width,
      naturalHeight: compiled.image.height,
      fileName: fileNameFromSource(compiled.image.source),
      fileSize: 0,
    },
    compiled.annotations,
    [],
    { backend, frame: compiled.frame }
  );
  const output =
    outputScale === 1
      ? { png: encodePng(canvas), width: canvas.width, height: canvas.height }
      : await resizePng(encodePng(canvas), outputScale);
  return {
    ...output,
    markdown: renderSpecMarkdown(compiled, options.markdownFormat ?? 'list'),
    compiled,
    annotationSummaries: summarizeCompiledAnnotations(compiled, { scale: outputScale }),
  };
}

async function resizePng(png: Buffer, ratio: number): Promise<{ png: Buffer; width: number; height: number }> {
  const img = await decodeImageBuffer(png);
  const { width, height } = assertCanvasDimensions(img.width * ratio, img.height * ratio);
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
  const { width, height } = size ?? (await decodeImageBuffer(png));
  const ratio = maxSide / Math.max(width, height);
  return ratio >= 1 ? { png, width, height } : resizePng(png, ratio);
}
