import {
  Point,
  BoxGeometry,
  EllipseGeometry,
  PinGeometry,
  AnnotationGeometry,
  Annotation,
} from '../types';
import { type PinDimensions, getPinDimensions } from './badges';
import { layoutTextLabel } from './text';

export type { PinDimensions };
export { getPinDimensions };

export type HandleType =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'start'
  | 'end'
  | 'pin';

export interface ResizeHandle {
  id: HandleType;
  x: number;
  y: number;
  cursor: string;
}

export interface ArrowheadData {
  tip: Point;
  wingLeft: Point;
  wingRight: Point;
  left: Point;
  right: Point;
  notch: Point;
  shaftEnd: Point;
  headingRad: number;
  headLength: number;
  headWidth: number;
  pathString: string;
  casingStrokeWidth?: number;
}

export interface BoundingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Normalizes two arbitrary drag points into a valid top-left based BoxGeometry.
 */
export function normalizeBox(start: Point, current: Point): BoxGeometry {
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);

  return {
    type: 'box',
    x,
    y,
    width,
    height,
  };
}

/**
 * Calculates EllipseGeometry from start and current points, optionally constraining to a circle.
 */
export function calculateEllipseBounds(
  start: Point,
  current: Point,
  constrainToCircle: boolean = false
): EllipseGeometry {
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);

  if (constrainToCircle) {
    const diameter = Math.max(width, height);
    const radius = diameter / 2;
    const signX = current.x >= start.x ? 1 : -1;
    const signY = current.y >= start.y ? 1 : -1;

    return {
      type: 'ellipse',
      cx: start.x + signX * radius,
      cy: start.y + signY * radius,
      rx: radius,
      ry: radius,
    };
  }

  return {
    type: 'ellipse',
    cx: Math.min(start.x, current.x) + width / 2,
    cy: Math.min(start.y, current.y) + height / 2,
    rx: width / 2,
    ry: height / 2,
  };
}

/**
 * Calculates Arrowhead geometry with aerodynamic 30-degree wings and recessed notch.
 */
export function calculateArrowhead(
  start: Point,
  end: Point,
  strokeWidth: number = 6
): ArrowheadData {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const headingRad = Math.atan2(dy, dx);
  const wingAngleRad = Math.PI / 6; // 30 degrees

  // Base head length scaled by stroke width with min/max clamp (28px for default 6px stroke)
  const baseHeadLength = Math.min(Math.max(16 + strokeWidth * 2, 14), 36);
  // If the arrow is short, clamp head length to prevent arrow inversion
  const headLength = length > 0 ? Math.min(baseHeadLength, length * 0.45) : baseHeadLength;
  const headWidth = headLength;

  const wingLeft: Point = {
    x: end.x - headLength * Math.cos(headingRad + wingAngleRad),
    y: end.y - headLength * Math.sin(headingRad + wingAngleRad),
  };

  const wingRight: Point = {
    x: end.x - headLength * Math.cos(headingRad - wingAngleRad),
    y: end.y - headLength * Math.sin(headingRad - wingAngleRad),
  };

  const notch: Point = {
    x: end.x - headLength * 0.75 * Math.cos(headingRad),
    y: end.y - headLength * 0.75 * Math.sin(headingRad),
  };

  // Recess shaftEnd by strokeWidth * 0.5 backward from notch along arrow heading vector
  // so round linecap touches notch apex without penetrating past it or bleeding into wing cutouts.
  const clearance = strokeWidth * 0.5;
  const distToNotch = length - headLength * 0.75;
  const shaftLength = distToNotch - clearance;

  // Guard short vectors: if total distance is less than or equal to headLength, clamp shaftEnd to start
  const shaftEnd: Point = (length <= headLength || shaftLength <= 0 || length === 0)
    ? { x: start.x, y: start.y }
    : {
        x: notch.x - clearance * Math.cos(headingRad),
        y: notch.y - clearance * Math.sin(headingRad),
      };

  const pathString = `M ${end.x} ${end.y} L ${wingLeft.x} ${wingLeft.y} L ${notch.x} ${notch.y} L ${wingRight.x} ${wingRight.y} Z`;

  return {
    tip: end,
    wingLeft,
    wingRight,
    left: wingLeft,
    right: wingRight,
    notch,
    shaftEnd,
    headingRad,
    headLength,
    headWidth,
    pathString,
    casingStrokeWidth: strokeWidth + 3.5,
  };
}

/**
 * Returns the axis-aligned bounding box (AABB) of a callout pin with resolution scale.
 */
export function getPinBoundingBox(geometry: PinGeometry, scale: number = 1.0): BoundingRect {
  const safeScale = typeof scale === 'number' && Number.isFinite(scale) && scale > 0 ? scale : 1.0;
  const headRadius = Math.round(14 * safeScale);
  const pointerHeight = Math.round(20 * safeScale);
  return {
    x: geometry.x - headRadius,
    y: geometry.y - (headRadius + pointerHeight),
    width: 2 * headRadius,
    height: headRadius + pointerHeight,
  };
}

/**
 * Returns the axis-aligned bounding box (AABB) of any annotation geometry with optional resolution scale.
 */
export function getGeometryBoundingBox(geometry: AnnotationGeometry, scale: number = 1.0): BoundingRect {
  switch (geometry.type) {
    case 'box':
    case 'highlight':
    case 'blur':
      return {
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
      };
    case 'ellipse':
      return {
        x: geometry.cx - geometry.rx,
        y: geometry.cy - geometry.ry,
        width: geometry.rx * 2,
        height: geometry.ry * 2,
      };
    case 'arrow': {
      const minX = Math.min(geometry.startX, geometry.endX);
      const minY = Math.min(geometry.startY, geometry.endY);
      const maxX = Math.max(geometry.startX, geometry.endX);
      const maxY = Math.max(geometry.startY, geometry.endY);
      return {
        x: minX,
        y: minY,
        width: Math.max(maxX - minX, 1),
        height: Math.max(maxY - minY, 1),
      };
    }
    case 'pin':
      return getPinBoundingBox(geometry, scale);
    case 'text':
      return layoutTextLabel(geometry).box;
  }
}

/**
 * Returns resize handle positions and cursors for a given annotation geometry.
 */
export function getResizeHandlePositions(geometry: AnnotationGeometry): ResizeHandle[] {
  switch (geometry.type) {
    case 'box':
    case 'highlight':
    case 'blur': {
      const { x, y, width: w, height: h } = geometry;
      return [
        { id: 'nw', x, y, cursor: 'nwse-resize' },
        { id: 'n', x: x + w / 2, y, cursor: 'ns-resize' },
        { id: 'ne', x: x + w, y, cursor: 'nesw-resize' },
        { id: 'e', x: x + w, y: y + h / 2, cursor: 'ew-resize' },
        { id: 'se', x: x + w, y: y + h, cursor: 'nwse-resize' },
        { id: 's', x: x + w / 2, y: y + h, cursor: 'ns-resize' },
        { id: 'sw', x, y: y + h, cursor: 'nesw-resize' },
        { id: 'w', x, y: y + h / 2, cursor: 'ew-resize' },
      ];
    }
    case 'ellipse': {
      const { cx, cy, rx, ry } = geometry;
      const x = cx - rx;
      const y = cy - ry;
      const w = rx * 2;
      const h = ry * 2;
      return [
        { id: 'nw', x, y, cursor: 'nwse-resize' },
        { id: 'n', x: cx, y, cursor: 'ns-resize' },
        { id: 'ne', x: x + w, y, cursor: 'nesw-resize' },
        { id: 'e', x: x + w, y: cy, cursor: 'ew-resize' },
        { id: 'se', x: x + w, y: y + h, cursor: 'nwse-resize' },
        { id: 's', x: cx, y: y + h, cursor: 'ns-resize' },
        { id: 'sw', x, y: y + h, cursor: 'nesw-resize' },
        { id: 'w', x, y: cy, cursor: 'ew-resize' },
      ];
    }
    case 'arrow': {
      return [
        { id: 'start', x: geometry.startX, y: geometry.startY, cursor: 'move' },
        { id: 'end', x: geometry.endX, y: geometry.endY, cursor: 'crosshair' },
      ];
    }
    case 'pin': {
      return [{ id: 'pin', x: geometry.x, y: geometry.y, cursor: 'move' }];
    }
    case 'text':
      // Text labels are move-only
      return [];
  }
}

/**
 * Calculates perpendicular distance from a point to a line segment.
 */
export function pointToSegmentDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const u = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq));
  const projX = start.x + u * dx;
  const projY = start.y + u * dy;

  return Math.hypot(point.x - projX, point.y - projY);
}

/**
 * Hit-tests whether a point in image space intersects an annotation, with resolution scale support.
 */
export function hitTestAnnotation(
  point: Point,
  annotation: Annotation | AnnotationGeometry,
  tolerance: number = 6,
  scale: number = 1.0
): boolean {
  const geom: AnnotationGeometry = 'geometry' in annotation ? annotation.geometry : annotation;

  switch (geom.type) {
    case 'box':
    case 'highlight':
    case 'blur': {
      const { x, y, width, height } = geom;
      const inBounds =
        point.x >= x - tolerance &&
        point.x <= x + width + tolerance &&
        point.y >= y - tolerance &&
        point.y <= y + height + tolerance;
      return inBounds;
    }
    case 'ellipse': {
      const { cx, cy, rx, ry } = geom;
      if (rx === 0 || ry === 0) return false;
      const dx = point.x - cx;
      const dy = point.y - cy;
      // Normalized distance squared <= 1.0 with tolerance
      const effectiveRx = rx + tolerance;
      const effectiveRy = ry + tolerance;
      return (dx * dx) / (effectiveRx * effectiveRx) + (dy * dy) / (effectiveRy * effectiveRy) <= 1.0;
    }
    case 'arrow': {
      const dist = pointToSegmentDistance(
        point,
        { x: geom.startX, y: geom.startY },
        { x: geom.endX, y: geom.endY }
      );
      return dist <= tolerance;
    }
    case 'pin': {
      const safeScale = typeof scale === 'number' && Number.isFinite(scale) && scale > 0 ? scale : 1.0;
      const headRadius = Math.round(14 * safeScale);
      const pointerHeight = Math.round(20 * safeScale);
      const headCenterY = geom.y - pointerHeight;
      const distHead = Math.hypot(point.x - geom.x, point.y - headCenterY);
      const distAnchor = Math.hypot(point.x - geom.x, point.y - geom.y);
      const distStem = pointToSegmentDistance(
        point,
        { x: geom.x, y: geom.y },
        { x: geom.x, y: headCenterY }
      );
      return distHead <= headRadius + tolerance || distAnchor <= tolerance || distStem <= tolerance;
    }
    case 'text': {
      const { x, y, width, height } = layoutTextLabel(geom).box;
      return (
        point.x >= x - tolerance &&
        point.x <= x + width + tolerance &&
        point.y >= y - tolerance &&
        point.y <= y + height + tolerance
      );
    }
  }
}

/**
 * Hit-tests whether a point is over a resize handle.
 */
export function hitTestHandle(
  point: Point,
  handles: ResizeHandle[],
  handleRadius: number = 8
): HandleType | null {
  for (const handle of handles) {
    const dist = Math.hypot(point.x - handle.x, point.y - handle.y);
    if (dist <= handleRadius) {
      return handle.id;
    }
  }
  return null;
}

/**
 * Applies handle drag transformation to resize an annotation geometry.
 */
export function applyHandleResize(
  initialGeometry: AnnotationGeometry,
  handle: HandleType,
  currentPoint: Point,
  constrainAspect: boolean = false
): AnnotationGeometry {
  switch (initialGeometry.type) {
    case 'box':
    case 'highlight':
    case 'blur': {
      let { x, y, width, height } = initialGeometry;
      const right = x + width;
      const bottom = y + height;

      switch (handle) {
        case 'nw':
          x = currentPoint.x;
          y = currentPoint.y;
          width = right - currentPoint.x;
          height = bottom - currentPoint.y;
          break;
        case 'n':
          y = currentPoint.y;
          height = bottom - currentPoint.y;
          break;
        case 'ne':
          y = currentPoint.y;
          width = currentPoint.x - x;
          height = bottom - currentPoint.y;
          break;
        case 'e':
          width = currentPoint.x - x;
          break;
        case 'se':
          width = currentPoint.x - x;
          height = currentPoint.y - y;
          break;
        case 's':
          height = currentPoint.y - y;
          break;
        case 'sw':
          x = currentPoint.x;
          width = right - currentPoint.x;
          height = currentPoint.y - y;
          break;
        case 'w':
          x = currentPoint.x;
          width = right - currentPoint.x;
          break;
      }

      // Handle flipping across axes
      const normX = width < 0 ? x + width : x;
      const normY = height < 0 ? y + height : y;
      let normW = Math.abs(width);
      let normH = Math.abs(height);

      if (constrainAspect) {
        const side = Math.max(normW, normH);
        normW = side;
        normH = side;
      }

      return {
        type: initialGeometry.type,
        x: normX,
        y: normY,
        width: Math.max(normW, 2),
        height: Math.max(normH, 2),
        ...(initialGeometry.borderRadius !== undefined ? { borderRadius: initialGeometry.borderRadius } : {}),
      };
    }

    case 'ellipse': {
      const box = getGeometryBoundingBox(initialGeometry);
      const resizedBox = applyHandleResize(
        { type: 'box', x: box.x, y: box.y, width: box.width, height: box.height },
        handle,
        currentPoint,
        constrainAspect
      ) as BoxGeometry;

      return {
        type: 'ellipse',
        cx: resizedBox.x + resizedBox.width / 2,
        cy: resizedBox.y + resizedBox.height / 2,
        rx: resizedBox.width / 2,
        ry: resizedBox.height / 2,
      };
    }

    case 'arrow': {
      if (handle === 'start') {
        return {
          ...initialGeometry,
          startX: currentPoint.x,
          startY: currentPoint.y,
        };
      } else if (handle === 'end') {
        return {
          ...initialGeometry,
          endX: currentPoint.x,
          endY: currentPoint.y,
        };
      }
      return initialGeometry;
    }

    case 'pin': {
      return {
        type: 'pin',
        x: currentPoint.x,
        y: currentPoint.y,
      };
    }

    case 'text':
      return initialGeometry;
  }
}

/**
 * Translates an annotation geometry by deltaX and deltaY in natural image coordinates.
 */
export function translateGeometry(
  geometry: AnnotationGeometry,
  deltaX: number,
  deltaY: number
): AnnotationGeometry {
  switch (geometry.type) {
    case 'box':
    case 'highlight':
    case 'blur':
      return {
        ...geometry,
        x: geometry.x + deltaX,
        y: geometry.y + deltaY,
      };
    case 'ellipse':
      return {
        ...geometry,
        cx: geometry.cx + deltaX,
        cy: geometry.cy + deltaY,
      };
    case 'arrow':
      return {
        ...geometry,
        startX: geometry.startX + deltaX,
        startY: geometry.startY + deltaY,
        endX: geometry.endX + deltaX,
        endY: geometry.endY + deltaY,
      };
    case 'pin':
    case 'text':
      return {
        ...geometry,
        x: geometry.x + deltaX,
        y: geometry.y + deltaY,
      };
  }
}
