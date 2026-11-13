import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  appReducer,
  createInitialState,
  reindexAnnotations,
  normalizeBoxGeometry,
  normalizeEllipseGeometry,
  normalizeHighlightGeometry,
  normalizeBlurGeometry,
  normalizeGeometry,
} from '../../src/state/appReducer';
import {
  createInitialHistory,
  canUndo,
  canRedo,
  undo,
  redo,
  pushHistory,
  TransactionManager,
  MAX_HISTORY_STEPS,
} from '../../src/state/historyManager';
import {
  AppState,
  BoxGeometry,
  HighlightGeometry,
  BlurGeometry,
  EllipseGeometry,
  ArrowGeometry,
  PinGeometry,
  BaseImage,
} from '../../src/types';

describe('appReducer & State Engine', () => {
  let initialState: AppState;

  const mockImage: BaseImage = {
    id: 'img_test_1',
    src: 'data:image/png;base64,mock',
    naturalWidth: 1920,
    naturalHeight: 1080,
    fileName: 'screenshot.png',
    fileSize: 102400,
  };

  const sampleBox: BoxGeometry = {
    type: 'box',
    x: 100,
    y: 150,
    width: 200,
    height: 120,
  };

  const sampleArrow: ArrowGeometry = {
    type: 'arrow',
    startX: 50,
    startY: 50,
    endX: 300,
    endY: 400,
  };

  const samplePin: PinGeometry = {
    type: 'pin',
    x: 500,
    y: 600,
  };

  beforeEach(() => {
    initialState = createInitialState();
  });

  describe('ADD_ANNOTATION ID uniqueness', () => {
    it('preserves a supplied unique ID and selects it', () => {
      const next = appReducer(initialState, { type: 'ADD_ANNOTATION', payload: { id: 'one', geometry: sampleBox } });
      expect(next.annotations[0].id).toBe('one');
      expect(next.selectedAnnotationId).toBe('one');
    });

    it('does not duplicate IDs when a supplied ID and generated IDs collide', () => {
      const spy = vi.spyOn(crypto, 'randomUUID').mockReturnValue('existing' as `${string}-${string}-${string}-${string}-${string}`);
      try {
        const state = appReducer(initialState, { type: 'ADD_ANNOTATION', payload: { id: 'existing', geometry: sampleBox } });
        const next = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'existing', geometry: sampleBox } });
        expect(new Set(next.annotations.map(a => a.id)).size).toBe(2);
        expect(next.selectedAnnotationId).toBe(next.annotations[1].id);
        const third = appReducer(next, { type: 'ADD_ANNOTATION', payload: { geometry: sampleBox } });
        expect(new Set(third.annotations.map(a => a.id)).size).toBe(3);
        expect(third.selectedAnnotationId).toBe(third.annotations[2].id);
        expect(state.annotations).toHaveLength(1);
      } finally { spy.mockRestore(); }
    });
  });

  describe('Suite 1: Continuous 1..N Reindexing Invariant', () => {
    it('T1.1: Empty annotations list returns empty array', () => {
      expect(reindexAnnotations([])).toEqual([]);
    });

    it('T1.2: Adding a single annotation assigns index 1', () => {
      const state = appReducer(initialState, {
        type: 'ADD_ANNOTATION',
        payload: { geometry: sampleBox },
      });

      expect(state.annotations).toHaveLength(1);
      expect(state.annotations[0].index).toBe(1);
      expect(state.selectedAnnotationId).toBe(state.annotations[0].id);
    });

    it('T1.3: Adding 4 annotations sequentially assigns continuous indices 1, 2, 3, 4', () => {
      let state = initialState;
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { geometry: sampleBox } });
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { geometry: sampleArrow } });
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { geometry: samplePin } });
      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: { geometry: { type: 'ellipse', cx: 200, cy: 200, rx: 50, ry: 50 } },
      });

      expect(state.annotations).toHaveLength(4);
      expect(state.annotations.map((a) => a.index)).toEqual([1, 2, 3, 4]);
    });

    it('T1.4: Deleting first annotation (index 1) re-indexes remaining items to 1..3', () => {
      let state = initialState;
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a1', geometry: sampleBox } });
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a2', geometry: sampleArrow } });
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a3', geometry: samplePin } });
      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: { id: 'a4', geometry: { type: 'ellipse', cx: 200, cy: 200, rx: 50, ry: 50 } },
      });

      state = appReducer(state, { type: 'DELETE_ANNOTATION', payload: { id: 'a1' } });

      expect(state.annotations).toHaveLength(3);
      expect(state.annotations.map((a) => a.id)).toEqual(['a2', 'a3', 'a4']);
      expect(state.annotations.map((a) => a.index)).toEqual([1, 2, 3]);
    });

    it('T1.5: Deleting middle annotation preserves continuity without gap', () => {
      let state = initialState;
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a1', geometry: sampleBox } });
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a2', geometry: sampleArrow } });
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a3', geometry: samplePin } });

      state = appReducer(state, { type: 'DELETE_ANNOTATION', payload: { id: 'a2' } });

      expect(state.annotations).toHaveLength(2);
      expect(state.annotations[0].id).toBe('a1');
      expect(state.annotations[0].index).toBe(1);
      expect(state.annotations[1].id).toBe('a3');
      expect(state.annotations[1].index).toBe(2);
    });

    it('T1.6: Reordering annotations (move index 2 to index 0) strictly updates 1..N indices', () => {
      let state = initialState;
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a1', geometry: sampleBox } });
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a2', geometry: sampleArrow } });
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a3', geometry: samplePin } });

      // Move 'a3' (index 2) to top (index 0)
      state = appReducer(state, {
        type: 'REORDER_ANNOTATIONS',
        payload: { fromIndex: 2, toIndex: 0 },
      });

      expect(state.annotations.map((a) => a.id)).toEqual(['a3', 'a1', 'a2']);
      expect(state.annotations.map((a) => a.index)).toEqual([1, 2, 3]);
    });

    it('T1.7: CLEAR_ALL_ANNOTATIONS empties list and clears selection', () => {
      let state = initialState;
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a1', geometry: sampleBox } });
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a2', geometry: sampleArrow } });

      state = appReducer(state, { type: 'CLEAR_ALL_ANNOTATIONS' });

      expect(state.annotations).toEqual([]);
      expect(state.selectedAnnotationId).toBeNull();
      expect(state.hoveredAnnotationId).toBeNull();
    });
  });

  describe('Suite 2: Geometry Normalization & Mutations', () => {
    it('T2.1: Normalizes inverted box drag coordinates (negative width/height)', () => {
      const invertedBox: BoxGeometry = {
        type: 'box',
        x: 300,
        y: 400,
        width: -100,
        height: -150,
      };

      const normalized = normalizeBoxGeometry(invertedBox);
      expect(normalized).toEqual({
        type: 'box',
        x: 200,
        y: 250,
        width: 100,
        height: 150,
      });
    });

    it('T2.2: Normalizes negative ellipse radii', () => {
      const ellipse: EllipseGeometry = {
        type: 'ellipse',
        cx: 100,
        cy: 100,
        rx: -40,
        ry: -60,
      };

      const normalized = normalizeEllipseGeometry(ellipse);
      expect(normalized.rx).toBe(40);
      expect(normalized.ry).toBe(60);
    });

    it('T2.3: UPDATE_ANNOTATION_GEOMETRY updates spatial bounds and timestamp', () => {
      let state = initialState;
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a1', geometry: sampleBox } });

      const updatedBox: BoxGeometry = { ...sampleBox, x: 250, width: 350 };
      state = appReducer(state, {
        type: 'UPDATE_ANNOTATION_GEOMETRY',
        payload: { id: 'a1', geometry: updatedBox },
      });

      expect(state.annotations[0].geometry).toEqual(updatedBox);
      expect(state.annotations[0].index).toBe(1);
    });

    it('T2.4: UPDATE_ANNOTATION_STYLE updates style properties', () => {
      let state = initialState;
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a1', geometry: sampleBox } });

      state = appReducer(state, {
        type: 'UPDATE_ANNOTATION_STYLE',
        payload: { id: 'a1', style: { color: 'purple', strokeWidth: 6, fillOpacity: 0.4 } },
      });

      expect(state.annotations[0].style.color).toBe('purple');
      expect(state.annotations[0].style.strokeWidth).toBe(6);
      expect(state.annotations[0].style.fillOpacity).toBe(0.4);
    });

    it('T2.5: UPDATE_ANNOTATION_NOTE updates markdown note content', () => {
      let state = initialState;
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a1', geometry: sampleBox } });

      const noteText = '### Issue Description\nNeed to align container padding.';
      state = appReducer(state, {
        type: 'UPDATE_ANNOTATION_NOTE',
        payload: { id: 'a1', note: noteText },
      });

      expect(state.annotations[0].note).toBe(noteText);
    });

    it('T2.6: SET_ACTIVE_COLOR updates activeColor and recolors selected annotation', () => {
      let state = initialState;
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a1', geometry: sampleBox } });
      expect(state.selectedAnnotationId).toBe('a1');

      state = appReducer(state, { type: 'SET_ACTIVE_COLOR', payload: 'green' });

      expect(state.activeColor).toBe('green');
      expect(state.annotations[0].style.color).toBe('green');
    });
  });

  describe('Suite 3: Selection, Hover & Viewport State', () => {
    it('T3.1: SELECT_ANNOTATION sets selectedAnnotationId', () => {
      let state = initialState;
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a1', geometry: sampleBox } });
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a2', geometry: sampleArrow } });

      state = appReducer(state, { type: 'SELECT_ANNOTATION', payload: 'a1' });
      expect(state.selectedAnnotationId).toBe('a1');

      state = appReducer(state, { type: 'SELECT_ANNOTATION', payload: null });
      expect(state.selectedAnnotationId).toBeNull();
    });

    it('T3.2: Deleting selected annotation clears selection to null', () => {
      let state = initialState;
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a1', geometry: sampleBox } });
      expect(state.selectedAnnotationId).toBe('a1');

      state = appReducer(state, { type: 'DELETE_ANNOTATION', payload: { id: 'a1' } });
      expect(state.selectedAnnotationId).toBeNull();
    });

    it('T3.3: Deleting unselected annotation does not clear active selection', () => {
      let state = initialState;
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a1', geometry: sampleBox } });
      state = appReducer(state, { type: 'ADD_ANNOTATION', payload: { id: 'a2', geometry: sampleArrow } });
      state = appReducer(state, { type: 'SELECT_ANNOTATION', payload: 'a2' });

      state = appReducer(state, { type: 'DELETE_ANNOTATION', payload: { id: 'a1' } });
      expect(state.selectedAnnotationId).toBe('a2');
    });

    it('T3.4: HOVER_ANNOTATION sets and clears hoveredAnnotationId', () => {
      let state = initialState;
      state = appReducer(state, { type: 'HOVER_ANNOTATION', payload: 'a1' });
      expect(state.hoveredAnnotationId).toBe('a1');

      state = appReducer(state, { type: 'HOVER_ANNOTATION', payload: null });
      expect(state.hoveredAnnotationId).toBeNull();
    });

    it('T3.5: SET_VIEWPORT and RESET_VIEWPORT modify viewport state', () => {
      let state = initialState;
      state = appReducer(state, {
        type: 'SET_VIEWPORT',
        payload: { zoom: 2.5, panX: 120, panY: -45 },
      });

      expect(state.viewport).toEqual({ zoom: 2.5, panX: 120, panY: -45 });

      state = appReducer(state, { type: 'RESET_VIEWPORT' });
      expect(state.viewport).toEqual({ zoom: 1.0, panX: 0, panY: 0 });
    });

    it('T3.6: SET_IMAGE and CLEAR_IMAGE manage base image state lifecycle', () => {
      let state = initialState;
      state = appReducer(state, { type: 'SET_IMAGE', payload: mockImage });
      expect(state.image).toEqual(mockImage);

      state = appReducer(state, { type: 'CLEAR_IMAGE' });
      expect(state.image).toBeNull();
      expect(state.annotations).toEqual([]);
    });

    it('T3.7: TOGGLE_SIDEBAR and THEME actions update UI flags', () => {
      let state = initialState;
      expect(state.isSidebarOpen).toBe(true);

      state = appReducer(state, { type: 'TOGGLE_SIDEBAR' });
      expect(state.isSidebarOpen).toBe(false);

      state = appReducer(state, { type: 'SET_SIDEBAR_OPEN', payload: true });
      expect(state.isSidebarOpen).toBe(true);

      expect(state.theme).toBe('dark');
      state = appReducer(state, { type: 'TOGGLE_THEME' });
      expect(state.theme).toBe('light');
    });
  });

  describe('Suite 4: History Stack & Undo/Redo Engine', () => {
    it('T4.1: Initial history cannot undo or redo', () => {
      const history = createInitialHistory();
      expect(canUndo(history)).toBe(false);
      expect(canRedo(history)).toBe(false);
    });

    it('T4.2: Pushing snapshots updates past stack and enables undo', () => {
      let history = createInitialHistory();
      const snap1 = { annotations: [{ id: '1', index: 1, geometry: sampleBox, style: { color: 'amber' as const, strokeWidth: 3, fillOpacity: 0.15 }, note: '', createdAt: 1, updatedAt: 1 }], selectedAnnotationId: '1' };

      history = pushHistory(history, snap1);

      expect(canUndo(history)).toBe(true);
      expect(canRedo(history)).toBe(false);
      expect(history.present).toEqual(snap1);
      expect(history.past).toHaveLength(1);
    });

    it('T4.3: Undo restores previous snapshot and enables redo', () => {
      let history = createInitialHistory();
      const snap1 = { annotations: [{ id: '1', index: 1, geometry: sampleBox, style: { color: 'amber' as const, strokeWidth: 3, fillOpacity: 0.15 }, note: '', createdAt: 1, updatedAt: 1 }], selectedAnnotationId: '1' };
      const snap2 = { annotations: [...snap1.annotations, { id: '2', index: 2, geometry: sampleArrow, style: { color: 'red' as const, strokeWidth: 3, fillOpacity: 0.15 }, note: '', createdAt: 2, updatedAt: 2 }], selectedAnnotationId: '2' };

      history = pushHistory(history, snap1);
      history = pushHistory(history, snap2);

      expect(history.present.annotations).toHaveLength(2);

      history = undo(history);
      expect(history.present).toEqual(snap1);
      expect(canRedo(history)).toBe(true);

      history = redo(history);
      expect(history.present).toEqual(snap2);
    });

    it('T4.4: Pushing a new mutation after undo clears redo stack (future)', () => {
      let history = createInitialHistory();
      const snap1 = { annotations: [{ id: '1', index: 1, geometry: sampleBox, style: { color: 'amber' as const, strokeWidth: 3, fillOpacity: 0.15 }, note: '', createdAt: 1, updatedAt: 1 }], selectedAnnotationId: '1' };
      const snap2 = { annotations: [...snap1.annotations, { id: '2', index: 2, geometry: sampleArrow, style: { color: 'red' as const, strokeWidth: 3, fillOpacity: 0.15 }, note: '', createdAt: 2, updatedAt: 2 }], selectedAnnotationId: '2' };
      const snap3 = { annotations: [...snap1.annotations, { id: '3', index: 2, geometry: samplePin, style: { color: 'green' as const, strokeWidth: 3, fillOpacity: 0.15 }, note: '', createdAt: 3, updatedAt: 3 }], selectedAnnotationId: '3' };

      history = pushHistory(history, snap1);
      history = pushHistory(history, snap2);
      history = undo(history);
      expect(canRedo(history)).toBe(true);

      history = pushHistory(history, snap3);
      expect(canRedo(history)).toBe(false);
      expect(history.future).toEqual([]);
      expect(history.present).toEqual(snap3);
    });

    it('T4.5: History past stack does not exceed MAX_HISTORY_STEPS (50)', () => {
      let history = createInitialHistory();

      for (let i = 1; i <= 60; i++) {
        const snap = {
          annotations: [
            {
              id: `ann_${i}`,
              index: 1,
              geometry: { type: 'pin' as const, x: i * 10, y: i * 10 },
              style: { color: 'cyan' as const, strokeWidth: 3, fillOpacity: 0.15 },
              note: `Note ${i}`,
              createdAt: i,
              updatedAt: i,
            },
          ],
          selectedAnnotationId: `ann_${i}`,
        };
        history = pushHistory(history, snap);
      }

      expect(history.past.length).toBe(MAX_HISTORY_STEPS);
    });
  });

  describe('Suite 5: Transaction Batching for Drag/Resize Gestures', () => {
    it('T5.1: TransactionManager batches intermediate drag updates into a single history push on pointerup', () => {
      const txManager = new TransactionManager();
      let history = createInitialHistory();

      const initialSnap = {
        annotations: [{ id: 'a1', index: 1, geometry: sampleBox, style: { color: 'amber' as const, strokeWidth: 3, fillOpacity: 0.15 }, note: '', createdAt: 1, updatedAt: 1 }],
        selectedAnnotationId: 'a1',
      };
      history = pushHistory(history, initialSnap);

      // Start drag transaction (pointerdown)
      txManager.beginTransaction(initialSnap);
      expect(txManager.isTransactionActive()).toBe(true);

      // Multiple intermediate moves (pointermove) do NOT push to history
      const move1 = { ...initialSnap, annotations: [{ ...initialSnap.annotations[0], geometry: { ...sampleBox, x: 105 } }] };
      const move2 = { ...initialSnap, annotations: [{ ...initialSnap.annotations[0], geometry: { ...sampleBox, x: 120 } }] };
      expect((move1.annotations[0].geometry as BoxGeometry).x).toBe(105);
      expect((move2.annotations[0].geometry as BoxGeometry).x).toBe(120);
      const finalMove = { ...initialSnap, annotations: [{ ...initialSnap.annotations[0], geometry: { ...sampleBox, x: 150 } }] };

      // Commit transaction on pointerup
      history = txManager.commitTransaction(history, finalMove);
      expect(txManager.isTransactionActive()).toBe(false);

      // Verify exactly 1 history step was committed
      expect(history.present.annotations[0].geometry).toEqual({ ...sampleBox, x: 150 });
      history = undo(history);
      expect(history.present.annotations[0].geometry).toEqual(sampleBox);
    });

    it('T5.2: Cancelling transaction rolls back to starting snapshot', () => {
      const txManager = new TransactionManager();
      const initialSnap = {
        annotations: [{ id: 'a1', index: 1, geometry: sampleBox, style: { color: 'amber' as const, strokeWidth: 3, fillOpacity: 0.15 }, note: '', createdAt: 1, updatedAt: 1 }],
        selectedAnnotationId: 'a1',
      };

      txManager.beginTransaction(initialSnap);
      const rollback = txManager.cancelTransaction();

      expect(rollback).toEqual(initialSnap);
      expect(txManager.isTransactionActive()).toBe(false);
    });
  });

  describe('Suite 6: Highlight / Spotlight Tool Reducer Invariants', () => {
    it('T6.1: normalizeHighlightGeometry normalizes inverted drag coordinates (negative width & height)', () => {
      const inverted: HighlightGeometry = {
        type: 'highlight',
        x: 400,
        y: 300,
        width: -250,
        height: -180,
      };
      const normalized = normalizeHighlightGeometry(inverted);
      expect(normalized).toEqual({
        type: 'highlight',
        x: 150,
        y: 120,
        width: 250,
        height: 180,
      });
    });

    it('T6.2: normalizeGeometry with type highlight normalizes bounds correctly', () => {
      const inverted: HighlightGeometry = {
        type: 'highlight',
        x: 100,
        y: 200,
        width: -50,
        height: 80,
      };
      const normalized = normalizeGeometry(inverted) as HighlightGeometry;
      expect(normalized.type).toBe('highlight');
      expect(normalized.x).toBe(50);
      expect(normalized.y).toBe(200);
      expect(normalized.width).toBe(50);
      expect(normalized.height).toBe(80);
    });

    it('T6.3: SET_ACTIVE_TOOL to highlight updates activeTool state', () => {
      const state = appReducer(initialState, {
        type: 'SET_ACTIVE_TOOL',
        payload: 'highlight',
      });
      expect(state.activeTool).toBe('highlight');
    });

    it('T6.4: ADD_ANNOTATION with HighlightGeometry assigns unnumbered (0) index and selects it', () => {
      const highlightGeom: HighlightGeometry = {
        type: 'highlight',
        x: 100,
        y: 100,
        width: 200,
        height: 150,
      };
      const state = appReducer(initialState, {
        type: 'ADD_ANNOTATION',
        payload: {
          geometry: highlightGeom,
          note: 'Spotlight main headline',
        },
      });

      expect(state.annotations).toHaveLength(1);
      expect(state.annotations[0].index).toBe(0);
      expect(state.annotations[0].geometry).toEqual(highlightGeom);
      expect(state.annotations[0].note).toBe('Spotlight main headline');
      expect(state.selectedAnnotationId).toBe(state.annotations[0].id);
    });

    it('T6.5: UPDATE_ANNOTATION_GEOMETRY preserves highlight type and updates position', () => {
      const initialGeom: HighlightGeometry = {
        type: 'highlight',
        x: 50,
        y: 50,
        width: 100,
        height: 100,
      };
      let state = appReducer(initialState, {
        type: 'ADD_ANNOTATION',
        payload: { id: 'hl-1', geometry: initialGeom },
      });

      const movedGeom: HighlightGeometry = {
        type: 'highlight',
        x: 80,
        y: 120,
        width: 150,
        height: 130,
      };
      state = appReducer(state, {
        type: 'UPDATE_ANNOTATION_GEOMETRY',
        payload: { id: 'hl-1', geometry: movedGeom },
      });

      expect(state.annotations[0].geometry).toEqual(movedGeom);
    });

    it('T6.6: Deleting an unnumbered highlight preserves sequential (1..N) indexing of callouts', () => {
      let state = initialState;
      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: { id: 'a1', geometry: sampleBox },
      });
      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: {
          id: 'hl-1',
          geometry: { type: 'highlight', x: 200, y: 200, width: 100, height: 100 },
        },
      });
      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: { id: 'a3', geometry: samplePin },
      });

      expect(state.annotations.map((a) => a.index)).toEqual([1, 0, 2]);

      state = appReducer(state, {
        type: 'DELETE_ANNOTATION',
        payload: { id: 'hl-1' },
      });

      expect(state.annotations).toHaveLength(2);
      expect(state.annotations[0].id).toBe('a1');
      expect(state.annotations[0].index).toBe(1);
      expect(state.annotations[1].id).toBe('a3');
      expect(state.annotations[1].index).toBe(2);
    });

    it('T6.7: Undo/Redo restores highlight geometry moves correctly and detects snapshot differences', () => {
      const snap1 = {
        annotations: [
          {
            id: 'hl-1',
            index: 1,
            geometry: { type: 'highlight' as const, x: 50, y: 50, width: 100, height: 100 },
            style: { color: 'amber' as const, strokeWidth: 3, fillOpacity: 0.15 },
            note: '',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        selectedAnnotationId: 'hl-1',
      };
      let history = createInitialHistory(snap1.annotations, snap1.selectedAnnotationId);

      const snap2 = {
        annotations: [
          {
            id: 'hl-1',
            index: 1,
            geometry: { type: 'highlight' as const, x: 150, y: 150, width: 200, height: 200 },
            style: { color: 'amber' as const, strokeWidth: 3, fillOpacity: 0.15 },
            note: '',
            createdAt: 1,
            updatedAt: 2,
          },
        ],
        selectedAnnotationId: 'hl-1',
      };
      history = pushHistory(history, snap2);

      expect(history.past).toHaveLength(1);
      expect((history.present.annotations[0].geometry as HighlightGeometry).x).toBe(150);

      history = undo(history);
      expect((history.present.annotations[0].geometry as HighlightGeometry).x).toBe(50);

      history = redo(history);
      expect((history.present.annotations[0].geometry as HighlightGeometry).x).toBe(150);
    });
  });

  // =========================================================================
  // Suite 7: Blur Tool Reducer & Geometry Normalization (Milestone M3)
  // =========================================================================
  describe('Suite 7: Blur Tool Reducer & Geometry Normalization', () => {
    it('T7.1: normalizeBlurGeometry flips negative width and height to positive values', () => {
      const invertedBlur: BlurGeometry = {
        type: 'blur',
        x: 400,
        y: 300,
        width: -200,
        height: -150,
      };
      const normalized = normalizeBlurGeometry(invertedBlur);

      expect(normalized).toEqual({
        type: 'blur',
        x: 200,
        y: 150,
        width: 200,
        height: 150,
      });
    });

    it('T7.2: normalizeGeometry routes blur type through normalizeBlurGeometry', () => {
      const raw: BlurGeometry = {
        type: 'blur',
        x: 500,
        y: 200,
        width: -100,
        height: 50,
      };
      const result = normalizeGeometry(raw) as BlurGeometry;

      expect(result.x).toBe(400);
      expect(result.width).toBe(100);
      expect(result.height).toBe(50);
    });

    it('T7.3: SET_ACTIVE_TOOL handles blur tool selection', () => {
      let state = initialState;
      state = appReducer(state, { type: 'SET_ACTIVE_TOOL', payload: 'blur' });
      expect(state.activeTool).toBe('blur');
    });

    it('T7.4: ADD_ANNOTATION adds blur annotation with unnumbered (0) index', () => {
      let state = initialState;
      const blurGeo: BlurGeometry = { type: 'blur', x: 50, y: 80, width: 250, height: 120 };

      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: {
          id: 'blur-1',
          geometry: blurGeo,
          note: 'Sensitive data redaction',
        },
      });

      expect(state.annotations).toHaveLength(1);
      expect(state.annotations[0].id).toBe('blur-1');
      expect(state.annotations[0].index).toBe(0);
      expect(state.annotations[0].geometry.type).toBe('blur');
      expect(state.selectedAnnotationId).toBe('blur-1');
    });

    it('T7.5: UPDATE_ANNOTATION_GEOMETRY normalizes modified blur geometry', () => {
      let state = initialState;
      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: {
          id: 'blur-1',
          geometry: { type: 'blur', x: 100, y: 100, width: 200, height: 100 },
        },
      });

      state = appReducer(state, {
        type: 'UPDATE_ANNOTATION_GEOMETRY',
        payload: {
          id: 'blur-1',
          geometry: { type: 'blur', x: 300, y: 200, width: -150, height: -80 },
        },
      });

      const updated = state.annotations[0].geometry as BlurGeometry;
      expect(updated.x).toBe(150);
      expect(updated.y).toBe(120);
      expect(updated.width).toBe(150);
      expect(updated.height).toBe(80);
    });

    it('T7.6: Re-indexes annotations dynamically preserving unnumbered blur when mixed shapes are deleted', () => {
      let state = initialState;
      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: { id: 'a1', geometry: sampleBox },
      });
      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: {
          id: 'blur-1',
          geometry: { type: 'blur', x: 200, y: 200, width: 100, height: 100 },
        },
      });
      state = appReducer(state, {
        type: 'ADD_ANNOTATION',
        payload: { id: 'a3', geometry: samplePin },
      });

      expect(state.annotations.map((a) => a.index)).toEqual([1, 0, 2]);

      state = appReducer(state, {
        type: 'DELETE_ANNOTATION',
        payload: { id: 'blur-1' },
      });

      expect(state.annotations).toHaveLength(2);
      expect(state.annotations[0].id).toBe('a1');
      expect(state.annotations[0].index).toBe(1);
      expect(state.annotations[1].id).toBe('a3');
      expect(state.annotations[1].index).toBe(2);
    });

    it('T7.7: Undo/Redo restores blur geometry moves correctly and detects snapshot differences', () => {
      const snap1 = {
        annotations: [
          {
            id: 'blur-1',
            index: 1,
            geometry: { type: 'blur' as const, x: 50, y: 50, width: 100, height: 100 },
            style: { color: 'amber' as const, strokeWidth: 3, fillOpacity: 0.15 },
            note: '',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        selectedAnnotationId: 'blur-1',
      };
      let history = createInitialHistory(snap1.annotations, snap1.selectedAnnotationId);

      const snap2 = {
        annotations: [
          {
            id: 'blur-1',
            index: 1,
            geometry: { type: 'blur' as const, x: 150, y: 150, width: 200, height: 200 },
            style: { color: 'amber' as const, strokeWidth: 3, fillOpacity: 0.15 },
            note: '',
            createdAt: 1,
            updatedAt: 2,
          },
        ],
        selectedAnnotationId: 'blur-1',
      };
      history = pushHistory(history, snap2);

      expect(history.past).toHaveLength(1);
      expect((history.present.annotations[0].geometry as BlurGeometry).x).toBe(150);

      history = undo(history);
      expect((history.present.annotations[0].geometry as BlurGeometry).x).toBe(50);

      history = redo(history);
      expect((history.present.annotations[0].geometry as BlurGeometry).x).toBe(150);
    });
  });
});
