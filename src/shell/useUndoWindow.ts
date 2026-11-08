import { useEffect, useRef } from 'preact/hooks';

/** How long an Undo chip stays up (docs/ux-design-guidelines.md, 6. Undo over confirm). */
export const UNDO_WINDOW_MS = 5000;

export interface UndoWindow {
  /** Opens the window, or restarts it: a second removal replaces the first chip rather than stacking. */
  start(): void;
  /** Closes the window early (Undo pressed, the work it names changed) without calling `onExpire`. */
  stop(): void;
}

/**
 * The timer behind an Undo chip, so each tool keeps only what the chip names. The window ends on its
 * own after UNDO_WINDOW_MS by calling the latest `onExpire`, and an unmount clears it.
 */
export function useUndoWindow(onExpire: () => void): UndoWindow {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expire = useRef(onExpire);
  expire.current = onExpire;
  const api = useRef<UndoWindow>({
    stop() {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    },
    start() {
      api.current.stop();
      timer.current = setTimeout(() => {
        timer.current = null;
        expire.current();
      }, UNDO_WINDOW_MS);
    },
  });
  useEffect(() => () => api.current.stop(), []);
  return api.current;
}
