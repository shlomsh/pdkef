// The spine of a flatbed scan of an open book: two pages on one sheet, a thin, slightly slanted
// dark line between them. Ported from the SCAN-36 prototype (find_fold, fold_x, halves). Pure.
import type { GrayImage, Quad } from './quad';

/** Where the spine crosses the sheet's top and bottom edges, 0..1 across its width. */
export interface Spine { top: number; bottom: number }

/** A line between two pages, and whether it is sure enough to split on with nobody asked (SCAN-67). */
interface SpineRead { spine: Spine; sure: boolean }

/** Pixels darker than this can be the line: on a small copy a thin broken spine is grey, not black. */
const LINE_BELOW = 190;
/** Pixels darker than this are print, so paper shade beside a line does not count as print. */
const PRINT_BELOW = 128;
/** The spine sits in the middle of the sheet; a rule at 0.2 is a table, not a fold. */
const BAND: [number, number] = [0.3, 0.7];
/** Slants tried, in degrees: a book rarely lies more than this far off the scanner's edge. */
const MAX_TILT_DEG = 10;
/** Step between tried slants: at 1000 px tall, 0.1 degree moves the line's far end under 1 px. */
const TILT_STEP_DEG = 0.1;
/** Width of the local average a peak must stand out from: wider than a thick line, narrower than a column of text. */
const SURROUND_PX = 61;
/** A line spans most of the height, so its column holds far more dark rows than the text around it; text alone peaks well below this. */
const MIN_SHARPNESS = 0.4;
/** How near a line print is looked for, in pixels each side: past the line's own blur, inside the gap between two pages. */
const BESIDE_PX: [number, number] = [6, 18];
/** The share of rows with print beside a line that still counts as clean paper: real spines measure 0.2%, creases and tables 10.8% and up. */
const CLEAN_BESIDE = 0.01;
/** Rows read for print beside a line: a head or foot can run across the gutter. */
const TEXT_ROWS: [number, number] = [0.1, 0.9];
/** Step between slants tried for a gap: a gap is wide, so it needs far fewer than a line. */
const GAP_TILT_STEP_DEG = 0.5;
/** A column with print on no more than this share of rows is empty: specks and shadow are not text. */
const EMPTY_COLUMN = 0.01;
/** The narrowest gap worth a question, as a share of the width: wider than most column gaps. */
const MIN_GAP = 0.04;
/** A gap has text on both sides: each holds at least this share of the sheet's print. */
const MIN_SIDE_PRINT = 0.15;

interface Fold { sharpness: number; tilt: number; x: number }

/**
 * The line between two pages of a sheet, already turned so its text reads across, or null when nothing suggests two pages.
 * Sure is a line with clean paper beside it; a line with print beside it, or a gap with no line, is worth a person's look.
 * `gray` should be no larger than about 1000 px on its long edge (the surround and tilt step are tuned to that); shrinking
 * is the caller's job.
 */
export function readSpine(gray: GrayImage): SpineRead | null {
  // Two book pages side by side make a landscape sheet; on an upright page a line down the middle is a column rule.
  if (gray.width <= gray.height) return null;
  const fold = bestFold(gray);
  if (fold && fold.sharpness >= MIN_SHARPNESS) return { spine: spineAt(gray, fold), sure: printBeside(gray, fold) <= CLEAN_BESIDE };
  const gap = widestGap(gray);
  return gap && { spine: spineAt(gray, gap), sure: false };
}

function spineAt(gray: GrayImage, { x, tilt }: { x: number; tilt: number }): Spine {
  const half = (gray.height / 2) * Math.tan((tilt * Math.PI) / 180);
  return { top: (x - half) / gray.width, bottom: (x + half) / gray.width };
}

/** The same line in a picture of the sheet with a border around it (each side a share of the sheet), carried out to the picture's top and bottom. */
export function spineInBorder(spine: Spine, border: { left: number; top: number; right: number; bottom: number }): Spine {
  const across = (y: number) => (spine.top + (spine.bottom - spine.top) * y + border.left) / (1 + border.left + border.right);
  return { top: across(-border.top), bottom: across(1 + border.bottom) };
}

/** The sheet's two halves as corner quads, 0..1, left page first, each ending at the spine. */
export function spreadHalves(spine: Spine): [Quad, Quad] {
  return [
    [{ x: 0, y: 0 }, { x: spine.top, y: 0 }, { x: spine.bottom, y: 1 }, { x: 0, y: 1 }],
    [{ x: spine.top, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: spine.bottom, y: 1 }],
  ];
}

function bestFold(gray: GrayImage): Fold | null {
  const { width, height } = gray;
  const dark = darkPixels(gray, LINE_BELOW);
  const lo = Math.floor(width * BAND[0]);
  const hi = Math.floor(width * BAND[1]);
  let best: Fold | null = null;
  for (let tilt = -MAX_TILT_DEG; tilt <= MAX_TILT_DEG + 1e-9; tilt += TILT_STEP_DEG) {
    const sharp = sharpness(shearedColumns(dark, width, height, tilt), lo, hi);
    if (!sharp) continue;
    if (!best || sharp.value > best.sharpness) best = { sharpness: sharp.value, tilt, x: sharp.x };
  }
  return best;
}

/** The worst side's share of text rows with print just beside the line. */
function printBeside(gray: GrayImage, { x, tilt }: Fold): number {
  const { width, height, data } = gray;
  const slope = Math.tan((tilt * Math.PI) / 180);
  const first = Math.floor(height * TEXT_ROWS[0]);
  const last = Math.floor(height * TEXT_ROWS[1]);
  const sideShare = (side: number) => {
    let hits = 0;
    for (let y = first; y < last; y += 1) {
      const at = x + (y - height / 2) * slope;
      for (let d = BESIDE_PX[0]; d <= BESIDE_PX[1]; d += 1) {
        const column = Math.round(at + side * d);
        if (column >= 0 && column < width && data[y * width + column] < PRINT_BELOW) { hits += 1; break; }
      }
    }
    return hits / (last - first);
  };
  return Math.max(sideShare(-1), sideShare(1));
}

/** The middle of the widest empty strip between two blocks of text, at its slant, or null when there is none worth asking about. */
function widestGap(gray: GrayImage): { x: number; tilt: number } | null {
  const { width, height } = gray;
  const print = darkPixels(gray, PRINT_BELOW);
  const lo = Math.floor(width * BAND[0]);
  const hi = Math.floor(width * BAND[1]);
  let best: { x: number; tilt: number; run: number } | null = null;
  for (let tilt = -MAX_TILT_DEG; tilt <= MAX_TILT_DEG + 1e-9; tilt += GAP_TILT_STEP_DEG) {
    const hist = shearedColumns(print, width, height, tilt);
    const run = emptyRun(hist, lo, hi);
    if (run.length < width * MIN_GAP || !printOnBothSides(hist, run.start + run.length / 2)) continue;
    // Equal gaps: the slant nearest upright, so a straight sheet is not read as leaning.
    if (!best || run.length > best.run || (run.length === best.run && Math.abs(tilt) < Math.abs(best.tilt))) {
      best = { x: run.start + run.length / 2, tilt, run: run.length };
    }
  }
  return best;
}

/** The longest stretch of empty columns in [lo, hi). */
function emptyRun(hist: Float64Array, lo: number, hi: number): { start: number; length: number } {
  let best = { start: lo, length: 0 };
  let start = lo;
  for (let x = lo; x <= hi; x += 1) {
    if (x < hi && hist[x] <= EMPTY_COLUMN) continue;
    if (x - start > best.length) best = { start, length: x - start };
    start = x + 1;
  }
  return best;
}

function printOnBothSides(hist: Float64Array, x: number): boolean {
  let left = 0;
  let right = 0;
  for (let i = 0; i < hist.length; i += 1) {
    if (i < x) left += hist[i];
    else right += hist[i];
  }
  return Math.min(left, right) >= (left + right) * MIN_SIDE_PRINT;
}

/** Flat [x, y, x, y ...] of the pixels darker than `below`. */
function darkPixels(gray: GrayImage, below: number): Int32Array {
  const out: number[] = [];
  for (let i = 0; i < gray.data.length; i += 1) {
    if (gray.data[i] < below) out.push(i % gray.width, Math.floor(i / gray.width));
  }
  return Int32Array.from(out);
}

/** Per column, the share of rows holding a dark pixel once every row is slid so a line at `tilt` degrees stands upright. */
function shearedColumns(dark: Int32Array, width: number, height: number, tilt: number): Float64Array {
  const slope = Math.tan((tilt * Math.PI) / 180);
  const hist = new Float64Array(width);
  for (let i = 0; i < dark.length; i += 2) {
    const x = Math.round(dark[i] - (dark[i + 1] - height / 2) * slope);
    hist[Math.min(width - 1, Math.max(0, x))] += 1;
  }
  for (let x = 0; x < width; x += 1) hist[x] /= height;
  return hist;
}

/** The column in [lo, hi) that stands highest above the average of its surroundings. */
function sharpness(hist: Float64Array, lo: number, hi: number): { value: number; x: number } | null {
  const n = hist.length;
  const prefix = new Float64Array(n + 1);
  for (let x = 0; x < n; x += 1) prefix[x + 1] = prefix[x] + hist[x];
  const r = (SURROUND_PX - 1) / 2;
  let best: { value: number; x: number } | null = null;
  for (let x = lo; x < hi; x += 1) {
    const base = (prefix[Math.min(n, x + r + 1)] - prefix[Math.max(0, x - r)]) / SURROUND_PX;
    const value = hist[x] - base;
    if (!best || value > best.value) best = { value, x };
  }
  return best;
}
