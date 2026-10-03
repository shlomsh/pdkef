import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { recordAction } from './actionTrail.ts';

export interface UndoChipAction {
  message: string;
  perform: () => void;
}

/**
 * The single-slot undo chip Merge and Split share: the next registered undo
 * replaces a pending one rather than stacking, and the chip clears itself
 * after `windowMs`. `clear` is for a new document (a stale undo must not run
 * on it); the timer is dropped on unmount.
 */
export function useUndoChip(windowMs = 5000) {
  const [action, setAction] = useState<UndoChipAction | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setAction(null);
  }, []);

  const register = useCallback(
    (message: string, perform: () => void) => {
      if (timer.current) clearTimeout(timer.current);
      setAction({ message, perform });
      timer.current = setTimeout(() => setAction(null), windowMs);
    },
    [windowMs],
  );

  const run = useCallback(() => {
    if (!action) return;
    clear();
    action.perform();
    recordAction('undo');
  }, [action, clear]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { action, register, clear, run };
}
