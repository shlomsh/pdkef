import type { Point } from './anchor.ts';

/** The page column as measured before the zoom changes: its left and top in viewport px, the scroll and the zoom. */
interface RoomFrame {
  rect: { left: number; top: number };
  scroll: Point;
  zoom: number;
}

/**
 * The scroll that keeps a passage on the same line of the screen when a note makes room (or gives it back) and
 * the page changes zoom (R28). `passage` is in page space, unscaled px from the column's top-left.
 *
 * The column keeps its place in the document, so its top moves on screen only by the scroll: the passage stays
 * put when the scroll moves by exactly the growth of its offset, `passage.y * (nextZoom - zoom)`.
 * Horizontally the page keeps its left edge: the board's slack does not depend on the zoom, so the scroll x is
 * unchanged, and the normal view has no sideways scroll at all. Nothing here re-centres.
 */
export function keepPassageOnRoom({ before, nextZoom, passage }: {
  before: RoomFrame;
  nextZoom: number;
  passage: Point;
}): Point {
  return { x: before.scroll.x, y: before.scroll.y + passage.y * (nextZoom - before.zoom) };
}

/** A point measured on screen (viewport px) as a passage in the column: unscaled px from its top-left. */
export function passageInColumn(screen: Point, rect: { left: number; top: number }, zoom: number): Point {
  return { x: (screen.x - rect.left) / zoom, y: (screen.y - rect.top) / zoom };
}
