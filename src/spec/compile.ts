/**
 * Compiles an Annot8 spec into renderer-ready annotations, and converts editor state back into a spec.
 */
import { Annotation, AnnotationColor, AnnotationGeometry, BaseImage, Frame, Point } from '../types';
import {
  DEFAULT_COLOR,
  DEFAULT_FILL_OPACITY,
  DEFAULT_STROKE_WIDTH,
  normalizeGeometry,
  reindexAnnotations,
} from '../state/appReducer';
import { getGeometryBoundingBox } from '../math/geometry';
import { computeResolutionScale } from '../math/badges';
import {
  ANCHOR_PATTERN,
  AnchorPosition,
  AnnotationSpec,
  DocumentSpec,
  FrameSpec,
  PointSpec,
  SPEC_VERSION,
  SpecError,
  SpecIssue,
  parseSpec,
} from './schema';

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface CompiledDocument {
  image: { source: string; width: number; height: number };
  frame?: Frame;
  annotations: Annotation[];
}

type Coord = number | string;

function resolveCoord(value: Coord, extent: number): number {
  return typeof value === 'number' ? value : (parseFloat(value) / 100) * extent;
}

/** Default label font size: 18px at the 1440px baseline, scaled up for larger screenshots. */
export function defaultFontSize(dims: ImageDimensions): number {
  return Math.round(18 * computeResolutionScale(dims.width, dims.height));
}

function anchorPoint(geometry: AnnotationGeometry, position: AnchorPosition, scale: number): Point {
  const { x, y, width, height } = getGeometryBoundingBox(geometry, scale);
  const cx = x + width / 2;
  const cy = y + height / 2;
  switch (position) {
    case 'center':
      return { x: cx, y: cy };
    case 'top':
      return { x: cx, y };
    case 'bottom':
      return { x: cx, y: y + height };
    case 'left':
      return { x, y: cy };
    case 'right':
      return { x: x + width, y: cy };
    case 'top-left':
      return { x, y };
    case 'top-right':
      return { x: x + width, y };
    case 'bottom-left':
      return { x, y: y + height };
    case 'bottom-right':
      return { x: x + width, y: y + height };
  }
}

function anchorTarget(point: PointSpec): string | null {
  const ref = typeof point === 'string' ? point : Array.isArray(point) ? null : point.anchor;
  return ref ? (ANCHOR_PATTERN.exec(ref)?.[1] ?? null) : null;
}

function pointFields(spec: AnnotationSpec): [string, PointSpec][] {
  switch (spec.type) {
    case 'arrow':
      return [
        ['from', spec.from],
        ['to', spec.to],
      ];
    case 'pin':
    case 'text':
      return [['at', spec.at]];
    default:
      return [];
  }
}

/**
 * Assigns ids to annotations that lack one (a1, a2, ...) without colliding with explicit ids.
 */
export function assignIds(annotations: AnnotationSpec[]): string[] {
  const taken = new Set(annotations.map((a) => a.id).filter((id): id is string => Boolean(id)));
  let counter = 1;
  return annotations.map((a) => {
    if (a.id) return a.id;
    while (taken.has(`a${counter}`)) counter++;
    const id = `a${counter}`;
    taken.add(id);
    return id;
  });
}

/**
 * Validates and compiles a spec. Percentages and anchors are resolved against the image dimensions;
 * anchors may reference annotations declared later, but not form cycles.
 */
export function compileSpec(input: unknown, dims?: ImageDimensions): CompiledDocument {
  const spec = parseSpec(input);
  const width = dims?.width ?? spec.image.width;
  const height = dims?.height ?? spec.image.height;
  if (!width || !height) {
    throw new SpecError([
      { path: 'image', message: 'Image dimensions are unknown; set image.width and image.height or load the image' },
    ]);
  }
  const size = { width, height };
  const scale = computeResolutionScale(width, height);
  const defaults = spec.defaults ?? {};
  const ids = assignIds(spec.annotations);
  const issues: SpecIssue[] = [];

  const indexById = new Map<string, number>();
  ids.forEach((id, i) => {
    if (indexById.has(id)) {
      issues.push({ path: `annotations[${i}].id`, message: `Duplicate id "${id}"` });
    } else {
      indexById.set(id, i);
    }
  });

  spec.annotations.forEach((a, i) => {
    for (const [field, point] of pointFields(a)) {
      const target = anchorTarget(point);
      if (target === null) continue;
      if (!indexById.has(target)) {
        issues.push({ path: `annotations[${i}].${field}`, message: `Unknown anchor target "@${target}"` });
      } else if (target === ids[i]) {
        issues.push({ path: `annotations[${i}].${field}`, message: 'An annotation cannot anchor to itself' });
      }
    }
  });
  if (issues.length > 0) throw new SpecError(issues);

  const geometries = new Array<AnnotationGeometry | undefined>(spec.annotations.length);
  const resolving = new Set<number>();

  const resolvePoint = (point: PointSpec, path: string): Point => {
    if (Array.isArray(point)) {
      return { x: resolveCoord(point[0], width), y: resolveCoord(point[1], height) };
    }
    const ref = typeof point === 'string' ? point : point.anchor;
    const [, target, position = 'center'] = ANCHOR_PATTERN.exec(ref)!;
    const targetGeometry = resolveGeometry(indexById.get(target)!, path);
    const base = anchorPoint(targetGeometry, position as AnchorPosition, scale);
    if (typeof point === 'string') return base;
    return { x: base.x + (point.dx ?? 0), y: base.y + (point.dy ?? 0) };
  };

  const resolveGeometry = (i: number, fromPath?: string): AnnotationGeometry => {
    const cached = geometries[i];
    if (cached) return cached;
    if (resolving.has(i)) {
      throw new SpecError([{ path: fromPath ?? `annotations[${i}]`, message: 'Anchors form a cycle' }]);
    }
    resolving.add(i);
    const a = spec.annotations[i];
    const path = `annotations[${i}]`;
    let geometry: AnnotationGeometry;
    switch (a.type) {
      case 'box':
      case 'highlight':
      case 'blur':
        geometry = {
          type: a.type,
          x: resolveCoord(a.x, width),
          y: resolveCoord(a.y, height),
          width: resolveCoord(a.width, width),
          height: resolveCoord(a.height, height),
          ...(a.radius !== undefined ? { borderRadius: a.radius } : {}),
        };
        break;
      case 'ellipse': {
        const x = resolveCoord(a.x, width);
        const y = resolveCoord(a.y, height);
        const w = resolveCoord(a.width, width);
        const h = resolveCoord(a.height, height);
        geometry = { type: 'ellipse', cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 };
        break;
      }
      case 'arrow': {
        const from = resolvePoint(a.from, `${path}.from`);
        const to = resolvePoint(a.to, `${path}.to`);
        geometry = { type: 'arrow', startX: from.x, startY: from.y, endX: to.x, endY: to.y };
        break;
      }
      case 'pin': {
        const at = resolvePoint(a.at, `${path}.at`);
        geometry = { type: 'pin', x: at.x, y: at.y };
        break;
      }
      case 'text': {
        const at = resolvePoint(a.at, `${path}.at`);
        geometry = {
          type: 'text',
          x: at.x,
          y: at.y,
          text: a.text,
          fontSize: a.fontSize ?? defaults.fontSize ?? defaultFontSize(size),
          ...(a.align ? { align: a.align } : {}),
        };
        break;
      }
    }
    resolving.delete(i);
    geometries[i] = normalizeGeometry(geometry);
    return geometries[i]!;
  };

  const annotations: Annotation[] = spec.annotations.map((a, i) => ({
    id: ids[i],
    index: 0,
    geometry: resolveGeometry(i),
    style: {
      color: (a.color ?? defaults.color ?? DEFAULT_COLOR) as AnnotationColor,
      strokeWidth: a.strokeWidth ?? defaults.strokeWidth ?? DEFAULT_STROKE_WIDTH,
      fillOpacity: a.fillOpacity ?? defaults.fillOpacity ?? DEFAULT_FILL_OPACITY,
      ...(a.badge === false ? { showBadge: false } : {}),
    },
    note: a.note ?? '',
    createdAt: 0,
    updatedAt: 0,
  }));

  return {
    image: { source: spec.image.source, width, height },
    frame: compileFrame(spec.frame, size),
    annotations: reindexAnnotations(annotations),
  };
}

function compileFrame(frame: FrameSpec | undefined, dims: ImageDimensions): Frame | undefined {
  if (!frame) return undefined;
  return {
    ...(frame.crop
      ? {
          crop: {
            x: resolveCoord(frame.crop.x, dims.width),
            y: resolveCoord(frame.crop.y, dims.height),
            width: resolveCoord(frame.crop.width, dims.width),
            height: resolveCoord(frame.crop.height, dims.height),
          },
        }
      : {}),
    ...(frame.padding !== undefined ? { padding: frame.padding } : {}),
    ...(frame.background !== undefined ? { background: frame.background } : {}),
  };
}

/** Lists validation problems without throwing; an empty list means the spec compiles. */
export function validateSpec(input: unknown, dims?: ImageDimensions): SpecIssue[] {
  try {
    compileSpec(input, dims);
    return [];
  } catch (err) {
    if (err instanceof SpecError) return err.issues;
    throw err;
  }
}

const round = (n: number) => Math.round(n * 100) / 100;

function annotationToSpec(ann: Annotation): AnnotationSpec {
  const common = {
    id: ann.id,
    color: ann.style.color,
    strokeWidth: ann.style.strokeWidth,
    ...(ann.note ? { note: ann.note } : {}),
    ...(ann.style.showBadge === false ? { badge: false } : {}),
  };
  const g = ann.geometry;
  switch (g.type) {
    case 'box':
    case 'highlight':
    case 'blur':
      return {
        type: g.type,
        ...common,
        ...(g.type === 'box' ? { fillOpacity: ann.style.fillOpacity } : {}),
        x: round(g.x),
        y: round(g.y),
        width: round(g.width),
        height: round(g.height),
        ...(g.borderRadius !== undefined ? { radius: g.borderRadius } : {}),
      };
    case 'ellipse':
      return {
        type: 'ellipse',
        ...common,
        fillOpacity: ann.style.fillOpacity,
        x: round(g.cx - g.rx),
        y: round(g.cy - g.ry),
        width: round(g.rx * 2),
        height: round(g.ry * 2),
      };
    case 'arrow':
      return {
        type: 'arrow',
        ...common,
        from: [round(g.startX), round(g.startY)],
        to: [round(g.endX), round(g.endY)],
      };
    case 'pin':
      return { type: 'pin', ...common, at: [round(g.x), round(g.y)] };
    case 'text':
      return {
        type: 'text',
        ...common,
        at: [round(g.x), round(g.y)],
        text: g.text,
        fontSize: g.fontSize,
        ...(g.align ? { align: g.align } : {}),
      };
  }
}

/**
 * Converts editor state into a spec with every geometry in pixels (anchors are not recoverable).
 */
export function toSpec(
  state: { image: Pick<BaseImage, 'src' | 'naturalWidth' | 'naturalHeight'> | null; annotations: Annotation[]; frame?: Frame },
  options: { source?: string } = {}
): DocumentSpec {
  if (!state.image) {
    throw new Error('No image is loaded');
  }
  const frame = state.frame;
  return {
    version: SPEC_VERSION,
    image: {
      source: options.source ?? state.image.src,
      width: state.image.naturalWidth,
      height: state.image.naturalHeight,
    },
    ...(frame && (frame.crop || frame.padding !== undefined || frame.background !== undefined)
      ? {
          frame: {
            ...(frame.crop
              ? {
                  crop: {
                    x: round(frame.crop.x),
                    y: round(frame.crop.y),
                    width: round(frame.crop.width),
                    height: round(frame.crop.height),
                  },
                }
              : {}),
            ...(frame.padding !== undefined ? { padding: frame.padding } : {}),
            ...(frame.background !== undefined ? { background: frame.background } : {}),
          },
        }
      : {}),
    annotations: state.annotations.map(annotationToSpec),
  };
}
