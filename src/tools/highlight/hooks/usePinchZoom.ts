import { useEffect } from 'preact/hooks';
import { clampZoom, type ZoomSetting } from '../lib/zoom/fit.ts';
import type { Point } from '../lib/zoom/anchor.ts';
import { isZoomInput } from '../lib/zoom/lamp.ts';

const PINCH_REST_MS = 150;
/** A trackpad pinch arrives as wheel events with a few pixels of deltaY; this turns them into a smooth factor. */
const WHEEL_PINCH_RATE = 0.01;

/**
 * Pinch. Everything before the commit touches the DOM through refs only: the column is scaled by a CSS
 * transform while the fingers are down, and `commit` runs once when they rest (the gesture golden rule).
 */
export function usePinchZoom({ workspaceRef, columnRef, enabled, inLamp, zoomRef, commit }: {
  workspaceRef: { current: HTMLElement | null };
  columnRef: { current: HTMLElement | null };
  enabled: boolean;
  inLamp: boolean;
  zoomRef: { current: number };
  commit(next: ZoomSetting, nextZoom: number, anchor?: Point): void;
}) {
  useEffect(() => {
    const ws = workspaceRef.current;
    const col = columnRef.current;
    // Only the lamp zooms: the normal view leaves a pinch to the browser.
    if (!ws || !col || !enabled || !inLamp) return;
    let factor = 1;
    let anchor: Point = { x: 0, y: 0 };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pointers = new Map<number, Point>();
    let startDistance = 0;

    // The column's rect as the gesture began: once it is transformed, its rect is a scaled one.
    let startRect: DOMRect | null = null;
    const preview = () => {
      const rect = (startRect ??= col.getBoundingClientRect());
      col.style.transformOrigin = `${anchor.x - rect.left}px ${anchor.y - rect.top}px`;
      col.style.transform = `scale(${factor})`;
    };
    const finish = () => {
      clearTimeout(timer);
      const next = clampZoom(zoomRef.current * factor);
      const unchanged = factor === 1;
      factor = 1;
      // Back to the column's own size before anything else, even when a pinch at the bound commits nothing:
      // a stale start rect would aim the next pinch's origin at where the column used to be.
      startRect = null;
      col.style.transform = '';
      col.style.transformOrigin = '';
      if (unchanged) return;
      commit(next, next, anchor);
    };

    const onWheel = (e: WheelEvent) => {
      if (!isZoomInput({ type: 'wheel', ctrlKey: e.ctrlKey })) return;
      e.preventDefault();
      if (factor === 1) anchor = { x: e.clientX, y: e.clientY };
      const target = clampZoom(zoomRef.current * factor * Math.exp(-e.deltaY * WHEEL_PINCH_RATE));
      factor = target / zoomRef.current;
      preview();
      clearTimeout(timer);
      timer = setTimeout(finish, PINCH_REST_MS);
    };
    const distance = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        startDistance = distance();
        const [a, b] = [...pointers.values()];
        anchor = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        factor = 1;
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size !== 2 || startDistance === 0) return;
      const target = clampZoom(zoomRef.current * (distance() / startDistance));
      factor = target / zoomRef.current;
      preview();
    };
    const onUp = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size < 2 && startDistance !== 0) { startDistance = 0; finish(); }
    };

    ws.addEventListener('wheel', onWheel, { passive: false });
    col.addEventListener('pointerdown', onDown);
    col.addEventListener('pointermove', onMove);
    col.addEventListener('pointerup', onUp);
    col.addEventListener('pointercancel', onUp);
    return () => {
      clearTimeout(timer);
      ws.removeEventListener('wheel', onWheel);
      col.removeEventListener('pointerdown', onDown);
      col.removeEventListener('pointermove', onMove);
      col.removeEventListener('pointerup', onUp);
      col.removeEventListener('pointercancel', onUp);
      col.style.transform = '';
      col.style.transformOrigin = '';
    };
  }, [workspaceRef, columnRef, enabled, inLamp, zoomRef, commit]);
}
