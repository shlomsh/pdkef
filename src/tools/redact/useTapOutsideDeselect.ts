import { useRef } from 'preact/hooks';
import {
  classifyTouchTap,
  isBlankAreaTarget,
  type TapGestureSample,
} from '../../lib/gestures/tapOutsideDeselect.ts';

/**
 * A tap on blank page area deselects the selected box. Two paths, because
 * neither covers every case on its own:
 *
 * - `onClick`: a mouse click, and a clean tap that iOS turns into a click.
 * - `onTouchStart`/`onTouchEnd`: a tap with a few points of finger jitter,
 *   which iOS reads as the start of a pan and never turns into a click
 *   (MOBI-30, the same recogniser Sign's PdfWorkspace uses).
 *
 * One-shot recognition on release, never a live gesture: there is no
 * `touchmove` listener, and the only thing held across the touch is its start
 * sample. Skipped while `isArmed()`: an armed tool's own page handler owns the
 * tap (and already deselects when it starts drawing).
 */
export function useTapOutsideDeselect({
  onDeselect,
  isArmed,
  excludedSelector,
}: {
  onDeselect: () => void;
  isArmed: () => boolean;
  excludedSelector: string;
}) {
  const startRef = useRef<TapGestureSample | null>(null);
  const idRef = useRef<number | null>(null);
  const multiRef = useRef(false);

  const reset = () => {
    startRef.current = null;
    idRef.current = null;
    multiRef.current = false;
  };

  const onClick = (e: MouseEvent) => {
    if (isArmed()) return;
    if (!isBlankAreaTarget(e.target, excludedSelector)) return;
    onDeselect();
  };

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length > 1) {
      // A second finger disqualifies the whole sequence: a pinch is never a tap.
      multiRef.current = true;
      return;
    }
    const touch = e.changedTouches[0];
    if (!touch) return;
    startRef.current = readTapSample(touch, Date.now());
    idRef.current = touch.identifier;
    multiRef.current = false;
  };

  const onTouchEnd = (e: TouchEvent) => {
    const start = startRef.current;
    const trackedId = idRef.current;
    if (!start || trackedId == null) return;
    const endTouch = Array.from(e.changedTouches).find((t) => t.identifier === trackedId);
    if (!endTouch) return; // another finger lifted; the tracked one is still down
    const multiTouch = multiRef.current;
    const end = readTapSample(endTouch, Date.now());
    reset();

    if (e.defaultPrevented) return; // some handler below already owned this tap
    if (isArmed()) return;
    if (!classifyTouchTap(start, end, { multiTouch })) return;
    if (!isBlankAreaTarget(e.target, excludedSelector)) return;
    onDeselect();
  };

  return { onClick, onTouchStart, onTouchEnd, onTouchCancel: reset };
}

function readTapSample(touch: Touch, time: number): TapGestureSample {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  return {
    x: touch.clientX,
    y: touch.clientY,
    time,
    viewportScale: vv?.scale ?? 1,
    viewportOffsetLeft: vv?.offsetLeft ?? 0,
    viewportOffsetTop: vv?.offsetTop ?? 0,
    scrollTop: document.scrollingElement?.scrollTop || 0,
  };
}
