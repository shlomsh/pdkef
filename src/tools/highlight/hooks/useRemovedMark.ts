import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

/** @testSeam */
export const UNDO_CHIP_MS = 5000; // guidelines §6

type At = { x: number; y: number } | null;

/** The Undo chip after a delete: five seconds, and any later change to `elements` ends it. */
export function useRemovedMark(elements: readonly unknown[]) {
  const [removed, setRemoved] = useState<{ at: At } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef<readonly unknown[] | null>(null);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    held.current = null;
    setRemoved(null);
  }, []);

  const show = useCallback((at: At) => {
    if (timer.current) clearTimeout(timer.current);
    held.current = null;
    setRemoved({ at });
    timer.current = setTimeout(dismiss, UNDO_CHIP_MS);
  }, [dismiss]);

  useEffect(() => {
    if (!removed) return;
    if (held.current === null) { held.current = elements; return; }
    if (held.current !== elements) dismiss();
  }, [elements, removed, dismiss]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { removed, show, dismiss };
}
