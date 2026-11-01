// The word or the line under a point on a scanned page, from the raster rows `findTextRows` finds.
// Units: window pixels, the same as `TextRow` (x to the right, y down); the caller maps the box
// back to the page. Pure, no DOM.
import type { TextRow } from '#lib/pageLayout/textRows.ts';

/** A box in the same window pixels as the rows. */
interface PixelBox { left: number; right: number; top: number; bottom: number }

/** The row whose top..bottom holds y and whose left..right holds x, else null. */
function rowAt(rows: TextRow[], { x, y }: { x: number; y: number }): TextRow | null {
  return rows.find((row) => y >= row.top && y < row.bottom && x >= row.left && x < row.right) ?? null;
}

/** The word under pt: the span between the word gaps either side of pt.x on its row. Null between rows or inside a gap. */
export function wordAt(rows: TextRow[], pt: { x: number; y: number }): PixelBox | null {
  const row = rowAt(rows, pt);
  if (!row) return null;
  if (row.gaps.some(([start, end]) => pt.x >= start && pt.x < end)) return null;
  let left = row.left;
  let right = row.right;
  for (const [start, end] of row.gaps) {
    if (end <= pt.x) left = Math.max(left, end);
    else if (start > pt.x) right = Math.min(right, start);
  }
  return { left, right, top: row.top, bottom: row.bottom };
}

/** The whole row under pt, left to right. Null between rows. */
export function lineAt(rows: TextRow[], pt: { x: number; y: number }): PixelBox | null {
  const row = rowAt(rows, pt);
  return row ? { left: row.left, right: row.right, top: row.top, bottom: row.bottom } : null;
}
