/**
 * Anot8 Shared Test Fixtures, Mock Generators & Reference Oracle Functions
 * Strictly adheres to PROJECT.md and ORIGINAL_REQUEST.md interface contracts.
 */

export type ToolType = 'select' | 'pan' | 'box' | 'ellipse' | 'arrow' | 'pin';
export type PresetColor = 'red' | 'amber' | 'green' | 'cyan' | 'purple';

export interface ColorDefinition {
  id: PresetColor;
  name: string;
  hex: string;
  stroke: string;
  fill: string;
  badgeBg: string;
  badgeText: string;
}

export const COLOR_DEFINITIONS: Record<PresetColor, ColorDefinition> = {
  red: {
    id: 'red',
    name: 'Red',
    hex: '#EF4444',
    stroke: '#EF4444',
    fill: 'rgba(239, 68, 68, 0.15)',
    badgeBg: '#EF4444',
    badgeText: '#FFFFFF',
  },
  amber: {
    id: 'amber',
    name: 'Amber Gold / Amber',
    hex: '#F59E0B',
    stroke: '#F59E0B',
    fill: 'rgba(245, 158, 11, 0.15)',
    badgeBg: '#F59E0B',
    badgeText: '#000000',
  },
  green: {
    id: 'green',
    name: 'Green',
    hex: '#10B981',
    stroke: '#10B981',
    fill: 'rgba(16, 185, 129, 0.15)',
    badgeBg: '#10B981',
    badgeText: '#FFFFFF',
  },
  cyan: {
    id: 'cyan',
    name: 'Cyan',
    hex: '#06B6D4',
    stroke: '#06B6D4',
    fill: 'rgba(6, 182, 212, 0.15)',
    badgeBg: '#06B6D4',
    badgeText: '#000000',
  },
  purple: {
    id: 'purple',
    name: 'Purple',
    hex: '#8B5CF6',
    stroke: '#8B5CF6',
    fill: 'rgba(139, 92, 246, 0.15)',
    badgeBg: '#8B5CF6',
    badgeText: '#FFFFFF',
  },
};

export interface Point {
  x: number;
  y: number;
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

export type AnnotationGeometry = BoxGeometry | EllipseGeometry | ArrowGeometry | PinGeometry;

export interface AnnotationStyle {
  color: PresetColor;
  strokeWidth: number;
  fillOpacity: number;
}

export interface Annotation {
  id: string;
  index: number;
  geometry: AnnotationGeometry;
  style: AnnotationStyle;
  note: string;
  createdAt: number;
  updatedAt: number;
}

export interface BaseImage {
  id: string;
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  fileName: string;
  fileSize: number;
}

export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

export interface ImageOverlay {
  id: string;
  src: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  opacity?: number;
  naturalWidth?: number;
  naturalHeight?: number;
}

export interface AppState {
  image: BaseImage | null;
  overlays: ImageOverlay[];
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  hoveredAnnotationId: string | null;
  activeTool: ToolType;
  activeColor: PresetColor;
  activeStrokeWidth: number;
  activeFillOpacity: number;
  viewport: ViewportState;
  isSidebarOpen: boolean;
  theme: 'dark' | 'light';
}

export type AppAction =
  | { type: 'SET_IMAGE'; payload: BaseImage | null }
  | { type: 'CLEAR_IMAGE' }
  | { type: 'ADD_ANNOTATION'; payload: { id?: string; geometry: AnnotationGeometry; style?: Partial<AnnotationStyle>; note?: string } }
  | { type: 'UPDATE_ANNOTATION_GEOMETRY'; payload: { id: string; geometry: AnnotationGeometry } }
  | { type: 'UPDATE_ANNOTATION_STYLE'; payload: { id: string; style: Partial<AnnotationStyle> } }
  | { type: 'UPDATE_ANNOTATION_NOTE'; payload: { id: string; note: string } }
  | { type: 'DELETE_ANNOTATION'; payload: { id: string } }
  | { type: 'REORDER_ANNOTATIONS'; payload: { sourceIndex: number; destinationIndex: number } }
  | { type: 'SET_SELECTED_ANNOTATION'; payload: string | null }
  | { type: 'SET_HOVERED_ANNOTATION'; payload: string | null }
  | { type: 'SET_ACTIVE_TOOL'; payload: ToolType }
  | { type: 'SET_ACTIVE_COLOR'; payload: PresetColor }
  | { type: 'SET_ACTIVE_STROKE_WIDTH'; payload: number }
  | { type: 'SET_ACTIVE_FILL_OPACITY'; payload: number }
  | { type: 'SET_VIEWPORT'; payload: Partial<ViewportState> }
  | { type: 'SET_SIDEBAR_OPEN'; payload: boolean }
  | { type: 'SET_THEME'; payload: 'dark' | 'light' }
  | { type: 'CLEAR_ALL_ANNOTATIONS' }
  | { type: 'REPLACE_IMAGE_AND_CLEAR'; payload: BaseImage | { image: BaseImage } }
  | { type: 'REPLACE_IMAGE_AND_KEEP'; payload: BaseImage | { image: BaseImage } }
  | { type: 'ADD_IMAGE_OVERLAY'; payload: ImageOverlay | { overlay: ImageOverlay } }
  | { type: 'REMOVE_IMAGE_OVERLAY'; payload: { id: string } | string }
  | { type: 'CLEAR_IMAGE_OVERLAYS' };

// -------------------------------------------------------------
// Reference Invariant & Math Functions
// -------------------------------------------------------------

export function reindexAnnotations(annotations: Annotation[]): Annotation[] {
  let changed = false;
  const reindexed = annotations.map((ann, i) => {
    const expectedIndex = i + 1;
    if (ann.index !== expectedIndex) {
      changed = true;
      return { ...ann, index: expectedIndex };
    }
    return ann;
  });
  return changed ? reindexed : annotations;
}

export function createInitialState(overrides?: Partial<AppState>): AppState {
  return {
    image: null,
    overlays: [],
    annotations: [],
    selectedAnnotationId: null,
    hoveredAnnotationId: null,
    activeTool: 'box',
    activeColor: 'red',
    activeStrokeWidth: 4,
    activeFillOpacity: 0.15,
    viewport: { zoom: 1.0, panX: 0, panY: 0 },
    isSidebarOpen: true,
    theme: 'dark',
    ...overrides,
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_IMAGE':
      return {
        ...state,
        image: action.payload,
        overlays: [],
        annotations: [],
        selectedAnnotationId: null,
        hoveredAnnotationId: null,
      };

    case 'CLEAR_IMAGE':
      return {
        ...state,
        image: null,
        overlays: [],
        annotations: [],
        selectedAnnotationId: null,
        hoveredAnnotationId: null,
      };

    case 'ADD_ANNOTATION': {
      const id = action.payload.id || `ann_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const now = Date.now();
      const newAnnotation: Annotation = {
        id,
        index: state.annotations.length + 1,
        geometry: action.payload.geometry,
        style: {
          color: action.payload.style?.color || state.activeColor,
          strokeWidth: action.payload.style?.strokeWidth || state.activeStrokeWidth,
          fillOpacity: action.payload.style?.fillOpacity !== undefined ? action.payload.style.fillOpacity : state.activeFillOpacity,
        },
        note: action.payload.note || '',
        createdAt: now,
        updatedAt: now,
      };
      const updatedAnnotations = reindexAnnotations([...state.annotations, newAnnotation]);
      return {
        ...state,
        annotations: updatedAnnotations,
        selectedAnnotationId: id,
      };
    }

    case 'UPDATE_ANNOTATION_GEOMETRY': {
      const updated = state.annotations.map(ann => {
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
      const updated = state.annotations.map(ann => {
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
      const updated = state.annotations.map(ann => {
        if (ann.id === action.payload.id) {
          return {
            ...ann,
            note: action.payload.note,
            updatedAt: Date.now(),
          };
        }
        return ann;
      });
      return { ...state, annotations: updated };
    }

    case 'DELETE_ANNOTATION': {
      const filtered = state.annotations.filter(ann => ann.id !== action.payload.id);
      const reindexed = reindexAnnotations(filtered);
      return {
        ...state,
        annotations: reindexed,
        selectedAnnotationId: state.selectedAnnotationId === action.payload.id ? null : state.selectedAnnotationId,
        hoveredAnnotationId: state.hoveredAnnotationId === action.payload.id ? null : state.hoveredAnnotationId,
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
      const [removed] = cloned.splice(sourceIndex, 1);
      cloned.splice(destinationIndex, 0, removed);
      const reindexed = reindexAnnotations(cloned);
      return {
        ...state,
        annotations: reindexed,
      };
    }

    case 'SET_SELECTED_ANNOTATION':
      return { ...state, selectedAnnotationId: action.payload };

    case 'SET_HOVERED_ANNOTATION':
      return { ...state, hoveredAnnotationId: action.payload };

    case 'SET_ACTIVE_TOOL':
      return { ...state, activeTool: action.payload };

    case 'SET_ACTIVE_COLOR': {
      const newState = { ...state, activeColor: action.payload };
      if (state.selectedAnnotationId) {
        newState.annotations = state.annotations.map(ann =>
          ann.id === state.selectedAnnotationId
            ? { ...ann, style: { ...ann.style, color: action.payload }, updatedAt: Date.now() }
            : ann
        );
      }
      return newState;
    }

    case 'SET_ACTIVE_STROKE_WIDTH': {
      const newState = { ...state, activeStrokeWidth: action.payload };
      if (state.selectedAnnotationId) {
        newState.annotations = state.annotations.map(ann =>
          ann.id === state.selectedAnnotationId
            ? { ...ann, style: { ...ann.style, strokeWidth: action.payload }, updatedAt: Date.now() }
            : ann
        );
      }
      return newState;
    }

    case 'SET_ACTIVE_FILL_OPACITY': {
      const newState = { ...state, activeFillOpacity: action.payload };
      if (state.selectedAnnotationId) {
        newState.annotations = state.annotations.map(ann =>
          ann.id === state.selectedAnnotationId
            ? { ...ann, style: { ...ann.style, fillOpacity: action.payload }, updatedAt: Date.now() }
            : ann
        );
      }
      return newState;
    }

    case 'SET_VIEWPORT':
      return { ...state, viewport: { ...state.viewport, ...action.payload } };

    case 'SET_SIDEBAR_OPEN':
      return { ...state, isSidebarOpen: action.payload };

    case 'SET_THEME':
      return { ...state, theme: action.payload };

    case 'CLEAR_ALL_ANNOTATIONS':
      return {
        ...state,
        annotations: [],
        selectedAnnotationId: null,
        hoveredAnnotationId: null,
      };

    case 'REPLACE_IMAGE_AND_CLEAR': {
      const nextImage =
        action.payload && 'image' in action.payload && action.payload.image
          ? action.payload.image
          : (action.payload as BaseImage);
      return {
        ...state,
        image: nextImage,
        overlays: [],
        annotations: [],
        selectedAnnotationId: null,
        hoveredAnnotationId: null,
      };
    }

    case 'REPLACE_IMAGE_AND_KEEP': {
      const nextImage =
        action.payload && 'image' in action.payload && action.payload.image
          ? action.payload.image
          : (action.payload as BaseImage);
      return {
        ...state,
        image: nextImage,
        annotations: state.annotations.map((ann) => ({ ...ann, style: { ...ann.style } })),
        selectedAnnotationId: null,
        hoveredAnnotationId: null,
      };
    }

    case 'ADD_IMAGE_OVERLAY': {
      const overlay =
        action.payload && 'overlay' in action.payload && action.payload.overlay
          ? action.payload.overlay
          : (action.payload as ImageOverlay);
      return {
        ...state,
        overlays: [...(state.overlays || []), overlay],
      };
    }

    case 'REMOVE_IMAGE_OVERLAY': {
      const targetId =
        typeof action.payload === 'string' ? action.payload : action.payload.id;
      return {
        ...state,
        overlays: (state.overlays || []).filter((o) => o.id !== targetId),
      };
    }

    case 'CLEAR_IMAGE_OVERLAYS': {
      return {
        ...state,
        overlays: [],
      };
    }

    default:
      return state;
  }
}

// -------------------------------------------------------------
// Coordinate & Geometry Math Reference Oracle
// -------------------------------------------------------------

export function screenToImage(point: Point, viewport: ViewportState): Point {
  const { zoom, panX, panY } = viewport;
  if (zoom === 0) return { x: point.x - panX, y: point.y - panY };
  return {
    x: (point.x - panX) / zoom,
    y: (point.y - panY) / zoom,
  };
}

export function imageToScreen(point: Point, viewport: ViewportState): Point {
  const { zoom, panX, panY } = viewport;
  return {
    x: point.x * zoom + panX,
    y: point.y * zoom + panY,
  };
}

export function computeZoomTransform(
  viewport: ViewportState,
  focalPointScreen: Point,
  targetZoom: number,
  minZoom = 0.05,
  maxZoom = 20.0
): ViewportState {
  const clampedZoom = Math.min(Math.max(targetZoom, minZoom), maxZoom);
  const { zoom: oldZoom, panX: oldPanX, panY: oldPanY } = viewport;
  if (oldZoom <= 0 || clampedZoom === oldZoom) {
    return { zoom: clampedZoom, panX: oldPanX, panY: oldPanY };
  }
  const ratio = clampedZoom / oldZoom;
  const newPanX = focalPointScreen.x - ratio * (focalPointScreen.x - oldPanX);
  const newPanY = focalPointScreen.y - ratio * (focalPointScreen.y - oldPanY);
  return {
    zoom: clampedZoom,
    panX: newPanX,
    panY: newPanY,
  };
}

export function calculateAutoFit(
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number,
  padding = 32
): ViewportState {
  if (imageWidth <= 0 || imageHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) {
    return { zoom: 1.0, panX: 0, panY: 0 };
  }
  const availW = Math.max(containerWidth - padding * 2, 10);
  const availH = Math.max(containerHeight - padding * 2, 10);
  const scaleX = availW / imageWidth;
  const scaleY = availH / imageHeight;
  const fitZoom = Math.min(scaleX, scaleY, 1.0);
  const panX = (containerWidth - imageWidth * fitZoom) / 2;
  const panY = (containerHeight - imageHeight * fitZoom) / 2;
  return {
    zoom: fitZoom,
    panX,
    panY,
  };
}

export function normalizeBox(x1: number, y1: number, x2: number, y2: number): BoxGeometry {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const width = Math.max(Math.abs(x2 - x1), 1);
  const height = Math.max(Math.abs(y2 - y1), 1);
  return { type: 'box', x, y, width, height };
}

export function normalizeEllipse(x1: number, y1: number, x2: number, y2: number): EllipseGeometry {
  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const width = Math.max(Math.abs(x2 - x1), 1);
  const height = Math.max(Math.abs(y2 - y1), 1);
  return {
    type: 'ellipse',
    cx: minX + width / 2,
    cy: minY + height / 2,
    rx: width / 2,
    ry: height / 2,
  };
}

export function calculateArrowhead(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  strokeWidth = 4,
  apertureAngleDeg = 30
) {
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const alpha = (apertureAngleDeg * Math.PI) / 180;
  const headLength = Math.min(length * 0.45, Math.max(14, Math.min(36, 16 + strokeWidth * 2)));

  const wingLeft = {
    x: endX - headLength * Math.cos(angle - alpha),
    y: endY - headLength * Math.sin(angle - alpha),
  };
  const wingRight = {
    x: endX - headLength * Math.cos(angle + alpha),
    y: endY - headLength * Math.sin(angle + alpha),
  };
  const notch = {
    x: endX - 0.75 * headLength * Math.cos(angle),
    y: endY - 0.75 * headLength * Math.sin(angle),
  };

  return {
    tip: { x: endX, y: endY },
    wingLeft,
    wingRight,
    notch,
    shaftEnd: length < headLength ? { x: endX, y: endY } : notch,
    headingRad: angle,
    headLength,
  };
}

export function getBadgePositionForShape(geometry: AnnotationGeometry): Point {
  switch (geometry.type) {
    case 'box':
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
      // CRITICAL: Badge anchored at tail start point
      return { x: geometry.startX, y: geometry.startY };
    case 'pin':
      return { x: geometry.x, y: geometry.y - 20 };
  }
}

export function getBadgeDimensions(index: number) {
  const text = String(Math.max(1, index));
  const digits = text.length;
  if (digits <= 1) {
    return { width: 24, height: 24, radius: 12, isPill: false, fontSize: 13 };
  }
  const width = Math.max(32, 24 + (digits - 1) * 8);
  return { width, height: 24, radius: 12, isPill: true, fontSize: 12 };
}

// -------------------------------------------------------------
// Markdown Serializer Reference Oracle
// -------------------------------------------------------------

export function serializeAnnotationsToMarkdown(
  annotations: Annotation[],
  format: 'list' | 'table' = 'list'
): string {
  if (!annotations || annotations.length === 0) {
    return '_No annotations recorded._';
  }

  if (format === 'table') {
    const header = '| # | Type | Color | Note |\n|---|---|---|---|';
    const rows = annotations.map(ann => {
      const typeStr = ann.geometry.type.charAt(0).toUpperCase() + ann.geometry.type.slice(1);
      const colorDef = COLOR_DEFINITIONS[ann.style.color] || COLOR_DEFINITIONS.red;
      const colorStr = `${colorDef.name} (${colorDef.hex})`;
      const cleanNote = (ann.note || '_No description_').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
      return `| ${ann.index} | ${typeStr} | ${colorStr} | ${cleanNote} |`;
    });
    return `### Visual Annotations & Notes\n\n${header}\n${rows.join('\n')}`;
  }

  const items = annotations.map(ann => {
    const typeStr = ann.geometry.type.charAt(0).toUpperCase() + ann.geometry.type.slice(1);
    const colorDef = COLOR_DEFINITIONS[ann.style.color] || COLOR_DEFINITIONS.red;
    const noteContent = ann.note ? `\n   ${ann.note.replace(/\n/g, '\n   ')}` : '\n   _No description provided._';
    return `${ann.index}. **[${typeStr}]** (\`${colorDef.hex}\`):${noteContent}`;
  });

  return `### Visual Annotations & Notes\n\n${items.join('\n\n')}`;
}

// -------------------------------------------------------------
// Test Helpers & Mock Factory
// -------------------------------------------------------------

export function createTestImage(
  width = 1920,
  height = 1080,
  name = 'test-screenshot.png'
): BaseImage {
  return {
    id: `img_${Date.now()}`,
    src: `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==`,
    naturalWidth: width,
    naturalHeight: height,
    fileName: name,
    fileSize: 1024 * 50,
  };
}

export function createTestAnnotation(
  overrides?: Partial<Annotation>
): Annotation {
  const now = Date.now();
  return {
    id: overrides?.id || `ann_${now}_${Math.random().toString(36).slice(2, 7)}`,
    index: overrides?.index || 1,
    geometry: overrides?.geometry || { type: 'box', x: 50, y: 50, width: 100, height: 100 },
    style: {
      color: overrides?.style?.color || 'red',
      strokeWidth: overrides?.style?.strokeWidth || 4,
      fillOpacity: overrides?.style?.fillOpacity !== undefined ? overrides.style.fillOpacity : 0.15,
    },
    note: overrides?.note !== undefined ? overrides.note : 'Test annotation note',
    createdAt: overrides?.createdAt || now,
    updatedAt: overrides?.updatedAt || now,
  };
}

export function createTestOverlay(overrides?: Partial<ImageOverlay>): ImageOverlay {
  return {
    id: overrides?.id || `overlay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    src: overrides?.src || 'data:image/png;base64,mockOverlay',
    x: overrides?.x ?? 0,
    y: overrides?.y ?? 0,
    width: overrides?.width ?? 800,
    height: overrides?.height ?? 600,
    opacity: overrides?.opacity ?? 1.0,
    naturalWidth: overrides?.naturalWidth ?? 800,
    naturalHeight: overrides?.naturalHeight ?? 600,
  };
}

// -------------------------------------------------------------
// R2: Zoom Preset Scale & Quantization Function
// -------------------------------------------------------------

export const ZOOM_PRESETS = [0.10, 0.25, 0.33, 0.50, 0.67, 0.75, 1.00, 1.25, 1.50, 2.00] as const;

export function quantizeWheelZoom(currentZoom: number, deltaY: number): number {
  if (deltaY === 0) return currentZoom;
  const zoomIn = deltaY < 0;

  if (zoomIn) {
    for (let i = 0; i < ZOOM_PRESETS.length; i++) {
      if (ZOOM_PRESETS[i] > currentZoom + 0.005) {
        return ZOOM_PRESETS[i];
      }
    }
    return ZOOM_PRESETS[ZOOM_PRESETS.length - 1];
  } else {
    for (let i = ZOOM_PRESETS.length - 1; i >= 0; i--) {
      if (ZOOM_PRESETS[i] < currentZoom - 0.005) {
        return ZOOM_PRESETS[i];
      }
    }
    return ZOOM_PRESETS[0];
  }
}

// -------------------------------------------------------------
// R4 & R5: Stroke Width & Fill Opacity Preset Options
// -------------------------------------------------------------

export const STROKE_WIDTH_OPTIONS = [2, 4, 8] as const;

export interface FillOpacityOption {
  value: number;
  label: string;
}

export const FILL_OPACITY_OPTIONS: readonly FillOpacityOption[] = [
  { value: 0, label: '0%' },
  { value: 0.15, label: '15%' },
  { value: 0.30, label: '30%' },
  { value: 0.50, label: '50%' },
] as const;

// -------------------------------------------------------------
// R3: Responsive Toolbar Layout Simulation
// -------------------------------------------------------------

export interface ResponsiveLayoutMetrics {
  viewportWidth: number;
  breakpoint: 'desktop' | 'tablet' | 'mobile';
  allDrawingToolsRendered: boolean;
  colorPaletteRendered: boolean;
  zoomControlsRendered: boolean;
  imageActionsRendered: boolean;
  isMultiRowWrapped: boolean;
  hasHorizontalClipping: boolean;
}

export function computeResponsiveToolbarMetrics(viewportWidth: number): ResponsiveLayoutMetrics {
  const breakpoint = viewportWidth >= 1024 ? 'desktop' : viewportWidth >= 768 ? 'tablet' : 'mobile';
  return {
    viewportWidth,
    breakpoint,
    allDrawingToolsRendered: true,
    colorPaletteRendered: true,
    zoomControlsRendered: true,
    imageActionsRendered: true,
    isMultiRowWrapped: viewportWidth < 1280,
    hasHorizontalClipping: false,
  };
}
