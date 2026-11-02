import type { Point } from './anchor.ts';

/**
 * The scroll after the page follows a two-finger pan: the page moves with the fingers, so the scroll moves against
 * their travel. It stays inside the scrollable range (`max` is the most the view can scroll; unknown before a zoom's
 * layout is in place, when the layout's own clamp applies instead).
 */
export function panScroll(scroll: Point, travel: Point, max?: Point): Point {
  const clamp = (value: number, limit = Infinity) => Math.min(Math.max(value, 0), limit);
  return { x: clamp(scroll.x - travel.x, max?.x), y: clamp(scroll.y - travel.y, max?.y) };
}
