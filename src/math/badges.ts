import { Point, AnnotationGeometry } from '../types';

export interface BadgeDimensions {
  width: number;
  height: number;
  radius: number;
  isPill: boolean;
  fontSize: number;
}

export interface PinDimensions {
  headRadius: number;
  pointerHeight: number;
  width: number;
  height: number;
  fontSize: number;
  anchorOffset: number;
}

/**
 * Computes a resolution scale factor based on natural image dimensions.
 * Baseline reference is 1440px (major axis). Clamped to [1.0, 4.0].
 * Defaults to 1.0 when width/height are invalid or sub-baseline for full backward compatibility.
 */
export function computeResolutionScale(width?: number, height?: number): number {
  if (typeof width !== 'number' || typeof height !== 'number') return 1.0;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1.0;
  const maxDim = Math.max(width, height);
  const rawScale = maxDim / 1440;
  return Math.min(Math.max(rawScale, 1.0), 4.0);
}

/**
 * Returns scaled dimensions for callout pin markers. Defaults to scale = 1.0.
 */
export function getPinDimensions(scale: number = 1.0): PinDimensions {
  const safeScale = Math.max(1.0, Number.isFinite(scale) ? scale : 1.0);
  const headRadius = Math.round(14 * safeScale);
  const pointerHeight = Math.round(20 * safeScale);
  const width = Math.round(28 * safeScale);
  const height = headRadius + pointerHeight;
  const fontSize = Math.round(12 * safeScale);
  const anchorOffset = pointerHeight;

  return {
    headRadius,
    pointerHeight,
    width,
    height,
    fontSize,
    anchorOffset,
  };
}

/**
 * Returns the anchor point in image coordinates where the numbered badge
 * should be centered for a given annotation shape.
 * Supports scale for pin offset positioning. Defaults to scale = 1.0.
 */
export function getBadgePositionForShape(geometry: AnnotationGeometry, scale: number = 1.0): Point {
  switch (geometry.type) {
    case 'box':
    case 'highlight':
    case 'blur':
    case 'text':
      // Anchored at top-left corner
      return {
        x: geometry.x,
        y: geometry.y,
      };

    case 'ellipse': {
      // Anchored at the top-left diagonal apex (angle = 225 deg = 5pi/4)
      const cos225 = -Math.SQRT1_2; // approx -0.7071
      const sin225 = -Math.SQRT1_2;
      return {
        x: geometry.cx + geometry.rx * cos225,
        y: geometry.cy + geometry.ry * sin225,
      };
    }

    case 'arrow':
      // CRITICAL: Badge is ALWAYS placed at the tail start point so arrowhead is unobstructed
      return {
        x: geometry.startX,
        y: geometry.startY,
      };

    case 'pin': {
      const safeScale = Math.max(1.0, Number.isFinite(scale) ? scale : 1.0);
      const pointerHeight = Math.round(20 * safeScale);
      return {
        x: geometry.x,
        y: geometry.y - pointerHeight,
      };
    }
  }
}

/**
 * Computes responsive badge dimensions and pill flag based on the index number and resolution scale.
 * Defaults to scale = 1.0 for 100% backward compatibility with all existing tests.
 * Clamps minimum readable dimensions: width >= 20px, height >= 20px, fontSize >= 11px.
 */
export function getBadgeDimensions(index: number, scale: number = 1.0): BadgeDimensions {
  const safeScale = Math.max(1.0, Number.isFinite(scale) ? scale : 1.0);
  const text = String(Math.max(1, index));
  const digits = text.length;

  const baseHeight = 24;
  const baseRadius = 12;
  const baseWidth = digits <= 1 ? 24 : Math.max(32, 24 + (digits - 1) * 8);
  const baseFontSize = digits <= 1 ? 13 : 12;

  return {
    width: Math.max(20, Math.round(baseWidth * safeScale)),
    height: Math.max(20, Math.round(baseHeight * safeScale)),
    radius: Math.round(baseRadius * safeScale),
    isPill: digits > 1,
    fontSize: Math.max(11, Math.round(baseFontSize * safeScale)),
  };
}
