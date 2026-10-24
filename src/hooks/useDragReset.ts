import { useEffect, useRef } from 'react';

/** Dispatched on window when a drop is handled elsewhere (e.g. a spec file caught in the capture phase). */
export const DRAG_RESET_EVENT = 'anot8:drag-reset';

export function dispatchDragReset(): void {
  window.dispatchEvent(new Event(DRAG_RESET_EVENT));
}

/** Calls reset whenever another handler swallowed the drop, so drag-over overlays don't stay stuck. */
export function useDragReset(reset: () => void): void {
  const resetRef = useRef(reset);
  resetRef.current = reset;
  useEffect(() => {
    const onReset = () => resetRef.current();
    window.addEventListener(DRAG_RESET_EVENT, onReset);
    return () => window.removeEventListener(DRAG_RESET_EVENT, onReset);
  }, []);
}
