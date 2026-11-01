export interface Point { x: number; y: number }

// The scroll offsets that keep the content under `anchor` (screen px) still across a zoom change.
export function anchoredScroll(
  prev: { zoom: number; scroll: Point; origin: Point },
  nextZoom: number,
  anchor: Point,
): Point {
  const { zoom, scroll, origin } = prev;
  const localX = (anchor.x - (origin.x - scroll.x)) / zoom;
  const localY = (anchor.y - (origin.y - scroll.y)) / zoom;
  return { x: origin.x + localX * nextZoom - anchor.x, y: origin.y + localY * nextZoom - anchor.y };
}
