import { useCallback, useEffect, useRef } from 'preact/hooks';
import type { Dispatch } from 'preact/hooks';
import type { MergeAction } from '../state/mergeState.ts';

/**
 * The two once-only lines that time themselves out. The visible flags live in
 * the reducer; this hook owns only the timers and the "already shown" latch.
 *   - the restored-draft sentence: five seconds, then it gives way for good
 *     to the small "Draft saved" chip (Direction A wave 2, Shlomi).
 *   - the shortcuts line: about six seconds, on the first keyboard (not
 *     pointer) focus of a page cell, then never again this mount.
 */
export function useTransientHints(dispatch: Dispatch<MergeAction>) {
  const pickedUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shortcutsShownRef = useRef(false);
  const shortcutsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Restarts the five-second window of the restored-draft sentence. */
  const startPickedUpTimer = useCallback(() => {
    if (pickedUpTimerRef.current) clearTimeout(pickedUpTimerRef.current);
    pickedUpTimerRef.current = setTimeout(() => dispatch({ type: 'PICKED_UP_EXPIRED' }), 5000);
  }, [dispatch]);

  /** Stops both timers and lets the shortcuts line show again. */
  const cancelHints = useCallback(() => {
    if (pickedUpTimerRef.current) clearTimeout(pickedUpTimerRef.current);
    shortcutsShownRef.current = false;
    if (shortcutsTimerRef.current) clearTimeout(shortcutsTimerRef.current);
  }, []);

  useEffect(() => () => {
    if (pickedUpTimerRef.current) clearTimeout(pickedUpTimerRef.current);
    if (shortcutsTimerRef.current) clearTimeout(shortcutsTimerRef.current);
  }, []);

  const onFirstKeyboardFocus = useCallback(() => {
    if (shortcutsShownRef.current) return;
    shortcutsShownRef.current = true;
    dispatch({ type: 'SHORTCUTS_HINT_SHOWN' });
    shortcutsTimerRef.current = setTimeout(() => dispatch({ type: 'SHORTCUTS_HINT_EXPIRED' }), 6000);
  }, [dispatch]);

  return { startPickedUpTimer, cancelHints, onFirstKeyboardFocus };
}
