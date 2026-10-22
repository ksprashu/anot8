import { Annotation, HistorySnapshot, HistoryState } from '../types';

export const MAX_HISTORY_STEPS = 50;

/**
 * Creates an empty initial history state.
 */
export function createInitialHistory(
  annotations: Annotation[] = [],
  selectedAnnotationId: string | null = null
): HistoryState {
  return {
    past: [],
    present: {
      annotations,
      selectedAnnotationId,
    },
    future: [],
  };
}

/**
 * Checks if undo is possible.
 */
export function canUndo(history: HistoryState): boolean {
  return history.past.length > 0;
}

/**
 * Checks if redo is possible.
 */
export function canRedo(history: HistoryState): boolean {
  return history.future.length > 0;
}

/**
 * Deep equality check for history snapshots to prevent redundant history pushes.
 */
export function isSnapshotEqual(a: HistorySnapshot, b: HistorySnapshot): boolean {
  if (a === b) return true;
  if (a.selectedAnnotationId !== b.selectedAnnotationId) return false;
  if (a.annotations.length !== b.annotations.length) return false;

  for (let i = 0; i < a.annotations.length; i++) {
    const annA = a.annotations[i];
    const annB = b.annotations[i];
    if (
      annA.id !== annB.id ||
      annA.index !== annB.index ||
      annA.note !== annB.note ||
      annA.style.color !== annB.style.color ||
      annA.style.strokeWidth !== annB.style.strokeWidth ||
      annA.style.fillOpacity !== annB.style.fillOpacity ||
      annA.style.showBadge !== annB.style.showBadge
    ) {
      return false;
    }

    // Compare geometries
    const gA = annA.geometry;
    const gB = annB.geometry;
    if (gA.type !== gB.type) return false;

    if (gA.type === 'box' && gB.type === 'box') {
      if (gA.x !== gB.x || gA.y !== gB.y || gA.width !== gB.width || gA.height !== gB.height) {
        return false;
      }
    } else if (gA.type === 'highlight' && gB.type === 'highlight') {
      if (gA.x !== gB.x || gA.y !== gB.y || gA.width !== gB.width || gA.height !== gB.height) {
        return false;
      }
    } else if (gA.type === 'blur' && gB.type === 'blur') {
      if (gA.x !== gB.x || gA.y !== gB.y || gA.width !== gB.width || gA.height !== gB.height) {
        return false;
      }
    } else if (gA.type === 'ellipse' && gB.type === 'ellipse') {
      if (gA.cx !== gB.cx || gA.cy !== gB.cy || gA.rx !== gB.rx || gA.ry !== gB.ry) {
        return false;
      }
    } else if (gA.type === 'arrow' && gB.type === 'arrow') {
      if (gA.startX !== gB.startX || gA.startY !== gB.startY || gA.endX !== gB.endX || gA.endY !== gB.endY) {
        return false;
      }
    } else if (gA.type === 'pin' && gB.type === 'pin') {
      if (gA.x !== gB.x || gA.y !== gB.y) {
        return false;
      }
    } else if (gA.type === 'text' && gB.type === 'text') {
      if (
        gA.x !== gB.x ||
        gA.y !== gB.y ||
        gA.text !== gB.text ||
        gA.fontSize !== gB.fontSize ||
        gA.align !== gB.align
      ) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Pushes a new snapshot to history. Capped at MAX_HISTORY_STEPS (50).
 * Clears future (redo stack).
 */
export function pushHistory(history: HistoryState, newSnapshot: HistorySnapshot): HistoryState {
  if (isSnapshotEqual(history.present, newSnapshot)) {
    return history;
  }

  const nextPast = [...history.past, history.present].slice(-MAX_HISTORY_STEPS);

  return {
    past: nextPast,
    present: newSnapshot,
    future: [],
  };
}

/**
 * Performs an undo operation.
 */
export function undo(history: HistoryState): HistoryState {
  if (!canUndo(history)) {
    return history;
  }

  const previous = history.past[history.past.length - 1];
  const nextPast = history.past.slice(0, history.past.length - 1);

  return {
    past: nextPast,
    present: previous,
    future: [history.present, ...history.future],
  };
}

/**
 * Performs a redo operation.
 */
export function redo(history: HistoryState): HistoryState {
  if (!canRedo(history)) {
    return history;
  }

  const next = history.future[0];
  const nextFuture = history.future.slice(1);
  const nextPast = [...history.past, history.present].slice(-MAX_HISTORY_STEPS);

  return {
    past: nextPast,
    present: next,
    future: nextFuture,
  };
}

/**
 * Resets history to a new snapshot.
 */
export function resetHistory(snapshot: HistorySnapshot): HistoryState {
  return {
    past: [],
    present: snapshot,
    future: [],
  };
}

/**
 * TransactionManager handles drag/resize gesture batching.
 * - On pointerdown: beginTransaction records starting state.
 * - On pointermove: transient updates occur without pushing history.
 * - On pointerup: commitTransaction compares final with start snapshot and pushes exactly 1 history step.
 */
export class TransactionManager {
  private startSnapshot: HistorySnapshot | null = null;

  public beginTransaction(currentSnapshot: HistorySnapshot): void {
    this.startSnapshot = {
      annotations: [...currentSnapshot.annotations],
      selectedAnnotationId: currentSnapshot.selectedAnnotationId,
    };
  }

  public isTransactionActive(): boolean {
    return this.startSnapshot !== null;
  }

  public getStartSnapshot(): HistorySnapshot | null {
    return this.startSnapshot;
  }

  public commitTransaction(history: HistoryState, finalSnapshot: HistorySnapshot): HistoryState {
    if (!this.startSnapshot) {
      return pushHistory(history, finalSnapshot);
    }

    const start = this.startSnapshot;
    this.startSnapshot = null;

    // If no net change occurred during gesture, return unmodified history
    if (isSnapshotEqual(start, finalSnapshot)) {
      return history;
    }

    // Commit single history entry from start to final
    const nextPast = [...history.past, start].slice(-MAX_HISTORY_STEPS);
    return {
      past: nextPast,
      present: finalSnapshot,
      future: [],
    };
  }

  public cancelTransaction(): HistorySnapshot | null {
    const start = this.startSnapshot;
    this.startSnapshot = null;
    return start;
  }
}
