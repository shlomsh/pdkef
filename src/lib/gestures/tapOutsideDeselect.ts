/**
 * MOBI-30. Pure classification for "was this touch sequence a tap on blank
 * page area" - the recogniser behind PdfWorkspace.tsx's touch deselect path.
 *
 * Why this exists instead of the existing `onClick={deactivateAll}`: that
 * handler only ever fires from a browser-synthesised `click`, and on a real
 * iPhone a tap with a few points of finger jitter (worse while pinch-zoomed)
 * is read by iOS as the start of a pan - it fires `pointercancel` and
 * suppresses the synthetic click entirely, but `touchstart`/`touchend` still
 * fire. This module answers the touch-only question "did that touch sequence
 * mean a tap" from two point-in-time samples, with no DOM and no gesture
 * state of its own, so it is unit-testable without a real browser and safe
 * to call from a one-shot `touchend` handler (never from `touchmove` - see
 * the gesture golden rule in `.claude/rules/editor.md`: nothing here writes
 * to the DOM or accumulates state across moves, because there is no move
 * step at all, only a start sample and an end sample).
 */

/** One point-in-time reading of a touch and the viewport around it. */
export interface TapGestureSample {
  /** `touch.clientX`/`clientY`, in CSS px. */
  x: number;
  y: number;
  /** `Date.now()` (or equivalent) when the sample was taken. */
  time: number;
  /** `window.visualViewport?.scale ?? 1` at sample time. */
  viewportScale: number;
  /** `window.visualViewport?.offsetLeft ?? 0` at sample time. */
  viewportOffsetLeft: number;
  /** `window.visualViewport?.offsetTop ?? 0` at sample time. */
  viewportOffsetTop: number;
  /** The scrolling container's `scrollTop` at sample time. */
  scrollTop: number;
}

export interface TapClassifierOptions {
  /**
   * How far the touch may move (in *screen* points - CSS px already
   * multiplied by `visualViewport.scale`, so the same finger travel counts
   * for more while pinch-zoomed in) and still count as a tap rather than a
   * pan. ~16 screen pt sits above iOS/Chromium's own ~8-10px pan threshold
   * (so an intentional tiny pan is never misread as a tap) and well below a
   * deliberate scroll or drag.
   */
  slopScreenPoints?: number;
  /** How long the touch may be held and still count as a tap, not a long-press. */
  maxDurationMs?: number;
}

export const DEFAULT_TAP_SLOP_SCREEN_POINTS = 16;
export const DEFAULT_TAP_MAX_DURATION_MS = 500;

/**
 * Proportional tolerance for `visualViewport.scale` drifting during the
 * touch. Scale has no natural pixel unit, so it cannot share the spatial
 * slop above; this is calibrated loosely instead, wide enough that ordinary
 * floating-point noise around a settled zoom level never trips it, narrow
 * enough that any real pinch (which moves scale by several percent within a
 * tap-length window) does. A genuine two-finger pinch is already excluded
 * via `multiTouch` before this is reached - this guards the case where scale
 * itself changed (a pinch that started, and finished, within the slop
 * window some other way) rather than duplicating that check.
 */
const MAX_SCALE_DELTA = 0.02;

/**
 * True if the touch sequence from `start` to `end` reads as a tap: exactly
 * one touch for the whole sequence (`multiTouch` - a second touch joining at
 * any point disqualifies it, even if it lifted before the first did),
 * movement and duration within the tolerances, and the page did not
 * scroll/zoom meaningfully underneath the finger while it was down.
 */
export function classifyTouchTap(
  start: TapGestureSample,
  end: TapGestureSample,
  { multiTouch = false }: { multiTouch?: boolean } = {},
  options: TapClassifierOptions = {},
): boolean {
  if (multiTouch) return false;

  const slop = options.slopScreenPoints ?? DEFAULT_TAP_SLOP_SCREEN_POINTS;
  const maxDuration = options.maxDurationMs ?? DEFAULT_TAP_MAX_DURATION_MS;

  const duration = end.time - start.time;
  if (duration < 0 || duration > maxDuration) return false;

  // Movement in CSS px, normalised to screen points by the scale in effect
  // when the touch began (a page pinch-zoomed in reads the same finger
  // travel as a larger on-screen movement).
  const scale = start.viewportScale || 1;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const movementScreenPoints = Math.hypot(dx, dy) * scale;
  if (movementScreenPoints > slop) return false;

  // The visual viewport panning (pinch-zoom drag) or the page scrolling
  // underneath the finger both mean the finger's position on the *page*
  // moved even if its position on the *screen* did not - same slop, same
  // screen-point normalisation.
  const offsetLeftDelta = Math.abs(end.viewportOffsetLeft - start.viewportOffsetLeft) * scale;
  const offsetTopDelta = Math.abs(end.viewportOffsetTop - start.viewportOffsetTop) * scale;
  const scrollTopDelta = Math.abs(end.scrollTop - start.scrollTop) * scale;
  if (offsetLeftDelta > slop || offsetTopDelta > slop || scrollTopDelta > slop) return false;

  const scaleDelta = Math.abs(end.viewportScale - start.viewportScale);
  if (scaleDelta > MAX_SCALE_DELTA) return false;

  return true;
}

/**
 * True if `target` is blank page area: not inside an editor element, its
 * toolbar or resize handles, or any other interactive control. `excludedSelector`
 * is supplied by the caller (PdfWorkspace.tsx) so this module stays free of
 * any CSS Module import - the selector composition (which classes, which
 * data attributes) belongs with the tree that renders them, not with a pure
 * gesture-classification helper.
 */
export function isBlankAreaTarget(target: EventTarget | null, excludedSelector: string): boolean {
  if (!(target instanceof Element)) return false;
  if (!excludedSelector) return true;
  return target.closest(excludedSelector) === null;
}
