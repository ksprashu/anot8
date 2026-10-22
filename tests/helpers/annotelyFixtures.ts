/**
 * Anot8 Annotely Features Test Fixtures, Contracts & Reference Oracles
 * 
 * Authoritative models, reference implementations, and simulation harnesses
 * strictly adhering to PROJECT.md § Interface Contracts and ORIGINAL_REQUEST.md.
 */

import { Point, PresetColor, BaseImage } from '../../src/types';

// ============================================================================
// 1. Domain Type Contracts for Annotely Features (R1, R2, R3, R4)
// ============================================================================

export type AnnotelyToolType =
  | 'select'
  | 'pan'
  | 'box'
  | 'ellipse'
  | 'arrow'
  | 'pin'
  | 'highlight'
  | 'blur';

export interface HighlightGeometry {
  type: 'highlight';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BlurGeometry {
  type: 'blur';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoxGeometry {
  type: 'box';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EllipseGeometry {
  type: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface ArrowGeometry {
  type: 'arrow';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface PinGeometry {
  type: 'pin';
  x: number;
  y: number;
}

export type AnnotelyGeometry =
  | BoxGeometry
  | EllipseGeometry
  | ArrowGeometry
  | PinGeometry
  | HighlightGeometry
  | BlurGeometry;

export interface AnnotationStyle {
  color: PresetColor;
  strokeWidth: number;
  fillOpacity: number;
}

export interface AnnotelyAnnotation {
  id: string;
  index: number;
  geometry: AnnotelyGeometry;
  style: AnnotationStyle;
  note: string;
  createdAt: number;
  updatedAt: number;
}

export interface BadgeDimensions {
  width: number;
  height: number;
  radius: number;
  isPill: boolean;
  fontSize: number;
}

export interface ArrowheadData {
  tip: Point;
  wingLeft: Point;
  wingRight: Point;
  notch: Point;
  shaftEnd: Point;
  headingRad: number;
  headLength: number;
  pathString: string;
  casingStrokeWidth: number;
}

export interface PinDimensions {
  headRadius: number;
  pointerHeight: number;
  width: number;
  height: number;
  fontSize: number;
  anchorOffset: number;
}

export interface AnnotelyAppState {
  image: BaseImage | null;
  annotations: AnnotelyAnnotation[];
  selectedAnnotationId: string | null;
  hoveredAnnotationId: string | null;
  activeTool: AnnotelyToolType;
  activeColor: PresetColor;
  activeStrokeWidth: number;
  activeFillOpacity: number;
  viewport: {
    zoom: number;
    panX: number;
    panY: number;
  };
  isSidebarOpen: boolean;
  theme: 'dark' | 'light';
}

export type AnnotelyAppAction =
  | { type: 'SET_IMAGE'; payload: BaseImage | null }
  | { type: 'CLEAR_IMAGE' }
  | {
      type: 'ADD_ANNOTATION';
      payload: {
        id?: string;
        geometry: AnnotelyGeometry;
        style?: Partial<AnnotationStyle>;
        note?: string;
      };
    }
  | {
      type: 'UPDATE_ANNOTATION_GEOMETRY';
      payload: { id: string; geometry: AnnotelyGeometry };
    }
  | {
      type: 'UPDATE_ANNOTATION_STYLE';
      payload: { id: string; style: Partial<AnnotationStyle> };
    }
  | { type: 'UPDATE_ANNOTATION_NOTE'; payload: { id: string; note: string } }
  | { type: 'DELETE_ANNOTATION'; payload: { id: string } }
  | {
      type: 'REORDER_ANNOTATIONS';
      payload: { sourceIndex: number; destinationIndex: number };
    }
  | { type: 'SET_SELECTED_ANNOTATION'; payload: string | null }
  | { type: 'SET_HOVERED_ANNOTATION'; payload: string | null }
  | { type: 'SET_ACTIVE_TOOL'; payload: AnnotelyToolType }
  | { type: 'SET_ACTIVE_COLOR'; payload: PresetColor }
  | { type: 'SET_ACTIVE_STROKE_WIDTH'; payload: number }
  | { type: 'SET_ACTIVE_FILL_OPACITY'; payload: number }
  | { type: 'CLEAR_ALL_ANNOTATIONS' };

// ============================================================================
// 2. Reference Math & Geometry Oracles (PROJECT.md § Interface Contracts)
// ============================================================================

/**
 * Arrow Geometry Contract (PROJECT.md § 1):
 * - Sharp arrowhead geometry with 30° sweep (Math.PI / 6).
 * - Recessed notch at 0.75 * headLength.
 * - Base head length scaled by strokeWidth: clamp(16 + strokeWidth * 2, 14, 36).
 * - Clamped to length * 0.45 for short arrows to prevent inversion.
 * - shaftEnd recessed from notch by strokeWidth * 0.5 to prevent round linecap penetration.
 * - High-contrast underlay casing strokeWidth = strokeWidth + 3.5 with rgba(0,0,0,0.55).
 */
export function calculateArrowheadContract(
  start: Point,
  end: Point,
  strokeWidth: number = 3
): ArrowheadData {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const headingRad = Math.atan2(dy, dx);
  const wingAngleRad = Math.PI / 6; // 30 degrees

  const baseHeadLength = Math.min(Math.max(16 + strokeWidth * 2, 14), 36);
  const headLength = length > 0 ? Math.min(baseHeadLength, length * 0.45) : baseHeadLength;

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

  // Shaft end recessed by strokeWidth * 0.5 from notch
  const recessionDistance = strokeWidth * 0.5;
  const shaftEnd: Point = length > headLength
    ? {
        x: notch.x - recessionDistance * Math.cos(headingRad),
        y: notch.y - recessionDistance * Math.sin(headingRad),
      }
    : end;

  const pathString = `M ${end.x} ${end.y} L ${wingLeft.x} ${wingLeft.y} L ${notch.x} ${notch.y} L ${wingRight.x} ${wingRight.y} Z`;
  const casingStrokeWidth = strokeWidth + 3.5;

  return {
    tip: end,
    wingLeft,
    wingRight,
    notch,
    shaftEnd,
    headingRad,
    headLength,
    pathString,
    casingStrokeWidth,
  };
}

/**
 * Resolution Scale Contract (PROJECT.md § 4):
 * - computeResolutionScale(w, h): clamp(Math.max(w, h) / 1440, 1.0, 4.0).
 * - Returns 1.0 for <= 1440px images (backward compatibility).
 * - Scales smoothly up to 4.0 for 4K / 8K resolutions.
 */
export function computeResolutionScaleContract(width: number, height: number): number {
  const maxDim = Math.max(width, height);
  if (!Number.isFinite(maxDim) || maxDim <= 0) return 1.0;
  const rawScale = maxDim / 1440;
  return Math.min(Math.max(rawScale, 1.0), 4.0);
}

/**
 * Scalable Badge Dimensions Contract (PROJECT.md § 4):
 * - Scales width, height, radius, and fontSize by scale: Math.round(base * scale).
 * - Minimum readable limits preserved (never less than base 24x24 / fontSize 13).
 */
export function getBadgeDimensionsContract(index: number, scale: number = 1.0): BadgeDimensions {
  const safeScale = Math.max(1.0, Number.isFinite(scale) ? scale : 1.0);
  const text = String(Math.max(1, index));
  const digits = text.length;

  const baseHeight = 24;
  const baseRadius = 12;
  const baseWidth = digits <= 1 ? 24 : Math.max(32, 24 + (digits - 1) * 8);
  const baseFontSize = digits <= 1 ? 13 : 12;

  return {
    width: Math.round(baseWidth * safeScale),
    height: Math.round(baseHeight * safeScale),
    radius: Math.round(baseRadius * safeScale),
    isPill: digits > 1,
    fontSize: Math.round(baseFontSize * safeScale),
  };
}

/**
 * Scalable Pin Marker Geometry Contract (PROJECT.md § 4):
 * - Scales pin head, pointer height, and bounding box by resolution scale.
 */
export function getPinDimensionsContract(scale: number = 1.0): PinDimensions {
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
 * Returns the anchor point where the numbered badge is positioned.
 * Preserves tail anchor (startX, startY) for arrows.
 */
export function getBadgePositionForAnnotelyShape(
  geometry: AnnotelyGeometry,
  scale: number = 1.0
): Point {
  switch (geometry.type) {
    case 'box':
    case 'highlight':
    case 'blur':
      return { x: geometry.x, y: geometry.y };
    case 'ellipse': {
      const cos225 = -Math.SQRT1_2;
      const sin225 = -Math.SQRT1_2;
      return {
        x: geometry.cx + geometry.rx * cos225,
        y: geometry.cy + geometry.ry * sin225,
      };
    }
    case 'arrow':
      // Strictly tail-anchored so arrowhead remains clear
      return { x: geometry.startX, y: geometry.startY };
    case 'pin': {
      const pinDim = getPinDimensionsContract(scale);
      return { x: geometry.x, y: geometry.y - pinDim.anchorOffset };
    }
  }
}

/**
 * Normalizes two arbitrary drag points into a valid top-left HighlightGeometry.
 */
export function normalizeHighlightGeometry(start: Point, current: Point): HighlightGeometry {
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);
  return { type: 'highlight', x, y, width, height };
}

/**
 * Normalizes two arbitrary drag points into a valid top-left BlurGeometry.
 */
export function normalizeBlurGeometry(start: Point, current: Point): BlurGeometry {
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);
  return { type: 'blur', x, y, width, height };
}

// ============================================================================
// 3. Spotlight & Blur Markup Generators (PROJECT.md § Interface Contracts)
// ============================================================================

export interface SpotlightMaskModel {
  maskId: string;
  backdropColor: string;
  baseRect: { width: string; height: string; fill: string };
  cutouts: { x: number; y: number; width: number; height: number; fill: string; rx: number }[];
}

export function generateSpotlightMaskModel(highlights: HighlightGeometry[]): SpotlightMaskModel {
  return {
    maskId: 'spotlight-mask',
    backdropColor: 'rgba(0,0,0,0.68)',
    baseRect: { width: '100%', height: '100%', fill: 'white' },
    cutouts: highlights.map((h) => ({
      x: h.x,
      y: h.y,
      width: h.width,
      height: h.height,
      fill: 'black',
      rx: 4,
    })),
  };
}

export interface BlurFilterModel {
  filterId: string;
  stdDeviation: number;
  edgeMode: 'duplicate' | 'clamp';
  clipPaths: { id: string; rect: { x: number; y: number; width: number; height: number; rx: number } }[];
}

export function generateBlurFilterModel(blurs: BlurGeometry[]): BlurFilterModel {
  return {
    filterId: 'gaussian-blur',
    stdDeviation: 10,
    edgeMode: 'duplicate',
    clipPaths: blurs.map((b, idx) => ({
      id: `blur-clip-${idx}`,
      rect: {
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        rx: 2,
      },
    })),
  };
}

// ============================================================================
// 4. State Management & Invariants Reducer for Annotely Features
// ============================================================================

export function isAnnotelyAnnotatable(geometry: AnnotelyGeometry): boolean {
  return geometry.type !== 'highlight' && geometry.type !== 'blur';
}

export function reindexAnnotelyAnnotations(
  annotations: AnnotelyAnnotation[]
): AnnotelyAnnotation[] {
  let changed = false;
  let nextAnnotatableIndex = 1;
  const reindexed = annotations.map((ann) => {
    const isAnnotatable = isAnnotelyAnnotatable(ann.geometry);
    const expectedIndex = isAnnotatable ? nextAnnotatableIndex++ : 0;
    if (ann.index !== expectedIndex) {
      changed = true;
      return { ...ann, index: expectedIndex };
    }
    return ann;
  });
  return changed ? reindexed : annotations;
}

export function createInitialAnnotelyState(
  overrides?: Partial<AnnotelyAppState>
): AnnotelyAppState {
  return {
    image: null,
    annotations: [],
    selectedAnnotationId: null,
    hoveredAnnotationId: null,
    activeTool: 'arrow',
    activeColor: 'amber',
    activeStrokeWidth: 6,
    activeFillOpacity: 0.15,
    viewport: { zoom: 1.0, panX: 0, panY: 0 },
    isSidebarOpen: true,
    theme: 'dark',
    ...overrides,
  };
}

export function annotelyAppReducer(
  state: AnnotelyAppState,
  action: AnnotelyAppAction
): AnnotelyAppState {
  switch (action.type) {
    case 'SET_IMAGE':
      return {
        ...state,
        image: action.payload,
        annotations: [],
        selectedAnnotationId: null,
        hoveredAnnotationId: null,
      };

    case 'CLEAR_IMAGE':
      return {
        ...state,
        image: null,
        annotations: [],
        selectedAnnotationId: null,
        hoveredAnnotationId: null,
      };

    case 'ADD_ANNOTATION': {
      const id = action.payload.id || `ann_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const now = Date.now();
      const isAnnotatable = isAnnotelyAnnotatable(action.payload.geometry);
      const nextIndex = isAnnotatable
        ? state.annotations.filter((a) => isAnnotelyAnnotatable(a.geometry)).length + 1
        : 0;
      const newAnnotation: AnnotelyAnnotation = {
        id,
        index: nextIndex,
        geometry: action.payload.geometry,
        style: {
          color: action.payload.style?.color || state.activeColor,
          strokeWidth: action.payload.style?.strokeWidth || state.activeStrokeWidth,
          fillOpacity:
            action.payload.style?.fillOpacity !== undefined
              ? action.payload.style.fillOpacity
              : state.activeFillOpacity,
        },
        note: action.payload.note || '',
        createdAt: now,
        updatedAt: now,
      };
      const updatedAnnotations = reindexAnnotelyAnnotations([...state.annotations, newAnnotation]);
      return {
        ...state,
        annotations: updatedAnnotations,
        selectedAnnotationId: id,
      };
    }

    case 'UPDATE_ANNOTATION_GEOMETRY': {
      const updated = state.annotations.map((ann) => {
        if (ann.id === action.payload.id) {
          return {
            ...ann,
            geometry: action.payload.geometry,
            updatedAt: Date.now(),
          };
        }
        return ann;
      });
      return { ...state, annotations: updated };
    }

    case 'UPDATE_ANNOTATION_STYLE': {
      const updated = state.annotations.map((ann) => {
        if (ann.id === action.payload.id) {
          return {
            ...ann,
            style: { ...ann.style, ...action.payload.style },
            updatedAt: Date.now(),
          };
        }
        return ann;
      });
      return { ...state, annotations: updated };
    }

    case 'UPDATE_ANNOTATION_NOTE': {
      const updated = state.annotations.map((ann) => {
        if (ann.id === action.payload.id) {
          return { ...ann, note: action.payload.note, updatedAt: Date.now() };
        }
        return ann;
      });
      return { ...state, annotations: updated };
    }

    case 'DELETE_ANNOTATION': {
      const remaining = state.annotations.filter((ann) => ann.id !== action.payload.id);
      const reindexed = reindexAnnotelyAnnotations(remaining);
      return {
        ...state,
        annotations: reindexed,
        selectedAnnotationId:
          state.selectedAnnotationId === action.payload.id ? null : state.selectedAnnotationId,
        hoveredAnnotationId:
          state.hoveredAnnotationId === action.payload.id ? null : state.hoveredAnnotationId,
      };
    }

    case 'REORDER_ANNOTATIONS': {
      const { sourceIndex, destinationIndex } = action.payload;
      if (
        sourceIndex < 0 ||
        sourceIndex >= state.annotations.length ||
        destinationIndex < 0 ||
        destinationIndex >= state.annotations.length ||
        sourceIndex === destinationIndex
      ) {
        return state;
      }
      const cloned = [...state.annotations];
      const [moved] = cloned.splice(sourceIndex, 1);
      cloned.splice(destinationIndex, 0, moved);
      return {
        ...state,
        annotations: reindexAnnotelyAnnotations(cloned),
      };
    }

    case 'SET_SELECTED_ANNOTATION':
      return { ...state, selectedAnnotationId: action.payload };

    case 'SET_HOVERED_ANNOTATION':
      return { ...state, hoveredAnnotationId: action.payload };

    case 'SET_ACTIVE_TOOL':
      return { ...state, activeTool: action.payload };

    case 'SET_ACTIVE_COLOR':
      return { ...state, activeColor: action.payload };

    case 'SET_ACTIVE_STROKE_WIDTH':
      return { ...state, activeStrokeWidth: action.payload };

    case 'SET_ACTIVE_FILL_OPACITY':
      return { ...state, activeFillOpacity: action.payload };

    case 'CLEAR_ALL_ANNOTATIONS':
      return {
        ...state,
        annotations: [],
        selectedAnnotationId: null,
        hoveredAnnotationId: null,
      };

    default:
      return state;
  }
}

// ============================================================================
// 5. Canvas 2D Export Pipeline Simulation & Verification Harness
// ============================================================================

export interface CanvasExportStepRecord {
  stage:
    | 'draw_base_image'
    | 'destructive_blur_bake'
    | 'spotlight_backdrop_fill'
    | 'spotlight_cutout_punch'
    | 'spotlight_composite_apply'
    | 'render_arrow_casing'
    | 'render_arrow_shaft'
    | 'render_arrow_head'
    | 'render_scaled_badge'
    | 'render_scaled_pin';
  details: Record<string, unknown>;
}

export function simulateAnnotelyCanvasExport(
  image: BaseImage,
  annotations: AnnotelyAnnotation[],
  options?: { scale?: number }
): { steps: CanvasExportStepRecord[]; scale: number } {
  const steps: CanvasExportStepRecord[] = [];
  const resolutionScale = options?.scale ?? computeResolutionScaleContract(image.naturalWidth, image.naturalHeight);

  // Stage 1: Base image
  steps.push({
    stage: 'draw_base_image',
    details: { width: image.naturalWidth, height: image.naturalHeight, src: image.src },
  });

  // Stage 2: Destructive blur baking
  const blurAnnotations = annotations.filter((a) => a.geometry.type === 'blur');
  for (const blur of blurAnnotations) {
    const geo = blur.geometry as BlurGeometry;
    steps.push({
      stage: 'destructive_blur_bake',
      details: {
        id: blur.id,
        x: geo.x,
        y: geo.y,
        width: geo.width,
        height: geo.height,
        filter: 'blur(12px)',
        bakedIrreversibly: true,
      },
    });
  }

  // Stage 3: Spotlight dimming layer with additive punchouts
  const highlightAnnotations = annotations.filter((a) => a.geometry.type === 'highlight');
  if (highlightAnnotations.length > 0) {
    steps.push({
      stage: 'spotlight_backdrop_fill',
      details: { color: 'rgba(0,0,0,0.68)', width: image.naturalWidth, height: image.naturalHeight },
    });

    for (const hl of highlightAnnotations) {
      const geo = hl.geometry as HighlightGeometry;
      steps.push({
        stage: 'spotlight_cutout_punch',
        details: {
          id: hl.id,
          x: geo.x,
          y: geo.y,
          width: geo.width,
          height: geo.height,
          compositeOperation: 'destination-out',
        },
      });
    }

    steps.push({
      stage: 'spotlight_composite_apply',
      details: { compositeOperation: 'source-over' },
    });
  }

  // Stage 4: Vector shapes (arrows, etc.)
  for (const ann of annotations) {
    if (ann.geometry.type === 'arrow') {
      const geo = ann.geometry;
      const strokeWidth = ann.style.strokeWidth || 6;
      const arrowData = calculateArrowheadContract(
        { x: geo.startX, y: geo.startY },
        { x: geo.endX, y: geo.endY },
        strokeWidth
      );

      // Contrast underlay casing
      steps.push({
        stage: 'render_arrow_casing',
        details: {
          id: ann.id,
          casingStrokeWidth: arrowData.casingStrokeWidth,
          casingColor: 'rgba(0,0,0,0.55)',
        },
      });

      // Shaft
      steps.push({
        stage: 'render_arrow_shaft',
        details: {
          id: ann.id,
          startX: geo.startX,
          startY: geo.startY,
          shaftEndX: arrowData.shaftEnd.x,
          shaftEndY: arrowData.shaftEnd.y,
          strokeWidth,
          color: ann.style.color,
        },
      });

      // Head
      steps.push({
        stage: 'render_arrow_head',
        details: {
          id: ann.id,
          tip: arrowData.tip,
          pathString: arrowData.pathString,
          color: ann.style.color,
        },
      });
    } else if (ann.geometry.type === 'pin') {
      const pinDim = getPinDimensionsContract(resolutionScale);
      steps.push({
        stage: 'render_scaled_pin',
        details: {
          id: ann.id,
          x: ann.geometry.x,
          y: ann.geometry.y,
          headRadius: pinDim.headRadius,
          pointerHeight: pinDim.pointerHeight,
          resolutionScale,
        },
      });
    }
  }

  // Stage 5: Scaled numbered badges (only for annotatable callouts: box, ellipse, arrow, pin)
  for (const ann of annotations) {
    if (ann.geometry.type === 'highlight' || ann.geometry.type === 'blur') continue;
    const badgePos = getBadgePositionForAnnotelyShape(ann.geometry, resolutionScale);
    const badgeDim = getBadgeDimensionsContract(ann.index, resolutionScale);
    steps.push({
      stage: 'render_scaled_badge',
      details: {
        id: ann.id,
        index: ann.index,
        x: badgePos.x,
        y: badgePos.y,
        width: badgeDim.width,
        height: badgeDim.height,
        fontSize: badgeDim.fontSize,
        resolutionScale,
      },
    });
  }

  return { steps, scale: resolutionScale };
}

// ============================================================================
// 6. Test Fixture Image Factory
// ============================================================================

export function createAnnotelyTestImage(
  width: number,
  height: number,
  name: string = 'test-screenshot.png'
): BaseImage {
  return {
    id: `img_${width}x${height}_${Math.random().toString(36).slice(2, 7)}`,
    src: `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==`,
    naturalWidth: width,
    naturalHeight: height,
    fileName: name,
    fileSize: width * height * 4,
  };
}
