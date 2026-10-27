import { useEffect, useRef } from 'preact/hooks';

/** How long a still press must last before it counts as a hold. */
export const HOLD_DELAY_MS = 250;
/** How far the pointer may drift and still be "holding still". */
export const HOLD_SLOP_PX = 3;

export type HoldDecision = 'wait' | 'peek' | 'cancel';

/**
 * The whole rule of a press-and-hold, as a pure function of time and travel.
 * Travel past the slop is never a hold, however long it lasts (that is a
 * move); a still press becomes a peek once the delay has passed.
 */
export function holdDecision(elapsedMs: number, movedPx: number): HoldDecision {
  if (movedPx > HOLD_SLOP_PX) return 'cancel';
  return elapsedMs >= HOLD_DELAY_MS ? 'peek' : 'wait';
}

type PressEvent = MouseEvent | TouchEvent | { touches?: ArrayLike<{ clientX: number; clientY: number }>; clientX?: number; clientY?: number };

function pointOf(e: any): { x: number; y: number } {
  const t = e.touches?.[0] ?? e.changedTouches?.[0];
  return t ? { x: t.clientX, y: t.clientY } : { x: e.clientX ?? 0, y: e.clientY ?? 0 };
}

/**
 * Press and hold still on an element to peek, alongside (never instead of) the
 * element's own drag hook. Returns `onPressStart`, to be called from the same
 * mousedown/touchstart handler. It only listens: it never prevents the press,
 * so a move under the slop is the drag hook's business exactly as before.
 *
 * Golden rule: the timer and the pointer tracking live in refs and on
 * `document`; nothing per-pointermove goes through state. `onPeekChange` is
 * called twice per hold at most (on, then off) and is expected to write the
 * DOM directly. Once a peek is on, moves are swallowed in the capture phase so
 * a peek can never move the box.
 */
export default function usePressAndHold({ onPeekChange }: { onPeekChange: (on: boolean) => void }) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const callbackRef = useRef(onPeekChange);
  callbackRef.current = onPeekChange;

  useEffect(() => () => cleanupRef.current?.(), []);

  const onPressStart = (e: PressEvent) => {
    cleanupRef.current?.();
    if ('touches' in e && e.touches && e.touches.length > 1) return;
    const start = pointOf(e);
    const startedAt = Date.now();
    let moved = 0;
    let peeking = false;

    const stop = () => {
      clearTimeout(timer);
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('touchmove', onMove, true);
      document.removeEventListener('mouseup', onEnd, true);
      document.removeEventListener('touchend', onEnd, true);
      document.removeEventListener('touchcancel', onEnd, true);
      document.removeEventListener('contextmenu', onMenu, true);
      cleanupRef.current = null;
    };
    const onEnd = () => {
      stop();
      if (peeking) callbackRef.current(false);
    };
    const onMenu = (ev: Event) => ev.preventDefault();
    const onMove = (ev: any) => {
      if (peeking) {
        ev.stopImmediatePropagation();
        if (ev.cancelable) ev.preventDefault();
        return;
      }
      const p = pointOf(ev);
      moved = Math.max(moved, Math.hypot(p.x - start.x, p.y - start.y));
      if (holdDecision(Date.now() - startedAt, moved) === 'cancel') stop();
    };
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      if (holdDecision(Date.now() - startedAt, moved) !== 'peek') return;
      peeking = true;
      callbackRef.current(true);
    }, HOLD_DELAY_MS);

    document.addEventListener('mousemove', onMove, { capture: true, passive: false });
    document.addEventListener('touchmove', onMove, { capture: true, passive: false });
    document.addEventListener('mouseup', onEnd, true);
    document.addEventListener('touchend', onEnd, true);
    document.addEventListener('touchcancel', onEnd, true);
    document.addEventListener('contextmenu', onMenu, true);
    cleanupRef.current = () => {
      const wasPeeking = peeking;
      stop();
      if (wasPeeking) callbackRef.current(false);
    };
  };

  return { onPressStart };
}
