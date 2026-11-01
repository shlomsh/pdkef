import { anchoredScroll, type Point } from './anchor.ts';
import { clampZoom } from './fit.ts';

/** The zoom a gesture or a menu choice settles on, and the scroll that keeps the content under `anchor` still (R23). */
export function zoomCommit({ prevZoom, nextZoom, anchor, scroll, origin }: {
  prevZoom: number; nextZoom: number; anchor: Point; scroll: Point; origin: Point;
}): { zoom: number; scroll: Point } {
  const zoom = clampZoom(nextZoom);
  if (zoom === prevZoom) return { zoom, scroll };
  return { zoom, scroll: anchoredScroll({ zoom: prevZoom, scroll, origin }, zoom, anchor) };
}
