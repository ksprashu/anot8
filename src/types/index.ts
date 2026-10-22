/**
 * Annot8 Core Data Models & Contracts
 * Strict type definitions for geometries, styling, annotations, base images, viewport, and actions.
 */

export type ToolType = 'select' | 'pan' | 'box' | 'ellipse' | 'arrow' | 'pin' | 'highlight' | 'blur';

export type PresetColor = 'red' | 'amber' | 'green' | 'cyan' | 'purple';

export type HexColor = `#${string}`; // #RGB or #RRGGBB

export type AnnotationColor = PresetColor | HexColor;

export interface ColorDefinition {
  id: AnnotationColor;
  name: string;
  hex: string;
  stroke: string;
  fill: string;
  badgeBg: string;
  badgeText: string;
}

export interface Point {
  x: number; // In natural base image coordinates [0, naturalWidth]
  y: number; // In natural base image coordinates [0, naturalHeight]
}

export interface BoxGeometry {
  type: 'box';
  x: number; // Top-left X in natural image pixels
  y: number; // Top-left Y in natural image pixels
  width: number; // Positive width in natural image pixels
  height: number; // Positive height in natural image pixels
  borderRadius?: number;
}

export interface HighlightGeometry {
  type: 'highlight';
  x: number; // Top-left X in natural image pixels
  y: number; // Top-left Y in natural image pixels
  width: number; // Positive width in natural image pixels
  height: number; // Positive height in natural image pixels
  borderRadius?: number;
}

export interface BlurGeometry {
  type: 'blur';
  x: number; // Top-left X in natural image pixels
  y: number; // Top-left Y in natural image pixels
  width: number; // Positive width in natural image pixels
  height: number; // Positive height in natural image pixels
  borderRadius?: number;
}

export interface EllipseGeometry {
  type: 'ellipse';
  cx: number; // Center X in natural image pixels
  cy: number; // Center Y in natural image pixels
  rx: number; // Horizontal radius in natural image pixels
  ry: number; // Vertical radius in natural image pixels
}

export interface ArrowGeometry {
  type: 'arrow';
  startX: number; // Tail anchor X in natural image pixels
  startY: number; // Tail anchor Y in natural image pixels
  endX: number; // Arrowhead tip X in natural image pixels
  endY: number; // Arrowhead tip Y in natural image pixels
}

export interface PinGeometry {
  type: 'pin';
  x: number; // Pin anchor tip X in natural image pixels
  y: number; // Pin anchor tip Y in natural image pixels
}

export interface TextGeometry {
  type: 'text';
  x: number; // Label anchor X in natural image pixels (left, center, or right edge per align)
  y: number; // Label top edge Y in natural image pixels
  text: string; // Label text; '\n' starts a new line
  fontSize: number; // In natural image pixels
  align?: 'left' | 'center' | 'right'; // Default 'left'
}

export type AnnotationGeometry =
  | BoxGeometry
  | HighlightGeometry
  | BlurGeometry
  | EllipseGeometry
  | ArrowGeometry
  | PinGeometry
  | TextGeometry;

export interface AnnotationStyle {
  color: AnnotationColor;
  strokeWidth: number; // In natural image pixels (e.g. 2, 3, 4, 6, 8)
  fillOpacity: number; // 0.0 (transparent) to 1.0 (solid)
  showBadge?: boolean; // Draw the numbered badge (default true); the sequence number is kept either way
}

export interface Annotation {
  id: string; // Unique identifier (UUID v4 or nanoid)
  index: number; // 1-based dynamic sequential badge number (1..N)
  geometry: AnnotationGeometry;
  style: AnnotationStyle;
  note: string; // Markdown formatted note text
  createdAt: number; // Unix timestamp in ms
  updatedAt: number; // Unix timestamp in ms
}

export interface BaseImage {
  id: string;
  src: string; // Object URL or Data URL
  naturalWidth: number; // Unscaled width in pixels
  naturalHeight: number; // Unscaled height in pixels
  fileName: string;
  fileSize: number; // In bytes
}

export interface ImageOverlay {
  id: string; // Unique identifier (UUID or nanoid)
  src: string; // Object URL or Data URL
  x: number; // Top-left X offset in natural canvas pixels (default 0)
  y: number; // Top-left Y offset in natural canvas pixels (default 0)
  width?: number; // Rendered width in natural pixels (defaults to naturalWidth)
  height?: number; // Rendered height in natural pixels (defaults to naturalHeight)
  opacity?: number; // Layer opacity between 0.0 and 1.0 (default 1.0)
  naturalWidth?: number; // Native width in pixels
  naturalHeight?: number; // Native height in pixels
  fileName?: string; // Original filename
  fileSize?: number; // Size in bytes
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Export framing applied on top of the base image: crop to a region, then pad with a background.
 */
export interface Frame {
  crop?: Rect; // In natural image pixels (default: full image)
  padding?: number; // Pixels added on every side of the cropped region (default 0)
  background?: string; // CSS color for padding and transparent areas (default transparent)
}

export interface ViewportState {
  zoom: number; // Scale factor (e.g., 1.0 = 100%, 0.1 to 10.0)
  panX: number; // Viewport horizontal translation in CSS pixels
  panY: number; // Viewport vertical translation in CSS pixels
}

export interface AppState {
  image: BaseImage | null;
  overlays: ImageOverlay[];
  annotations: Annotation[];
  frame?: Frame;
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

export interface HistorySnapshot {
  annotations: Annotation[];
  selectedAnnotationId: string | null;
}

export interface HistoryState {
  past: HistorySnapshot[];
  present: HistorySnapshot;
  future: HistorySnapshot[];
}

export type AppAction =
  | { type: 'SET_IMAGE'; payload: BaseImage | null }
  | { type: 'CLEAR_IMAGE' }
  | { type: 'REPLACE_IMAGE_AND_CLEAR'; payload: BaseImage | { image: BaseImage } }
  | { type: 'REPLACE_IMAGE_AND_KEEP'; payload: BaseImage | { image: BaseImage } }
  | { type: 'ADD_IMAGE_OVERLAY'; payload: ImageOverlay | { overlay: ImageOverlay } }
  | { type: 'REMOVE_IMAGE_OVERLAY'; payload: { id: string } | string }
  | { type: 'CLEAR_IMAGE_OVERLAYS' }
  | {
      type: 'ADD_ANNOTATION';
      payload: {
        id?: string;
        geometry: AnnotationGeometry;
        style?: Partial<AnnotationStyle>;
        note?: string;
      };
    }
  | {
      type: 'UPDATE_ANNOTATION_GEOMETRY';
      payload: {
        id: string;
        geometry: AnnotationGeometry;
      };
    }
  | {
      type: 'UPDATE_ANNOTATION_STYLE';
      payload: {
        id: string;
        style: Partial<AnnotationStyle>;
      };
    }
  | {
      type: 'UPDATE_ANNOTATION_NOTE';
      payload: {
        id: string;
        note: string;
      };
    }
  | { type: 'DELETE_ANNOTATION'; payload: { id: string } }
  | {
      type: 'REORDER_ANNOTATIONS';
      payload:
        | { fromIndex: number; toIndex: number }
        | { sourceIndex: number; destinationIndex: number };
    }
  | { type: 'CLEAR_ALL_ANNOTATIONS' }
  | { type: 'SET_ANNOTATIONS'; payload: Annotation[] }
  | { type: 'SET_FRAME'; payload: Frame | null }
  | { type: 'SELECT_ANNOTATION'; payload: string | null }
  | { type: 'SET_SELECTED_ANNOTATION'; payload: string | null }
  | { type: 'HOVER_ANNOTATION'; payload: string | null }
  | { type: 'SET_HOVERED_ANNOTATION'; payload: string | null }
  | { type: 'SET_ACTIVE_TOOL'; payload: ToolType }
  | { type: 'SET_ACTIVE_COLOR'; payload: PresetColor }
  | { type: 'SET_ACTIVE_STROKE_WIDTH'; payload: number }
  | { type: 'SET_ACTIVE_FILL_OPACITY'; payload: number }
  | { type: 'SET_VIEWPORT'; payload: Partial<ViewportState> }
  | { type: 'RESET_VIEWPORT'; payload?: Partial<ViewportState> }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_SIDEBAR_OPEN'; payload: boolean }
  | { type: 'SET_THEME'; payload: 'dark' | 'light' }
  | { type: 'TOGGLE_THEME' }
  | { type: 'RESTORE_SNAPSHOT'; payload: HistorySnapshot }
  | { type: 'RESET_STATE'; payload?: Partial<AppState> };

