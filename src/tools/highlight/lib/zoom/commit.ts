import { anchoredScroll, type Point } from './anchor.ts';
import { clampZoom, type ZoomSetting } from './fit.ts';

/** A commit that leaves the setting and the zoom as they are has nothing to apply, so it must not arm a pending scroll. */
export function commitChanges(prevSetting: ZoomSetting, prevZoom: number, nextSetting: ZoomSetting, nextZoom: number): boolean {
  return prevSetting !== nextSetting || prevZoom !== nextZoom;
}

/** The zoom a gesture or a menu choice settles on, and the scroll that keeps the content under `anchor` still (R23). */
export function zoomCommit({ prevZoom, nextZoom, anchor, scroll, origin }: {
  prevZoom: number; nextZoom: number; anchor: Point; scroll: Point; origin: Point;
}): { zoom: number; scroll: Point } {
  const zoom = clampZoom(nextZoom);
  if (zoom === prevZoom) return { zoom, scroll };
  return { zoom, scroll: anchoredScroll({ zoom: prevZoom, scroll, origin }, zoom, anchor) };
}
