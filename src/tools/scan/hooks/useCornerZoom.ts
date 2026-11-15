// Zoom for the corner editor's photo (SCAN-75). The photo area scrolls; the editor's frame is as wide as its fitted
// width times --corner-zoom, set on the area. During a gesture the property and the scroll are written straight to the
// DOM; state is committed once when the gesture ends (gesture golden rule). The point under the fingers is kept by
// measuring the frame before and after each write and scrolling by the drift, which covers centring and padding.
import { useEffect, useRef, useState } from 'preact/hooks';
import { isTypingTarget } from '#lib/history/isTypingTarget.ts';
import { clampZoom, steppedZoom, ZOOM_FIT, ZOOM_MAX } from '../lib/cornerZoom.ts';

/** The CSS custom property, set on the photo area, that the editor's frame multiplies its fitted width by. @testSeam */
export const CORNER_ZOOM_VAR = '--corner-zoom';
/** Set on the photo area while it is zoomed: the CSS makes it scroll only then. */
const ZOOMED_ATTR = 'data-zoomed';

interface CornerZoom {
  /** 1 is Fit: the whole photo in view, exactly as without zoom. */
  zoom: number;
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
  canZoomIn: boolean;
  canZoomOut: boolean;
}

const WHEEL_COMMIT_MS = 150;
const WHEEL_RATE = 0.01;
/** Px the pointer may move between wheel events and still be zooming at the same spot. */
const WHEEL_SAME_SPOT = 2;

interface Point { x: number; y: number }
/** The photo point under a place on screen, as fractions of the frame. */
interface Focus { fx: number; fy: number }
interface Pinch { distance: number; zoom: number; focus: Focus }
type AreaRef = { current: HTMLElement | null };

const frameOf = (area: HTMLElement): HTMLElement => (area.querySelector('[data-corner-frame]') as HTMLElement | null) ?? (area.firstElementChild as HTMLElement | null) ?? area;

function focusAt(area: HTMLElement, at: Point): Focus {
  const r = frameOf(area).getBoundingClientRect();
  return { fx: r.width ? (at.x - r.left) / r.width : 0.5, fy: r.height ? (at.y - r.top) / r.height : 0.5 };
}

/** Writes `z` to the DOM and scrolls so the focus is at `at` again (or to 0, 0 at Fit). */
function writeZoom(area: HTMLElement, z: number, focus: Focus, at: Point): void {
  if (z === ZOOM_FIT) area.style.removeProperty(CORNER_ZOOM_VAR);
  else area.style.setProperty(CORNER_ZOOM_VAR, String(z));
  // The area scrolls only while zoomed (its corner rings would give it a scrollbar at Fit). The flag goes on with the
  // property, not with the committed state, or the scroll below would have nothing to act on during a gesture.
  area.toggleAttribute(ZOOMED_ATTR, z !== ZOOM_FIT);
  if (z === ZOOM_FIT) { area.scrollLeft = 0; area.scrollTop = 0; return; }
  const r = frameOf(area).getBoundingClientRect();
  area.scrollLeft += r.left + focus.fx * r.width - at.x;
  area.scrollTop += r.top + focus.fy * r.height - at.y;
}

const centreOf = (area: HTMLElement): Point => {
  const r = area.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

const spread = (touches: TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
const midpoint = (touches: TouchList): Point => ({ x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 });

/** Everything that touches the DOM. `commit` publishes the current value to state. */
function attachGestures(area: HTMLElement, zoomRef: { current: number }, commit: () => void, scheduleCommit: () => void): () => void {
  const apply = (z: number, focus: Focus, at: Point) => { zoomRef.current = clampZoom(z); writeZoom(area, zoomRef.current, focus, at); };

  let burst: { focus: Focus; x: number; y: number; time: number } | null = null;
  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const at = { x: event.clientX, y: event.clientY };
    // One burst of wheel events (a pinch, a spin of the wheel) keeps the photo point it started on. Reading it again
    // from the scrolled page on every event compounds the scroll's whole-pixel rounding (5 px by the largest zoom).
    const stale = !burst || event.timeStamp - burst.time > WHEEL_COMMIT_MS || Math.hypot(at.x - burst.x, at.y - burst.y) > WHEEL_SAME_SPOT;
    burst = { focus: stale ? focusAt(area, at) : burst!.focus, x: at.x, y: at.y, time: event.timeStamp };
    apply(zoomRef.current * Math.exp(-event.deltaY * WHEEL_RATE), burst.focus, at);
    scheduleCommit();
  };

  let pinch: Pinch | null = null;
  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length === 2) pinch = { distance: spread(event.touches), zoom: zoomRef.current, focus: focusAt(area, midpoint(event.touches)) };
    else if (pinch) { pinch = null; commit(); }
  };
  const onTouchMove = (event: TouchEvent) => {
    if (!pinch || event.touches.length !== 2) return;
    event.preventDefault();
    apply(pinch.zoom * (spread(event.touches) / (pinch.distance || 1)), pinch.focus, midpoint(event.touches));
  };
  const onTouchEnd = (event: TouchEvent) => {
    if (pinch && event.touches.length < 2) { pinch = null; commit(); }
  };
  const keepFromPage = (event: Event) => event.preventDefault();

  // A mouse drag on the bare photo pans it; at Fit there is nothing to scroll.
  let drag: { x: number; y: number; left: number; top: number } | null = null;
  const onMouseDown = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (event.button !== 0 || zoomRef.current <= ZOOM_FIT || !target || !(target === area || target.hasAttribute('data-corner-frame'))) return;
    drag = { x: event.clientX, y: event.clientY, left: area.scrollLeft, top: area.scrollTop };
  };
  const onMouseMove = (event: MouseEvent) => {
    if (!drag) return;
    area.scrollLeft = drag.left - (event.clientX - drag.x);
    area.scrollTop = drag.top - (event.clientY - drag.y);
  };
  const endDrag = () => { drag = null; };

  const touchOpts = { passive: false } as const;
  area.addEventListener('wheel', onWheel, { passive: false });
  area.addEventListener('touchstart', onTouchStart, touchOpts);
  area.addEventListener('touchmove', onTouchMove, touchOpts);
  area.addEventListener('touchend', onTouchEnd, touchOpts);
  area.addEventListener('touchcancel', onTouchEnd, touchOpts);
  area.addEventListener('gesturestart', keepFromPage);
  area.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', endDrag);
  window.addEventListener('blur', endDrag);
  return () => {
    area.removeEventListener('wheel', onWheel);
    area.removeEventListener('touchstart', onTouchStart);
    area.removeEventListener('touchmove', onTouchMove);
    area.removeEventListener('touchend', onTouchEnd);
    area.removeEventListener('touchcancel', onTouchEnd);
    area.removeEventListener('gesturestart', keepFromPage);
    area.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', endDrag);
    window.removeEventListener('blur', endDrag);
  };
}

/** Zoom of the photo inside `area` (the scrolling box around the editor's frame). `resetKey` changing (another page,
 * another turn) goes back to Fit. */
export function useCornerZoom(area: AreaRef, resetKey: unknown): CornerZoom {
  const [zoom, setZoom] = useState(ZOOM_FIT);
  const zoomRef = useRef(ZOOM_FIT);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const attached = useRef<{ el: HTMLElement; detach: () => void } | null>(null);

  const commit = useRef(() => { if (alive.current) setZoom(zoomRef.current); }).current;
  const scheduleCommit = useRef(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; commit(); }, WHEEL_COMMIT_MS);
  }).current;
  const clearTimer = useRef(() => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } }).current;

  /** A zoom from a button or key: anchored at the centre of the area's visible box, state set once. */
  const goTo = useRef((z: number) => {
    const el = area.current;
    clearTimer();
    zoomRef.current = clampZoom(z);
    if (el) { const at = centreOf(el); writeZoom(el, zoomRef.current, focusAt(el, at), at); }
    commit();
  }).current;
  const step = useRef((dir: 1 | -1) => goTo(steppedZoom(zoomRef.current, dir))).current;

  // The photo may not be mounted on the first render: attach whenever the element appears or changes.
  useEffect(() => {
    const el = area.current;
    if (attached.current?.el === el) return;
    attached.current?.detach();
    attached.current = el ? { el, detach: attachGestures(el, zoomRef, commit, scheduleCommit) } : null;
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || isTypingTarget(event.target)) return;
      if (event.key === '=' || event.key === '+') step(1);
      else if (event.key === '-') step(-1);
      else if (event.key === '0') goTo(ZOOM_FIT);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { goTo(ZOOM_FIT); }, [resetKey]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimer();
      attached.current?.detach();
      attached.current = null;
    };
  }, []);

  return {
    zoom,
    zoomIn: () => step(1),
    zoomOut: () => step(-1),
    fit: () => goTo(ZOOM_FIT),
    canZoomIn: zoom < ZOOM_MAX,
    canZoomOut: zoom > ZOOM_FIT,
  };
}
