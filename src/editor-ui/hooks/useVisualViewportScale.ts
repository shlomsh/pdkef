import { useEffect } from 'preact/hooks';

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
 */

let refCount = 0;
let attached = false;

function currentScale(): number {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  return vv ? vv.scale : 1;
}

function publish() {
  document.documentElement.style.setProperty('--vv-scale', String(currentScale()));
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

export default function useVisualViewportScale(): void {
  useEffect(() => {
    refCount += 1;
    attach();
    return () => {
      refCount = Math.max(0, refCount - 1);
      if (refCount === 0) detach();
    };
  }, []);
}
