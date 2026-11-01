// R10: the word or the line under a click on a scanned page, from the pixels. A scan has no text, so
// the page is read the way a swipe reads it (findTextRows inside the column the click is in); the
// word or line becomes a band with a swipe's own padding, in page percent. One canvas read per click.
import { bandsForSwipe, type Band } from '#lib/pageLayout/bands.ts';
import { bandsToPagePercent } from '#lib/pageLayout/swipe.ts';
import { columnSpanAt, findTextRows, type RasterWindow, type TextRow } from '#lib/pageLayout/textRows.ts';
import { lineAt, wordAt } from './wordAt.ts';

type ScanUnit = 'word' | 'line';
interface Point { x: number; y: number }

/** A line of body text, in points: how far above and below the click to read, as a swipe does. */
const BODY_LINE_PTS = 14;
const READ_LINES_EACH_SIDE = 3;
/** The column is found from the lines near the click, not the whole strip. */
const COLUMN_LINES_EACH_SIDE = 1.5;

/** The window's pixels from x = left to right, copied row by row. */
function cropColumns(win: RasterWindow, left: number, right: number): RasterWindow {
  const width = right - left;
  const data = new Uint8ClampedArray(width * win.height * 4);
  for (let y = 0; y < win.height; y += 1) {
    data.set(win.data.subarray((y * win.width + left) * 4, (y * win.width + right) * 4), y * width * 4);
  }
  return { data, width, height: win.height };
}

/** The text rows of the column holding x, in window pixels. */
function rowsOfColumnAt(win: RasterWindow, x: number, y: number, lineHeight: number): TextRow[] {
  const reach = Math.round(COLUMN_LINES_EACH_SIDE * lineHeight);
  const t0 = Math.max(0, Math.round(y) - reach);
  const t1 = Math.min(win.height, Math.round(y) + reach);
  const near = { data: win.data.subarray(t0 * win.width * 4, t1 * win.width * 4), width: win.width, height: t1 - t0 };
  const column = columnSpanAt(near, x);
  return findTextRows(cropColumns(win, column.left, column.right)).map((row) => ({
    ...row,
    left: row.left + column.left,
    right: row.right + column.left,
    gaps: row.gaps.map(([start, end]) => [start + column.left, end + column.left] as [number, number]),
  }));
}

/** The band of the unit at pt (window pixels): the word or line box, snapped and padded the way a swipe along it would be. */
function unitBand(rows: TextRow[], pt: Point, unit: ScanUnit, lineHeight: number): Band | null {
  const box = (unit === 'word' ? wordAt : lineAt)(rows, pt);
  if (!box) return null;
  const y = (box.top + box.bottom) / 2;
  // One pixel inside each edge, so the swipe's snap lands on this unit's edges and not a neighbour's.
  const inset = box.right - box.left > 2 ? 1 : 0;
  const swiped = bandsForSwipe(rows, { x: box.left + inset, y }, { x: box.right - inset, y }, lineHeight)[0];
  return swiped ?? { left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top };
}

/**
 * The band of the word or line under `pt` (page percent), in page percent; null when the click is not on
 * a word (between words, between rows, on blank page) or the canvas cannot be read.
 */
export function readScanUnit(canvas: HTMLCanvasElement | null, pt: Point, unit: ScanUnit, pageHeightPts: number): Band | null {
  if (!canvas || !canvas.width || !canvas.height) return null;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const size = { width: canvas.width, height: canvas.height };
  const px = (pt.x / 100) * size.width;
  const py = (pt.y / 100) * size.height;
  const lineHeight = (BODY_LINE_PTS * size.height) / pageHeightPts;
  const top = Math.max(0, Math.round(py - READ_LINES_EACH_SIDE * lineHeight));
  const height = Math.min(size.height - top, Math.round(2 * READ_LINES_EACH_SIDE * lineHeight));
  if (height <= 0) return null;
  let image: ImageData;
  try {
    image = ctx.getImageData(0, top, size.width, height);
  } catch {
    // expected: an unreadable canvas means the click finds no word and marks nothing
    return null;
  }
  const win = { data: image.data, width: image.width, height: image.height };
  const rows = rowsOfColumnAt(win, px, py - top, lineHeight);
  const band = unitBand(rows, { x: px, y: py - top }, unit, lineHeight);
  return band ? bandsToPagePercent([band], top, size)[0] : null;
}
