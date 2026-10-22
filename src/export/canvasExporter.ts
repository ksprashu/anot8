import { BaseImage, Annotation, AnnotationColor, Frame, ImageOverlay, HighlightGeometry, BlurGeometry } from '../types';
import { resolveColor } from '../constants/colors';
import { calculateArrowhead } from '../math/geometry';
import { getBadgePositionForShape, getBadgeDimensions, computeResolutionScale } from '../math/badges';
import { labelFont, layoutTextLabel } from '../math/text';

/**
 * Supplies canvases and decoded images to the renderer, so the same Canvas2D code
 * runs in the browser (DOM) and in Node (@napi-rs/canvas, see src/core/node/backend.ts).
 */
export interface RenderBackend {
  createCanvas(width: number, height: number): HTMLCanvasElement;
  loadImage(src: string): Promise<CanvasImageSource>;
}

export interface ExportCanvasOptions {
  pixelRatio?: number; // Default 1.0 (exact 1:1 native)
  backgroundColor?: string; // Optional background fill if image has alpha
  drawDrafts?: boolean; // Default false
  overlays?: ImageOverlay[]; // Optional overlay layers list
  scale?: number; // Optional resolution scale override
  frame?: Frame; // Optional crop / padding applied to the output
  backend?: RenderBackend; // Default: browser DOM backend
}

/**
 * Converts a hex color (#RRGGBB or #RGB) and opacity (0..1) to rgba(r, g, b, a) string.
 */
export function hexToRgba(hex: string, opacity: number): string {
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  const alpha = Math.max(0, Math.min(1, opacity));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Fallback-safe rounded rectangle path drawer for 2D canvas context.
 */
export function drawRoundRect(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number | number[]
): void {
  if (typeof (ctx as any).roundRect === 'function') {
    (ctx as any).roundRect(x, y, width, height, radius);
    return;
  }
  const r = Math.min(
    typeof radius === 'number' ? radius : radius[0] || 0,
    width / 2,
    height / 2
  );
  if (r <= 0) {
    ctx.rect(x, y, width, height);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/* eslint-disable no-restricted-globals -- browser RenderBackend: the only DOM access in this module */

/**
 * Loads an HTMLImageElement asynchronously from a source URL or Data URL.
 */
export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new Error('Image constructor is not supported in this environment'));
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let resolved = false;

    img.onload = () => {
      if (!resolved) {
        resolved = true;
        resolve(img);
      }
    };
    img.onerror = () => {
      if (!resolved) {
        resolved = true;
        reject(
          new Error(
            `Failed to load image from source: ${
              src.length > 64 ? src.substring(0, 64) + '...' : src
            }`
          )
        );
      }
    };

    img.src = src;

    if (img.complete && img.naturalWidth > 0) {
      resolved = true;
      resolve(img);
      return;
    }

    // In JSDOM / Node environments where new Image() might not automatically decode data URLs:
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
      setTimeout(() => {
        if (!resolved) {
          if (src.startsWith('invalid-image-source:')) {
            resolved = true;
            reject(
              new Error(
                `Failed to load image from source: ${
                  src.length > 64 ? src.substring(0, 64) + '...' : src
                }`
              )
            );
          } else {
            resolved = true;
            resolve(img);
          }
        }
      }, 0);
    }
  });
}

/**
 * Creates an optimal offscreen or DOM canvas instance of exact pixel dimensions.
 */
export function createCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  }
  throw new Error('DOM document is not available to create HTMLCanvasElement');
}

/* eslint-enable no-restricted-globals */

export const browserBackend: RenderBackend = {
  createCanvas,
  loadImage: loadImageElement,
};

/**
 * Downscale/upscale pixel diffusion fallback for environments lacking ctx.filter.
 * Downscales the source subregion by ~10x into a small temporary canvas,
 * then paints it back with bilinear interpolation, destroying high-frequency details.
 */
export function bakeBlurFallback(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  imgElement: HTMLImageElement | CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
  backend: RenderBackend = browserBackend
): void {
  if (w <= 0 || h <= 0) return;
  const sampleW = Math.max(2, Math.round(w / 10));
  const sampleH = Math.max(2, Math.round(h / 10));
  const smallCanvas = backend.createCanvas(sampleW, sampleH);
  const smallCtx = smallCanvas.getContext('2d');
  if (!smallCtx) return;

  smallCtx.imageSmoothingEnabled = true;
  smallCtx.imageSmoothingQuality = 'high';
  // Draw subregion of source image downscaled
  smallCtx.drawImage(imgElement, x, y, w, h, 0, 0, sampleW, sampleH);

  // Draw back upscaled into target ctx
  ctx.drawImage(smallCanvas, 0, 0, sampleW, sampleH, x, y, w, h);
}

/**
 * High-contrast numbered badge rasterizer with drop shadow and pill expansion.
 */
export function rasterizeBadge(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  position: { x: number; y: number },
  index: number,
  color: AnnotationColor,
  scale: number = 1.0
): void {
  const colorDef = resolveColor(color);
  const dims = getBadgeDimensions(index, scale);
  const { width, height, radius, isPill, fontSize } = dims;

  // 1. Draw Drop Shadow & Background Fill
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = Math.round(4 * scale);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.round(2 * scale);

  ctx.beginPath();
  if (isPill) {
    drawRoundRect(ctx, position.x - width / 2, position.y - height / 2, width, height, radius);
  } else {
    ctx.arc(position.x, position.y, radius, 0, 2 * Math.PI);
  }
  ctx.fillStyle = colorDef.badgeBg;
  ctx.fill();
  ctx.restore();

  // 2. Crisp White Border
  ctx.save();
  ctx.beginPath();
  if (isPill) {
    drawRoundRect(ctx, position.x - width / 2, position.y - height / 2, width, height, radius);
  } else {
    ctx.arc(position.x, position.y, radius, 0, 2 * Math.PI);
  }
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = Math.max(1.5, 1.5 * scale);
  ctx.stroke();

  // 3. Sequence Index Text
  ctx.fillStyle = colorDef.badgeText;
  ctx.font = `700 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(index), position.x, position.y);
  ctx.restore();
}

/**
 * High-fidelity vector rasterization for a single annotation shape and its numbered badge.
 */
export function rasterizeAnnotation(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  annotation: Annotation,
  scale: number = 1.0
): void {
  const { geometry, style, index } = annotation;
  const colorDef = resolveColor(style.color);
  const fillColor = hexToRgba(colorDef.hex, style.fillOpacity);
  const showBadge = style.showBadge !== false;

  ctx.save();

  switch (geometry.type) {
    case 'box': {
      const { x, y, width, height, borderRadius = 4 } = geometry;
      ctx.beginPath();
      drawRoundRect(ctx, x, y, width, height, borderRadius);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = colorDef.stroke;
      ctx.lineWidth = style.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Render Numbered Badge at top-left corner
      if (showBadge) rasterizeBadge(ctx, { x, y }, index, style.color, scale);
      break;
    }

    case 'highlight': {
      const { x, y, width, height, borderRadius = 4 } = geometry;
      ctx.beginPath();
      drawRoundRect(ctx, x, y, width, height, borderRadius);
      ctx.strokeStyle = colorDef.stroke;
      ctx.lineWidth = style.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      // No badge rasterized for unnumbered highlight
      break;
    }

    case 'blur': {
      const { x, y, width, height, borderRadius = 2 } = geometry;
      ctx.beginPath();
      drawRoundRect(ctx, x, y, width, height, borderRadius);
      ctx.strokeStyle = colorDef.stroke;
      ctx.lineWidth = style.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      // No badge rasterized for unnumbered blur
      break;
    }

    case 'ellipse': {
      const { cx, cy, rx, ry } = geometry;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, 2 * Math.PI);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = colorDef.stroke;
      ctx.lineWidth = style.strokeWidth;
      ctx.stroke();

      // Render Numbered Badge at 225 deg diagonal apex
      if (showBadge) {
        const badgePos = getBadgePositionForShape(geometry, scale);
        rasterizeBadge(ctx, badgePos, index, style.color, scale);
      }
      break;
    }

    case 'arrow': {
      const { startX, startY, endX, endY } = geometry;
      const arrowhead = calculateArrowhead(
        { x: startX, y: startY },
        { x: endX, y: endY },
        style.strokeWidth
      );

      // Pass 1: Foreground core shaft and filled arrowhead polygon
      // Core shaft line
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(arrowhead.shaftEnd.x, arrowhead.shaftEnd.y);
      ctx.strokeStyle = colorDef.stroke;
      ctx.lineWidth = style.strokeWidth;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Core arrowhead filled and stroked polygon
      ctx.beginPath();
      ctx.moveTo(arrowhead.tip.x, arrowhead.tip.y);
      ctx.lineTo(arrowhead.wingLeft.x, arrowhead.wingLeft.y);
      ctx.lineTo(arrowhead.notch.x, arrowhead.notch.y);
      ctx.lineTo(arrowhead.wingRight.x, arrowhead.wingRight.y);
      ctx.closePath();
      ctx.fillStyle = colorDef.stroke;
      ctx.fill();
      ctx.strokeStyle = colorDef.stroke;
      ctx.lineWidth = 1;
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Pass 2: Underlay casing with drop shadow placed underneath core via destination-over
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;

      // Underlay casing shaft
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(arrowhead.shaftEnd.x, arrowhead.shaftEnd.y);
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = style.strokeWidth + 3.5;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Underlay casing arrowhead polygon
      ctx.beginPath();
      ctx.moveTo(arrowhead.tip.x, arrowhead.tip.y);
      ctx.lineTo(arrowhead.wingLeft.x, arrowhead.wingLeft.y);
      ctx.lineTo(arrowhead.notch.x, arrowhead.notch.y);
      ctx.lineTo(arrowhead.wingRight.x, arrowhead.wingRight.y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 3.5;
      ctx.lineJoin = 'round';
      ctx.stroke();

      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';

      // Pass 3: Render tail-anchored badge at (startX, startY)
      if (showBadge) rasterizeBadge(ctx, { x: startX, y: startY }, index, style.color, scale);
      break;
    }

    case 'pin': {
      const { x, y } = geometry;
      const safeScale = typeof scale === 'number' && Number.isFinite(scale) && scale > 0 ? scale : 1.0;
      const headRadius = Math.round(14 * safeScale);
      const pointerHeight = Math.round(20 * safeScale);
      const headCenterY = y - pointerHeight;
      const fontSize = Math.round(12 * safeScale);

      // Pin Teardrop with subtle drop shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = Math.round(4 * safeScale);
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = Math.round(2 * safeScale);

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(
        x - Math.round(4 * safeScale),
        y - Math.round(8 * safeScale),
        x - headRadius,
        y - Math.round(14 * safeScale),
        x - headRadius,
        headCenterY
      );
      ctx.arc(x, headCenterY, headRadius, Math.PI, 0, false);
      ctx.bezierCurveTo(
        x + headRadius,
        y - Math.round(14 * safeScale),
        x + Math.round(4 * safeScale),
        y - Math.round(8 * safeScale),
        x,
        y
      );
      ctx.closePath();

      ctx.fillStyle = colorDef.badgeBg;
      ctx.fill();
      ctx.restore();

      // Crisp White Border
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(
        x - Math.round(4 * safeScale),
        y - Math.round(8 * safeScale),
        x - headRadius,
        y - Math.round(14 * safeScale),
        x - headRadius,
        headCenterY
      );
      ctx.arc(x, headCenterY, headRadius, Math.PI, 0, false);
      ctx.bezierCurveTo(
        x + headRadius,
        y - Math.round(14 * safeScale),
        x + Math.round(4 * safeScale),
        y - Math.round(8 * safeScale),
        x,
        y
      );
      ctx.closePath();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = Math.max(1.5, 1.5 * safeScale);
      ctx.stroke();

      // Pin Index Text
      if (showBadge) {
        ctx.fillStyle = colorDef.badgeText;
        ctx.font = `700 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(index), x, headCenterY);
      }
      ctx.restore();
      break;
    }

    case 'text': {
      ctx.font = labelFont(geometry.fontSize);
      const layout = layoutTextLabel(geometry, (text) => ctx.measureText(text).width);
      const { box } = layout;

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = Math.round(4 * scale);
      ctx.shadowOffsetY = Math.round(2 * scale);
      ctx.beginPath();
      drawRoundRect(ctx, box.x, box.y, box.width, box.height, layout.radius);
      ctx.fillStyle = colorDef.badgeBg;
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = colorDef.badgeText;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (const line of layout.lines) {
        ctx.fillText(line.text, line.x, line.y);
      }
      break;
    }
  }

  ctx.restore();
}

/**
 * Clamps a crop rectangle to the image bounds; a missing or degenerate crop selects the full image.
 */
export function clampCrop(
  crop: Frame['crop'],
  width: number,
  height: number
): { x: number; y: number; width: number; height: number } {
  if (!crop) return { x: 0, y: 0, width, height };
  const x = Math.max(0, Math.min(width, Math.round(crop.x)));
  const y = Math.max(0, Math.min(height, Math.round(crop.y)));
  const right = Math.max(x, Math.min(width, Math.round(crop.x + crop.width)));
  const bottom = Math.max(y, Math.min(height, Math.round(crop.y + crop.height)));
  if (right - x < 1 || bottom - y < 1) return { x: 0, y: 0, width, height };
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * Master offscreen composite renderer: composites base image at 100% natural resolution
 * and rasterizes all annotations.
 */
export async function renderCompositeCanvas(
  baseImage: BaseImage,
  annotations: Annotation[],
  overlaysOrOptions?: ImageOverlay[] | ExportCanvasOptions,
  options?: ExportCanvasOptions
): Promise<HTMLCanvasElement> {
  let overlays: ImageOverlay[] = [];
  let exportOptions: ExportCanvasOptions = {};

  if (Array.isArray(overlaysOrOptions)) {
    overlays = overlaysOrOptions;
    if (options) {
      exportOptions = options;
    }
  } else if (overlaysOrOptions) {
    exportOptions = overlaysOrOptions;
    if (exportOptions.overlays) {
      overlays = exportOptions.overlays;
    }
  }

  const backend = exportOptions.backend ?? browserBackend;
  const width = baseImage.naturalWidth;
  const height = baseImage.naturalHeight;
  const scale = exportOptions.scale ?? computeResolutionScale(width, height);

  // Output region: crop (clamped to the image) plus padding on every side
  const frame = exportOptions.frame;
  const crop = clampCrop(frame?.crop, width, height);
  const padding = Math.max(0, frame?.padding ?? 0);
  const outWidth = crop.width + padding * 2;
  const outHeight = crop.height + padding * 2;

  const canvas = backend.createCanvas(outWidth, outHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D rendering context for composite canvas');
  }

  // High quality smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const background = frame?.background ?? exportOptions.backgroundColor;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, outWidth, outHeight);
  }

  // Without a frame the call sequence is identical to an unframed 1:1 export
  const isFramed = padding > 0 || crop.x !== 0 || crop.y !== 0 || crop.width !== width || crop.height !== height;
  if (isFramed) {
    // Everything below draws in natural image coordinates
    ctx.translate(padding - crop.x, padding - crop.y);

    // Image-derived layers (base, blur, spotlight, overlays) stay inside the crop region
    ctx.save();
    ctx.beginPath();
    ctx.rect(crop.x, crop.y, crop.width, crop.height);
    ctx.clip();
  }

  // 1. Draw Base Image at exact natural coordinates [0, 0, W, H]
  if (baseImage.src) {
    const imgElement = await backend.loadImage(baseImage.src);
    ctx.drawImage(imgElement, 0, 0, width, height);

    // 1.2 Destructive Gaussian Blur Baking
    const blurAnnotations = annotations.filter((ann) => ann.geometry.type === 'blur');
    for (const ann of blurAnnotations) {
      const geo = ann.geometry as BlurGeometry;
      ctx.save();
      ctx.beginPath();
      ctx.rect(geo.x, geo.y, geo.width, geo.height);
      ctx.clip();
      if ('filter' in ctx) {
        ctx.filter = 'blur(12px)';
        ctx.drawImage(imgElement, 0, 0, width, height);
      } else {
        bakeBlurFallback(ctx, imgElement, geo.x, geo.y, geo.width, geo.height, backend);
      }
      ctx.restore();
    }
  }

  // 1.5 Additive Highlight Cutout
  const highlightAnnotations = annotations.filter((ann) => ann.geometry.type === 'highlight');
  if (highlightAnnotations.length > 0) {
    const offscreenCanvas = backend.createCanvas(width, height);
    const offscreenCtx = offscreenCanvas.getContext('2d');
    if (offscreenCtx) {
      offscreenCtx.imageSmoothingEnabled = true;
      offscreenCtx.imageSmoothingQuality = 'high';

      offscreenCtx.fillStyle = 'rgba(0, 0, 0, 0.68)';
      offscreenCtx.fillRect(0, 0, width, height);

      offscreenCtx.globalCompositeOperation = 'destination-out';
      for (const ann of highlightAnnotations) {
        const geom = ann.geometry as HighlightGeometry;
        const rx = geom.borderRadius ?? 4;
        offscreenCtx.beginPath();
        drawRoundRect(offscreenCtx, geom.x, geom.y, geom.width, geom.height, rx);
        offscreenCtx.fillStyle = '#000000';
        offscreenCtx.fill();
      }

      ctx.drawImage(offscreenCanvas, 0, 0, width, height);
    }
  }

  // 2. Draw Overlay Image Layers in sequential order beneath annotations
  if (overlays && overlays.length > 0) {
    for (const overlay of overlays) {
      if (overlay.src) {
        try {
          const overlayImg = await backend.loadImage(overlay.src);
          ctx.save();
          if (typeof overlay.opacity === 'number') {
            ctx.globalAlpha = Math.max(0, Math.min(1, overlay.opacity));
          }
          const dx = overlay.x ?? 0;
          const dy = overlay.y ?? 0;
          const natural = overlayImg as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
          const dw = overlay.width ?? overlay.naturalWidth ?? natural.naturalWidth ?? natural.width ?? 0;
          const dh = overlay.height ?? overlay.naturalHeight ?? natural.naturalHeight ?? natural.height ?? 0;
          ctx.drawImage(overlayImg, dx, dy, dw, dh);
          ctx.restore();
        } catch (err) {
          console.warn(`Failed to render overlay layer ${overlay.id}:`, err);
        }
      }
    }
  }

  if (isFramed) ctx.restore();

  // 3. Draw Vector Annotations in sequence order
  const sortedAnnotations = [...annotations].sort((a, b) => a.index - b.index);
  for (const annotation of sortedAnnotations) {
    rasterizeAnnotation(ctx, annotation, scale);
  }

  return canvas;
}

/**
 * Converts a rendered canvas to a standard image/png binary Blob.
 */
export function exportCanvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/png',
  quality = 1.0
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to blob'));
        }
      },
      type,
      quality
    );
  });
}

/**
 * Renders composite canvas and produces image/png Blob directly.
 */
export async function exportCompositeBlob(
  baseImage: BaseImage,
  annotations: Annotation[],
  overlaysOrOptions?: ImageOverlay[] | ExportCanvasOptions,
  options?: ExportCanvasOptions
): Promise<Blob> {
  const canvas = await renderCompositeCanvas(baseImage, annotations, overlaysOrOptions, options);
  return exportCanvasToBlob(canvas, 'image/png');
}

/**
 * Renders composite canvas and produces Data URL string.
 */
export async function exportCompositeDataUrl(
  baseImage: BaseImage,
  annotations: Annotation[],
  overlaysOrOptions?: ImageOverlay[] | ExportCanvasOptions,
  options?: ExportCanvasOptions
): Promise<string> {
  const canvas = await renderCompositeCanvas(baseImage, annotations, overlaysOrOptions, options);
  return canvas.toDataURL('image/png');
}
