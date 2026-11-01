import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { HINT_MS, hintSeen, markHintSeen } from '../lib/marker/hint.ts';
import { initialRest, nextTickAt, restReducer, type RestEvent, type RestState } from '../lib/marker/restDetector.ts';

type MoveLike = Pick<PointerEvent, 'clientX' | 'clientY' | 'pointerType' | 'buttons'> & { target: EventTarget | null };

/** Where the first mark's ink ended, in page percent, and which way it reads. */
export interface HintAnchor { x: number; bottom: number; rtl: boolean }

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // expected: blocked storage only means the hint can show again
  }
}

/**
 * R2, R7, R8 for one page. Pointer moves feed the rest detector through refs and timers, never state;
 * state changes once, when the detector reports a highlight opened (or a tap, or the hint).
 */
export function useRestToolbar() {
  const [targetId, setTargetId] = useState<string | null>(null);
  const [hint, setHint] = useState<HintAnchor | null>(null);
  const openRef = useRef<string | null>(null);
  const restRef = useRef<RestState>(initialRest);
  const lastRef = useRef({ x: 0, y: 0 });
  const tickTimer = useRef(0);
  const hintTimer = useRef(0);

  const open = useCallback((id: string | null) => {
    openRef.current = id;
    setTargetId(id);
  }, []);

  const feed = useCallback((event: RestEvent) => {
    restRef.current = restReducer(restRef.current, event);
    window.clearTimeout(tickTimer.current);
    const opened = restRef.current.opened;
    if (opened !== null && openRef.current === null) {
      open(opened);
      return;
    }
    const at = nextTickAt(restRef.current);
    if (at !== null) {
      tickTimer.current = window.setTimeout(() => feed({ type: 'tick', t: performance.now() }), Math.max(0, at - performance.now()));
    }
  }, [open]);

  const onPointerMove = useCallback((e: MoveLike) => {
    lastRef.current = { x: e.clientX, y: e.clientY };
    if (openRef.current !== null || e.pointerType === 'touch' || e.buttons !== 0) return;
    const overId = (e.target as Element | null)?.closest?.('[data-element-id]')?.getAttribute('data-element-id') ?? null;
    feed({ type: 'move', x: e.clientX, y: e.clientY, t: performance.now(), overId });
  }, [feed]);

  const onPointerLeave = useCallback(() => {
    if (openRef.current === null) feed({ type: 'leave' });
  }, [feed]);

  /** A stroke just ended where the pointer is: no rest counts until it has gone 12 px away (R2). */
  const strokeEnd = useCallback(() => feed({ type: 'strokeEnd', x: lastRef.current.x, y: lastRef.current.y }), [feed]);

  /** R7: a tap opens a highlight at once. */
  const openFor = useCallback((id: string) => {
    window.clearTimeout(tickTimer.current);
    restRef.current = initialRest;
    open(id);
  }, [open]);

  const close = useCallback(() => {
    open(null);
    feed({ type: 'closed' });
  }, [open, feed]);

  const clearHint = useCallback(() => {
    window.clearTimeout(hintTimer.current);
    setHint(null);
  }, []);

  /** R8: once ever, after the first mark. */
  const showHint = useCallback((anchor: HintAnchor) => {
    if (hintSeen(storage())) return;
    markHintSeen(storage());
    window.clearTimeout(hintTimer.current);
    setHint(anchor);
    hintTimer.current = window.setTimeout(() => setHint(null), HINT_MS);
  }, []);

  useEffect(() => () => {
    window.clearTimeout(tickTimer.current);
    window.clearTimeout(hintTimer.current);
  }, []);

  return { targetId, hint, onPointerMove, onPointerLeave, strokeEnd, openFor, close, showHint, clearHint };
}
