import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useUndoWindow } from '#shell/useUndoWindow.ts';

type At = { x: number; y: number } | null;

/** The Undo chip after a delete: the shared undo window, and any later change to `elements` ends it. */
export function useRemovedMark(elements: readonly unknown[]) {
  const [removed, setRemoved] = useState<{ at: At } | null>(null);
  const held = useRef<readonly unknown[] | null>(null);

  const clear = useCallback(() => {
    held.current = null;
    setRemoved(null);
  }, []);
  const undoWindow = useUndoWindow(clear);

  const dismiss = useCallback(() => {
    undoWindow.stop();
    clear();
  }, [undoWindow, clear]);

  const show = useCallback((at: At) => {
    held.current = null;
    setRemoved({ at });
    undoWindow.start();
  }, [undoWindow]);

  useEffect(() => {
    if (!removed) return;
    if (held.current === null) { held.current = elements; return; }
    if (held.current !== elements) dismiss();
  }, [elements, removed, dismiss]);

  return { removed, show, dismiss };
}
