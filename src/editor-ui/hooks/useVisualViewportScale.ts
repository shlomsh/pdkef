import { useEffect, useRef } from 'preact/hooks';

/**
 * MOBI-17: publishes `--vv-scale` on `<html>` as `window.visualViewport`'s
 * current zoom factor, so any stylesheet or inline style in the app can
 * counter-scale against it (`scale(calc(1 / var(--vv-scale, 1)))`) without a
 * single component re-rendering on a pinch.
 *
 * A ref-counted module-level singleton, not a plain per-caller effect:
 * DraggableWrapper mounts one instance per element on the page - up to 81 on
 * the income-tax-101 fixture - and every one of them needs this value, but
 * the value itself is one global fact about the page, not per-element state.
 * The `visualViewport` listener attaches once, on the first mounted consumer,
 * and detaches once, when the last one unmounts, however many elements are on
 * screen.
 *
 * Writes CSSOM directly (`style.setProperty`), never Preact state, for the
 * same reason the gesture golden rule (`editor.md`) keeps drag/resize out of
 * state: routing a pinch through a re-render would thrash every mounted
 * `.actions` bar on every zoom step, not just the one under a finger.
 *
 * No-op where `visualViewport` does not exist (an old browser, or a
 * server/test environment with no `window` at all): `--vv-scale` is simply
 * never written, and every consumer's `var(--vv-scale, 1)` falls back to 1,
 * so nothing renders differently from before this ticket.
 *
 * MOBI-17 (follow-up): also a callback registry for "something in the
 * document needs to know a pinch/pan just happened", namely Floating UI's own
 * imperative `update()`. `whileElementsMounted: autoUpdate` does not add a
 * `visualViewport` listener of its own (it only watches ancestor
 * scroll/resize, `ResizeObserver`, and an intersection-based move detector -
 * none of which fire from a pinch that does not scroll the document), so a
 * bar's floating position was never recomputed after a pinch or a pan, only
 * its size (via the CSS counter-scale, which reacts to `--vv-scale` without
 * any JS at all). Reusing this hook's existing single listener for that,
 * rather than every `DraggableWrapper`/`RedactBox` instance adding its own
 * `visualViewport` listener, keeps the "one listener however many elements
 * are on screen" property this hook already has.
 */

let refCount = 0;
let attached = false;
const listeners = new Set<() => void>();

export function currentScale(): number {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  return vv ? vv.scale : 1;
}

function publish() {
  document.documentElement.style.setProperty('--vv-scale', String(currentScale()));
  listeners.forEach((listener) => listener());
}

function attach() {
  if (attached) return;
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!vv) return;
  attached = true;
  publish();
  // `resize` fires on both auto-zoom (a focused small-font field) and a
  // deliberate pinch; `scroll` fires when a zoomed page is panned, which
  // does not change `scale` but keeps the two listeners symmetric and cheap
  // to no-op through `publish()` recomputing the same value.
  vv.addEventListener('resize', publish);
  vv.addEventListener('scroll', publish);
}

function detach() {
  if (!attached) return;
  attached = false;
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  vv?.removeEventListener('resize', publish);
  vv?.removeEventListener('scroll', publish);
}

/**
 * @param onViewportChange Optional: called (with no arguments) every time
 * `--vv-scale` is republished - i.e. on every `visualViewport` `resize` or
 * `scroll`. Read through a ref so the effect only re-subscribes when a caller
 * starts or stops passing one, never on every render a new closure identity
 * would otherwise cause (`DraggableWrapper`/`RedactBox` pass `useFloating`'s
 * own `update`, which callers should not need to `useCallback`-stabilize).
 */
export default function useVisualViewportScale(onViewportChange?: () => void): void {
  const listenerRef = useRef(onViewportChange);
  listenerRef.current = onViewportChange;

  useEffect(() => {
    refCount += 1;
    // Registered before `attach()`: `attach()` only calls `publish()` (and so
    // only notifies `listeners`) the very first time anything on the page
    // subscribes - a consumer joining after that already sees the current,
    // correct `--vv-scale`, so no re-publish happens for it. A new listener
    // must still be in the set for that one case where it does happen, or
    // the very consumer that just mounted would miss its own first call.
    const listener = () => listenerRef.current?.();
    if (onViewportChange) listeners.add(listener);
    attach();
    return () => {
      listeners.delete(listener);
      refCount = Math.max(0, refCount - 1);
      if (refCount === 0) detach();
    };
    // Deliberately not depending on `onViewportChange` itself: it is read
    // through `listenerRef` above, and re-subscribing on every new closure
    // identity would defeat the point of that ref.
  }, [!!onViewportChange]);
}
