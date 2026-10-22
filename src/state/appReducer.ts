import {
  Annotation,
  AnnotationGeometry,
  AppState,
  AppAction,
  BaseImage,
  BoxGeometry,
  HighlightGeometry,
  BlurGeometry,
  EllipseGeometry,
  ImageOverlay,
  PresetColor,
  ViewportState,
} from '../types';

export const DEFAULT_COLOR: PresetColor = 'amber';
export const DEFAULT_STROKE_WIDTH = 2;
export const DEFAULT_FILL_OPACITY = 0.15;

export const DEFAULT_VIEWPORT: ViewportState = {
  zoom: 1.0,
  panX: 0,
  panY: 0,
};

export function createInitialState(overrides?: Partial<AppState>): AppState {
  return {
    image: null,
    overlays: [],
    annotations: [],
    selectedAnnotationId: null,
    hoveredAnnotationId: null,
    activeTool: 'select',
    activeColor: DEFAULT_COLOR,
    activeStrokeWidth: DEFAULT_STROKE_WIDTH,
    activeFillOpacity: DEFAULT_FILL_OPACITY,
    viewport: { ...DEFAULT_VIEWPORT },
    isSidebarOpen: true,
    theme: 'dark',
    ...overrides,
  };
}

/**
 * Pure helper function to generate a simple unique ID if crypto.randomUUID is unavailable
 */
export function generateUniqueId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'ann_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
}

/**
 * Determines whether a given geometry type is an annotatable callout that receives
 * sequential 1..N badge numbering and notes.
 * Visual effect shapes (highlight, blur) and text labels are unnumbered and return false.
 */
export function isAnnotatableGeometry(geometry: AnnotationGeometry): boolean {
  return geometry.type !== 'highlight' && geometry.type !== 'blur' && geometry.type !== 'text';
}

/**
 * Pure function enforcing the continuous 1..N re-indexing invariant for annotatable callouts.
 * Visual effect shapes (highlight, blur) and text labels are unnumbered (index: 0) and do not consume sequence numbers.
 * Preserves object references if index hasn't changed for fast React memoization.
 */
export function reindexAnnotations(annotations: Annotation[]): Annotation[] {
  let hasChanges = false;
  let nextAnnotatableIndex = 1;
  const reindexed = annotations.map((ann) => {
    const isAnnotatable = isAnnotatableGeometry(ann.geometry);
    const expectedIndex = isAnnotatable ? nextAnnotatableIndex++ : 0;
    if (ann.index === expectedIndex) {
      return ann;
    }
    hasChanges = true;
    return {
      ...ann,
      index: expectedIndex,
    };
  });

  return hasChanges ? reindexed : annotations;
}

/**
 * Normalizes bounding box geometry so width and height are strictly non-negative.
 */
export function normalizeBoxGeometry(box: BoxGeometry): BoxGeometry {
  const x = box.width < 0 ? box.x + box.width : box.x;
  const y = box.height < 0 ? box.y + box.height : box.y;
  const width = Math.abs(box.width);
  const height = Math.abs(box.height);
  return {
    ...box,
    x,
    y,
    width,
    height,
  };
}

/**
 * Normalizes ellipse geometry so radiuses are strictly non-negative.
 */
export function normalizeEllipseGeometry(ellipse: EllipseGeometry): EllipseGeometry {
  return {
    ...ellipse,
    rx: Math.abs(ellipse.rx),
    ry: Math.abs(ellipse.ry),
  };
}

/**
 * Normalizes highlight geometry so width and height are strictly non-negative.
 */
export function normalizeHighlightGeometry(highlight: HighlightGeometry): HighlightGeometry {
  const x = highlight.width < 0 ? highlight.x + highlight.width : highlight.x;
  const y = highlight.height < 0 ? highlight.y + highlight.height : highlight.y;
  const width = Math.abs(highlight.width);
  const height = Math.abs(highlight.height);
  return {
    ...highlight,
    x,
    y,
    width,
    height,
  };
}

/**
 * Normalizes blur geometry so width and height are strictly non-negative.
 */
export function normalizeBlurGeometry(blur: BlurGeometry): BlurGeometry {
  const x = blur.width < 0 ? blur.x + blur.width : blur.x;
  const y = blur.height < 0 ? blur.y + blur.height : blur.y;
  const width = Math.abs(blur.width);
  const height = Math.abs(blur.height);
  return {
    ...blur,
    x,
    y,
    width,
    height,
  };
}

/**
 * Normalizes any annotation geometry before persisting to state.
 */
export function normalizeGeometry(geometry: AnnotationGeometry): AnnotationGeometry {
  switch (geometry.type) {
    case 'box':
      return normalizeBoxGeometry(geometry);
    case 'highlight':
      return normalizeHighlightGeometry(geometry);
    case 'blur':
      return normalizeBlurGeometry(geometry);
    case 'ellipse':
      return normalizeEllipseGeometry(geometry);
    default:
      return geometry;
  }
}

/**
 * Pure immutable AppReducer enforcing all invariants across the application.
 */
export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_IMAGE': {
      return {
        ...state,
        image: action.payload,
        overlays: [],
        frame: undefined,
        // Reset annotations if new image is loaded (0 ghost annotations)
        annotations: [],
        selectedAnnotationId: null,
        hoveredAnnotationId: null,
      };
    }

    case 'CLEAR_IMAGE': {
      return {
        ...state,
        image: null,
        overlays: [],
        frame: undefined,
        annotations: [],
        selectedAnnotationId: null,
        hoveredAnnotationId: null,
        viewport: { ...DEFAULT_VIEWPORT },
      };
    }

    case 'REPLACE_IMAGE_AND_CLEAR': {
      const nextImage =
        action.payload && 'image' in action.payload && action.payload.image
          ? action.payload.image
          : (action.payload as BaseImage);
      return {
        ...state,
        image: nextImage,
        overlays: [],
        frame: undefined,
        annotations: [], // Purge all annotations (0 ghost annotations)
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
        // Preserve annotations array reference & individual style objects verbatim
        annotations: state.annotations.map((ann) => ({
          ...ann,
          style: { ...ann.style },
        })),
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
        selectedAnnotationId: null,
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

    case 'ADD_ANNOTATION': {
      const now = Date.now();
      const newId = action.payload.id || generateUniqueId();
      const normalizedGeo = normalizeGeometry(action.payload.geometry);

      const newAnnotation: Annotation = {
        id: newId,
        index: state.annotations.length + 1,
        geometry: normalizedGeo,
        style: {
          color: action.payload.style?.color ?? state.activeColor,
          strokeWidth: action.payload.style?.strokeWidth ?? state.activeStrokeWidth,
          fillOpacity: action.payload.style?.fillOpacity ?? state.activeFillOpacity,
          ...(action.payload.style?.showBadge !== undefined ? { showBadge: action.payload.style.showBadge } : {}),
        },
        note: action.payload.note ?? '',
        createdAt: now,
        updatedAt: now,
      };

      const updatedAnnotations = reindexAnnotations([...state.annotations, newAnnotation]);

      return {
        ...state,
        annotations: updatedAnnotations,
        selectedAnnotationId: newId,
      };
    }

    case 'UPDATE_ANNOTATION_GEOMETRY': {
      const { id, geometry } = action.payload;
      const normalizedGeo = normalizeGeometry(geometry);
      const now = Date.now();

      const updatedAnnotations = state.annotations.map((ann) => {
        if (ann.id !== id) return ann;
        return {
          ...ann,
          geometry: normalizedGeo,
          updatedAt: now,
        };
      });

      return {
        ...state,
        annotations: updatedAnnotations,
      };
    }

    case 'UPDATE_ANNOTATION_STYLE': {
      const { id, style } = action.payload;
      const now = Date.now();

      const updatedAnnotations = state.annotations.map((ann) => {
        if (ann.id !== id) return ann;
        return {
          ...ann,
          style: {
            ...ann.style,
            ...style,
          },
          updatedAt: now,
        };
      });

      return {
        ...state,
        annotations: updatedAnnotations,
      };
    }

    case 'UPDATE_ANNOTATION_NOTE': {
      const { id, note } = action.payload;
      const now = Date.now();

      const updatedAnnotations = state.annotations.map((ann) => {
        if (ann.id !== id) return ann;
        return {
          ...ann,
          note,
          updatedAt: now,
        };
      });

      return {
        ...state,
        annotations: updatedAnnotations,
      };
    }

    case 'DELETE_ANNOTATION': {
      const { id } = action.payload;
      const filtered = state.annotations.filter((ann) => ann.id !== id);
      const reindexed = reindexAnnotations(filtered);

      return {
        ...state,
        annotations: reindexed,
        selectedAnnotationId: state.selectedAnnotationId === id ? null : state.selectedAnnotationId,
        hoveredAnnotationId: state.hoveredAnnotationId === id ? null : state.hoveredAnnotationId,
      };
    }

    case 'REORDER_ANNOTATIONS': {
      const p = action.payload as {
        fromIndex?: number;
        toIndex?: number;
        sourceIndex?: number;
        destinationIndex?: number;
      };
      const fromIndex = p.fromIndex !== undefined ? p.fromIndex : p.sourceIndex;
      const toIndex = p.toIndex !== undefined ? p.toIndex : p.destinationIndex;

      if (
        fromIndex === undefined ||
        toIndex === undefined ||
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= state.annotations.length ||
        toIndex >= state.annotations.length
      ) {
        return state;
      }

      const nextAnnotations = [...state.annotations];
      const [movedItem] = nextAnnotations.splice(fromIndex, 1);
      nextAnnotations.splice(toIndex, 0, movedItem);

      return {
        ...state,
        annotations: reindexAnnotations(nextAnnotations),
      };
    }

    case 'CLEAR_ALL_ANNOTATIONS': {
      return {
        ...state,
        annotations: [],
        selectedAnnotationId: null,
        hoveredAnnotationId: null,
      };
    }

    case 'SET_ANNOTATIONS': {
      const annotations = reindexAnnotations(action.payload);
      const keep = (id: string | null) => (id && annotations.some((a) => a.id === id) ? id : null);
      return {
        ...state,
        annotations,
        selectedAnnotationId: keep(state.selectedAnnotationId),
        hoveredAnnotationId: keep(state.hoveredAnnotationId),
      };
    }

    case 'SET_FRAME': {
      return {
        ...state,
        frame: action.payload ?? undefined,
      };
    }

    case 'SELECT_ANNOTATION':
    case 'SET_SELECTED_ANNOTATION': {
      return {
        ...state,
        selectedAnnotationId: action.payload,
      };
    }

    case 'HOVER_ANNOTATION':
    case 'SET_HOVERED_ANNOTATION': {
      return {
        ...state,
        hoveredAnnotationId: action.payload,
      };
    }

    case 'SET_ACTIVE_TOOL': {
      return {
        ...state,
        activeTool: action.payload,
      };
    }

    case 'SET_ACTIVE_COLOR': {
      const newColor = action.payload;
      let nextAnnotations = state.annotations;

      // If an annotation is currently selected, also update its color immediately
      if (state.selectedAnnotationId) {
        const now = Date.now();
        nextAnnotations = state.annotations.map((ann) =>
          ann.id === state.selectedAnnotationId
            ? { ...ann, style: { ...ann.style, color: newColor }, updatedAt: now }
            : ann
        );
      }

      return {
        ...state,
        activeColor: newColor,
        annotations: nextAnnotations,
      };
    }

    case 'SET_ACTIVE_STROKE_WIDTH': {
      const newStrokeWidth = action.payload;
      let nextAnnotations = state.annotations;

      // If an annotation is currently selected, update its strokeWidth
      if (state.selectedAnnotationId) {
        const now = Date.now();
        nextAnnotations = state.annotations.map((ann) =>
          ann.id === state.selectedAnnotationId
            ? { ...ann, style: { ...ann.style, strokeWidth: newStrokeWidth }, updatedAt: now }
            : ann
        );
      }

      return {
        ...state,
        activeStrokeWidth: newStrokeWidth,
        annotations: nextAnnotations,
      };
    }

    case 'SET_ACTIVE_FILL_OPACITY': {
      const newFillOpacity = action.payload;
      let nextAnnotations = state.annotations;

      // If an annotation is currently selected, update its fillOpacity
      if (state.selectedAnnotationId) {
        const now = Date.now();
        nextAnnotations = state.annotations.map((ann) =>
          ann.id === state.selectedAnnotationId
            ? { ...ann, style: { ...ann.style, fillOpacity: newFillOpacity }, updatedAt: now }
            : ann
        );
      }

      return {
        ...state,
        activeFillOpacity: newFillOpacity,
        annotations: nextAnnotations,
      };
    }

    case 'SET_VIEWPORT': {
      return {
        ...state,
        viewport: {
          ...state.viewport,
          ...action.payload,
        },
      };
    }

    case 'RESET_VIEWPORT': {
      return {
        ...state,
        viewport: {
          ...DEFAULT_VIEWPORT,
          ...action.payload,
        },
      };
    }

    case 'TOGGLE_SIDEBAR': {
      return {
        ...state,
        isSidebarOpen: !state.isSidebarOpen,
      };
    }

    case 'SET_SIDEBAR_OPEN': {
      return {
        ...state,
        isSidebarOpen: action.payload,
      };
    }

    case 'SET_THEME': {
      return {
        ...state,
        theme: action.payload,
      };
    }

    case 'TOGGLE_THEME': {
      return {
        ...state,
        theme: state.theme === 'dark' ? 'light' : 'dark',
      };
    }

    case 'RESTORE_SNAPSHOT': {
      return {
        ...state,
        annotations: reindexAnnotations(action.payload.annotations),
        selectedAnnotationId: action.payload.selectedAnnotationId,
      };
    }

    case 'RESET_STATE': {
      return createInitialState(action.payload);
    }

    default:
      return state;
  }
}
