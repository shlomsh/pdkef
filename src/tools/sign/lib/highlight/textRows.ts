// Finds the lines of text in a small raster window: ink rows, then word gaps inside each row.
// Pure pixel math, no DOM; the caller crops the window and maps the result back to the page.
import { otsuThreshold } from '../fields/rasterInk.js';

/** RGBA pixels, the shape of a canvas ImageData. */
export interface RasterWindow { data: Uint8ClampedArray; width: number; height: number }
/** One line of text in window pixels. gaps: x ranges [start, end) of word gaps inside the row, ascending. */
export interface TextRow { top: number; bottom: number; left: number; right: number; gaps: Array<[number, number]> }

const MIN_INK_FRACTION = 0.001;
const MIN_CONTRAST = 64;
const MIN_ROW_HEIGHT = 3;
const INKED_ROW_FRACTION = 0.002;
const MERGE_FRACTION = 0.25;
const GAP_ROW_FRACTION = 0.3;
const MIN_GAP = 2;

/** Ink mask (1 = ink) by Otsu on luminance, or null when the window has no real ink. */
function inkMask({ data, width, height }: RasterWindow): Uint8Array | null {
  const count = width * height;
  const gray = new Uint8Array(count);
  let lo = 255;
  let hi = 0;
  for (let i = 0; i < count; i += 1) {
    const a = data[i * 4 + 3] / 255;
    const lum = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    const g = Math.round(lum * a + 255 * (1 - a));
    gray[i] = g;
    if (g < lo) lo = g;
    if (g > hi) hi = g;
  }
  if (hi - lo < MIN_CONTRAST) return null;
  const threshold = otsuThreshold(gray);
  const mask = new Uint8Array(count);
  let ink = 0;
  for (let i = 0; i < count; i += 1) {
    if (gray[i] <= threshold) {
      mask[i] = 1;
      ink += 1;
    }
  }
  return ink / count < MIN_INK_FRACTION ? null : mask;
}

/** Runs [start, end) of consecutive true flags. */
function runsOf(flags: boolean[]): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let start = -1;
  for (let i = 0; i <= flags.length; i += 1) {
    if (i < flags.length && flags[i]) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      runs.push([start, i]);
      start = -1;
    }
  }
  return runs;
}

/** Joins runs closer than a quarter of the taller one (i/j dots, niqqud, accents). */
function mergeRuns(runs: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const run of runs) {
    const prev = out[out.length - 1];
    if (prev) {
      const taller = Math.max(prev[1] - prev[0], run[1] - run[0]);
      if (run[0] - prev[1] < taller * MERGE_FRACTION) {
        prev[1] = run[1];
        continue;
      }
    }
    out.push([run[0], run[1]]);
  }
  return out;
}

/** Every text row in the window, top to bottom. */
export function findTextRows(win: RasterWindow): TextRow[] {
  const mask = inkMask(win);
  if (!mask) return [];
  const { width } = win;
  const minCount = Math.max(1, INKED_ROW_FRACTION * width);
  const rowInk: boolean[] = [];
  for (let y = 0; y < win.height; y += 1) {
    let n = 0;
    for (let x = 0; x < width; x += 1) n += mask[y * width + x];
    rowInk.push(n >= minCount);
  }
  const rows: TextRow[] = [];
  for (const [top, bottom] of mergeRuns(runsOf(rowInk))) {
    const height = bottom - top;
    if (height < MIN_ROW_HEIGHT) continue;
    const colInk: boolean[] = [];
    for (let x = 0; x < width; x += 1) {
      let any = false;
      for (let y = top; y < bottom && !any; y += 1) any = mask[y * width + x] === 1;
      colInk.push(any);
    }
    const first = colInk.indexOf(true);
    if (first < 0) continue;
    const last = colInk.lastIndexOf(true);
    const minGap = Math.max(MIN_GAP, GAP_ROW_FRACTION * height);
    const gaps = runsOf(colInk.map((v) => !v))
      .filter(([s, e]) => s > first && e <= last && e - s > minGap);
    rows.push({ top, bottom, left: first, right: last + 1, gaps });
  }
  return rows;
}
