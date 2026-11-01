// Finds the lines of text in a small raster window: ink rows, then word gaps inside each row.
// Pure pixel math, no DOM; the caller crops the window and maps the result back to the page.
import { otsuThreshold } from './rasterInk.js';

/** RGBA pixels, the shape of a canvas ImageData. */
export interface RasterWindow { data: Uint8ClampedArray; width: number; height: number }
/** One line of text in window pixels. gaps: x ranges [start, end) of word gaps inside the row, ascending. */
export interface TextRow { top: number; bottom: number; left: number; right: number; gaps: Array<[number, number]> }

const MIN_INK_FRACTION = 0.001;
const MIN_CONTRAST = 64;
const MIN_ROW_HEIGHT = 3;
const INKED_ROW_FRACTION = 0.002;
const PEAK_PERCENTILE = 0.9;
const RELATIVE_INK_FRACTION = 0.12;
const TALL_RUN_FACTOR = 1.7;
const VALLEY_FRACTION = 0.5;
const MERGE_FRACTION = 0.25;
const GROW_FRACTION = 0.5;
const GAP_ROW_FRACTION = 0.3;
const MIN_GAP = 2;
const GUTTER_INK_FRACTION = 0.003;
const GUTTER_MIN_PX = 12;
const GUTTER_MIN_WIDTH_FRACTION = 0.02;

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

/** Ink pixels per pixel row. */
function inkProfile(mask: Uint8Array, width: number, height: number): number[] {
  const profile: number[] = [];
  for (let y = 0; y < height; y += 1) {
    let n = 0;
    for (let x = 0; x < width; x += 1) n += mask[y * width + x];
    profile.push(n);
  }
  return profile;
}

/** The 90th percentile of the non-zero row counts: what a full text row looks like in this window. */
function peakOf(profile: number[]): number {
  const counts = profile.filter((n) => n > 0).sort((a, b) => a - b);
  return counts.length ? counts[Math.min(counts.length - 1, Math.floor(PEAK_PERCENTILE * counts.length))] : 0;
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

/** Cuts a run at its deepest valley of the 3-row smoothed profile, when that valley is under half the run's max. */
function splitRun([top, bottom]: [number, number], profile: number[], limit: number): Array<[number, number]> {
  if (bottom - top <= limit) return [[top, bottom]];
  const smooth = (y: number) => (profile[y - 1] ?? profile[y]) + profile[y] + (profile[y + 1] ?? profile[y]);
  let max = 0;
  for (let y = top; y < bottom; y += 1) max = Math.max(max, smooth(y));
  let cut = -1;
  let low = VALLEY_FRACTION * max;
  for (let y = top + MIN_ROW_HEIGHT; y < bottom - MIN_ROW_HEIGHT; y += 1) {
    const v = smooth(y);
    if (v < low && v <= smooth(y - 1) && v <= smooth(y + 1)) {
      cut = y;
      low = v;
    }
  }
  if (cut < 0) return [[top, bottom]];
  return [...splitRun([top, cut], profile, limit), ...splitRun([cut, bottom], profile, limit)];
}

/** Shrinks a part to its first and last inked rows, so a cut does not carry the empty gap with it. */
function trimTo([top, bottom]: [number, number], inked: boolean[]): [number, number] {
  let t = top;
  let b = bottom;
  while (t < b - 1 && !inked[t]) t += 1;
  while (b - 1 > t && !inked[b - 1]) b -= 1;
  return [t, b];
}

/** Splits runs much taller than the median unmerged run (several lines fused by speckle or skew) at ink valleys. */
function splitTallRuns(runs: Array<[number, number]>, rawRuns: Array<[number, number]>, profile: number[], inked: boolean[]): Array<[number, number]> {
  const limit = TALL_RUN_FACTOR * medianOf(rawRuns.map(([t, b]) => b - t));
  return runs.flatMap((run) => splitRun(run, profile, limit).map(([t, b]) => trimTo([t, b], inked)));
}

/**
 * Grows each row core up and down through scanlines with any ink (ascenders, descenders, which
 * carry too little ink to pass the relative cut), stopping at the first blank scanline, at half the
 * core height, and at the neighbouring row, so tightly set lines never overlap.
 */
function growRows(rows: TextRow[], profile: number[], floor: number): TextRow[] {
  return rows.reduce<TextRow[]>((out, row, i) => {
    const reach = Math.floor(GROW_FRACTION * (row.bottom - row.top));
    const ceiling = Math.max(out[i - 1]?.bottom ?? 0, row.top - reach);
    const limit = Math.min(rows[i + 1]?.top ?? profile.length, row.bottom + reach);
    let { top, bottom } = row;
    while (top > ceiling && profile[top - 1] >= floor) top -= 1;
    while (bottom < limit && profile[bottom] >= floor) bottom += 1;
    out.push({ ...row, top, bottom });
    return out;
  }, []);
}

/** Every text row in the window, top to bottom. */
export function findTextRows(win: RasterWindow): TextRow[] {
  const mask = inkMask(win);
  if (!mask) return [];
  const { width } = win;
  const profile = inkProfile(mask, width, win.height);
  const floor = Math.max(1, INKED_ROW_FRACTION * width);
  const relative = RELATIVE_INK_FRACTION * peakOf(profile);
  const inked = profile.map((n) => n >= floor && n > relative);
  const rawRuns = runsOf(inked);
  const rows: TextRow[] = [];
  for (const [top, bottom] of splitTallRuns(mergeRuns(rawRuns), rawRuns, profile, inked)) {
    const height = bottom - top;
    if (height < MIN_ROW_HEIGHT) continue;
    const colInk: boolean[] = [];
    for (let x = 0; x < width; x += 1) {
      let inked = false;
      for (let y = top; y < bottom && !inked; y += 1) inked = mask[y * width + x] === 1;
      colInk.push(inked);
    }
    const first = colInk.indexOf(true);
    if (first < 0) continue;
    const last = colInk.lastIndexOf(true);
    const minGap = Math.max(MIN_GAP, GAP_ROW_FRACTION * height);
    const gaps = runsOf(colInk.map((v) => !v))
      .filter(([s, e]) => s > first && e <= last && e - s > minGap);
    rows.push({ top, bottom, left: first, right: last + 1, gaps });
  }
  return growRows(rows, profile, floor);
}

/**
 * The column of a multi-column page that holds x: the span between the nearest gutters, a gutter
 * being a wide run of pixel columns with almost no ink that touches neither window edge. The
 * whole window when there is none. Rows of different columns sit on different baselines, so
 * findTextRows only gives clean rows once it is run on this span.
 */
export function columnSpanAt(win: RasterWindow, x: number): { left: number; right: number } {
  const { width, height } = win;
  const whole = { left: 0, right: width };
  const mask = inkMask(win);
  if (!mask) return whole;
  const quiet: boolean[] = [];
  for (let c = 0; c < width; c += 1) {
    let n = 0;
    for (let y = 0; y < height; y += 1) n += mask[y * width + c];
    quiet.push(n <= GUTTER_INK_FRACTION * height);
  }
  const minWidth = Math.max(GUTTER_MIN_PX, GUTTER_MIN_WIDTH_FRACTION * width);
  const gutters = runsOf(quiet).filter(([s, e]) => s > 0 && e < width && e - s >= minWidth);
  let left = 0;
  let right = width;
  for (const [s, e] of gutters) {
    if (x >= s && x < e) {
      return x - s < e - x ? { left, right: s } : { left: e, right: nextStart(gutters, e, width) };
    }
    if (e <= x) left = e;
    else if (s > x && right === width) right = s;
  }
  return { left, right };
}

/** Start of the first gutter after `from`, else the window edge. */
function nextStart(gutters: Array<[number, number]>, from: number, width: number): number {
  const next = gutters.find(([s]) => s > from);
  return next ? next[0] : width;
}
