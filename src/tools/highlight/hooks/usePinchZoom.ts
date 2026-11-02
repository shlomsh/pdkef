import { useEffect } from 'preact/hooks';
import { clampZoom, type ZoomSetting } from '../lib/zoom/fit.ts';
import type { Point } from '../lib/zoom/anchor.ts';
import { isZoomInput } from '../lib/zoom/lamp.ts';
import { panScroll } from '../lib/zoom/pan.ts';
import { previewShiftY } from '../lib/zoom/previewShift.ts';

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

    // The column's rect as the gesture began: once it is transformed, its rect is a scaled one.
    let startRect: DOMRect | null = null;
    const preview = () => {
      const rect = (startRect ??= col.getBoundingClientRect());
      col.style.transformOrigin = `${anchor.x - rect.left}px ${anchor.y - rect.top}px`;
      // Where the scaled column would sit; the shift keeps it where the board would put it at rest.
      const scaledTop = anchor.y + (rect.top - anchor.y) * factor;
      const view = ws.getBoundingClientRect();
      const pad = getComputedStyle(ws);
      const dy = previewShiftY(scaledTop, rect.height * factor, view.top, ws.clientHeight, parseFloat(pad.paddingTop) || 0, parseFloat(pad.paddingBottom) || 0);
      col.style.transform = `translate(${pan.x}px, ${dy + pan.y}px) scale(${factor})`;
    };
    const finish = () => {
      clearTimeout(timer);
      const next = clampZoom(zoomRef.current * factor, floorRef.current);
      const unchanged = factor === 1;
      const travel = pan;
      factor = 1;
      pan = { x: 0, y: 0 };
      // Back to the column's own size before anything else, even when a pinch at the bound commits nothing:
      // a stale start rect would aim the next pinch's origin at where the column used to be.
      startRect = null;
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
      if (travel.x || travel.y) commit(next, next, anchor, false, travel);
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
