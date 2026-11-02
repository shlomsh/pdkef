import { useEffect } from 'preact/hooks';
import { clampZoom, type ZoomSetting } from '../lib/zoom/fit.ts';
import type { Point } from '../lib/zoom/anchor.ts';
import { isZoomInput } from '../lib/zoom/lamp.ts';
import { panScroll } from '../lib/zoom/pan.ts';
import { previewShiftX, previewShiftY } from '../lib/zoom/previewShift.ts';

const PINCH_REST_MS = 150;
/** A trackpad pinch arrives as wheel events with a few pixels of deltaY; this turns them into a smooth factor. */
const WHEEL_PINCH_RATE = 0.01;

/**
 * Pinch. Everything before the commit touches the DOM through refs only: the column is scaled by a CSS
 * transform while the fingers are down, and `commit` runs once when they rest (the gesture golden rule).
 */
export function usePinchZoom({ workspaceRef, columnRef, enabled, inLamp, zoomRef, floorRef, commit }: {
  workspaceRef: { current: HTMLElement | null };
  columnRef: { current: HTMLElement | null };
  enabled: boolean;
  inLamp: boolean;
  zoomRef: { current: number };
  /** The lowest zoom a pinch may reach: the lamp's whole-page fit. */
  floorRef: { current: number };
  commit(next: ZoomSetting, nextZoom: number, anchor?: Point, centreAfter?: boolean, pan?: Point): void;
}) {
  useEffect(() => {
    const ws = workspaceRef.current;
    const col = columnRef.current;
    // Only the lamp zooms: the normal view leaves a pinch to the browser.
    if (!ws || !col || !enabled || !inLamp) return;
    let factor = 1;
    let anchor: Point = { x: 0, y: 0 };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pan: Point = { x: 0, y: 0 };
    let startDistance = 0;

    // The column's rect and the workspace's box as the gesture began: once the column is transformed its rect is a
    // scaled one, and reading the padding per frame would force a style recalc each time.
    let start: { rect: DOMRect; view: DOMRect; pad: { top: number; right: number; bottom: number; left: number } } | null = null;
    // What the preview added to the fingers' travel to keep the page where the board would put it.
    let shift: Point = { x: 0, y: 0 };
    const preview = () => {
      if (!start) {
        const css = getComputedStyle(ws);
        const px = (v: string) => parseFloat(v) || 0;
        start = {
          rect: col.getBoundingClientRect(),
          view: ws.getBoundingClientRect(),
          pad: { top: px(css.paddingTop), right: px(css.paddingRight), bottom: px(css.paddingBottom), left: px(css.paddingLeft) },
        };
      }
      const { rect, view, pad } = start;
      col.style.transformOrigin = `${anchor.x - rect.left}px ${anchor.y - rect.top}px`;
      // Where the scaled, panned column would sit; the shift keeps it where the board would put it at rest.
      const scaledLeft = anchor.x + (rect.left - anchor.x) * factor + pan.x;
      const scaledTop = anchor.y + (rect.top - anchor.y) * factor + pan.y;
      shift = {
        x: previewShiftX(scaledLeft, rect.width * factor, view.left, ws.clientWidth, pad.left, pad.right),
        y: previewShiftY(scaledTop, rect.height * factor, view.top, ws.clientHeight, pad.top, pad.bottom),
      };
      col.style.transform = `translate(${pan.x + shift.x}px, ${pan.y + shift.y}px) scale(${factor})`;
    };
    const finish = () => {
      clearTimeout(timer);
      const next = clampZoom(zoomRef.current * factor, floorRef.current);
      const unchanged = factor === 1;
      // The travel the preview showed, so the release lands where the fingers left the page.
      const travel = { x: pan.x + shift.x, y: pan.y + shift.y };
      const panned = pan.x !== 0 || pan.y !== 0;
      factor = 1;
      pan = { x: 0, y: 0 };
      shift = { x: 0, y: 0 };
      // Back to the column's own size before anything else, even when a pinch at the bound commits nothing:
      // a stale start rect would aim the next pinch's origin at where the column used to be.
      start = null;
      col.style.transform = '';
      col.style.transformOrigin = '';
      if (unchanged) {
        // No scale change: the fingers only moved the page.
        const max = { x: ws.scrollWidth - ws.clientWidth, y: ws.scrollHeight - ws.clientHeight };
        const moved = panScroll({ x: ws.scrollLeft, y: ws.scrollTop }, travel, max);
        ws.scrollLeft = moved.x;
        ws.scrollTop = moved.y;
        return;
      }
      if (panned) commit(next, next, anchor, false, travel);
      else commit(next, next, anchor);
    };

    const onWheel = (e: WheelEvent) => {
      if (!isZoomInput({ type: 'wheel', ctrlKey: e.ctrlKey })) return;
      e.preventDefault();
      if (factor === 1) anchor = { x: e.clientX, y: e.clientY };
      const target = clampZoom(zoomRef.current * factor * Math.exp(-e.deltaY * WHEEL_PINCH_RATE), floorRef.current);
      factor = target / zoomRef.current;
      preview();
      clearTimeout(timer);
      timer = setTimeout(finish, PINCH_REST_MS);
    };
    // The pinch reads touches, not pointers: once the browser starts a one-finger scroll it cancels the pointers.
    const spread = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const middle = (t: TouchList): Point => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      startDistance = spread(e.touches);
      anchor = middle(e.touches);
      pan = { x: 0, y: 0 };
      factor = 1;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || startDistance === 0) return;
      if (e.cancelable) e.preventDefault();
      const target = clampZoom(zoomRef.current * (spread(e.touches) / startDistance), floorRef.current);
      factor = target / zoomRef.current;
      const mid = middle(e.touches);
      pan = { x: mid.x - anchor.x, y: mid.y - anchor.y };
      preview();
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2 && startDistance !== 0) { startDistance = 0; finish(); }
    };

    ws.addEventListener('wheel', onWheel, { passive: false });
    col.addEventListener('touchstart', onTouchStart, { passive: false });
    col.addEventListener('touchmove', onTouchMove, { passive: false });
    col.addEventListener('touchend', onTouchEnd);
    col.addEventListener('touchcancel', onTouchEnd);
    return () => {
      clearTimeout(timer);
      ws.removeEventListener('wheel', onWheel);
      col.removeEventListener('touchstart', onTouchStart);
      col.removeEventListener('touchmove', onTouchMove);
      col.removeEventListener('touchend', onTouchEnd);
      col.removeEventListener('touchcancel', onTouchEnd);
      col.style.transform = '';
      col.style.transformOrigin = '';
    };
  }, [workspaceRef, columnRef, enabled, inLamp, zoomRef, floorRef, commit]);
}
