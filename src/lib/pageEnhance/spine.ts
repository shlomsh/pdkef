// The spine of a flatbed scan of an open book: two pages on one sheet, a thin, slightly slanted
// dark line between them. Ported from the SCAN-36 prototype (find_fold, fold_x, halves). Pure.
import type { GrayImage, Quad } from './quad';

/**
 * Where the spine crosses the sheet's top and bottom edges, 0..1 across its width.
 * @testSeam
 */
export interface Spine { top: number; bottom: number }

/** Pixels darker than this are ink or shadow. */
const DARK_BELOW = 128;
/** The spine sits in the middle of the sheet; a rule at 0.2 is a table, not a fold. */
const BAND: [number, number] = [0.3, 0.7];
/** Slants tried, in degrees: a book rarely lies more than this far off the scanner's edge. */
const MAX_TILT_DEG = 6;
/** Step between tried slants: at 1000 px tall, 0.1 degree moves the line's far end under 1 px. */
const TILT_STEP_DEG = 0.1;
/** Width of the local average a peak must stand out from: wider than a thick line, narrower than a column of text. */
const SURROUND_PX = 61;
/** A line spans most of the height, so its column holds far more dark rows than the text around it; text alone peaks well below this. */
const MIN_SHARPNESS = 0.4;

interface Fold { sharpness: number; tilt: number; x: number }

/**
 * @testSeam
 * The spine of a two-page sheet, already turned so its text reads across, or null when the sheet is one page. `gray` should be no larger
 * than about 1000 px on its long edge (the surround and tilt step are tuned to that); shrinking
 * is the caller's job.
 */
export function findSpine(gray: GrayImage): Spine | null {
  // Two book pages side by side make a landscape sheet; on an upright page a line down the middle is a column rule.
  if (gray.width <= gray.height) return null;
  const fold = bestFold(gray);
  if (!fold || fold.sharpness < MIN_SHARPNESS) return null;
  const slope = Math.tan((fold.tilt * Math.PI) / 180);
  const half = (gray.height / 2) * slope;
  return { top: (fold.x - half) / gray.width, bottom: (fold.x + half) / gray.width };
}

/**
 * The sheet's two halves as corner quads, 0..1, left page first, each ending at the spine.
 * @testSeam
 */
export function spreadHalves(spine: Spine): [Quad, Quad] {
  return [
    [{ x: 0, y: 0 }, { x: spine.top, y: 0 }, { x: spine.bottom, y: 1 }, { x: 0, y: 1 }],
    [{ x: spine.top, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: spine.bottom, y: 1 }],
  ];
}

function bestFold(gray: GrayImage): Fold | null {
  const { width, height } = gray;
  const dark = darkPixels(gray);
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

/** Flat [x, y, x, y ...] of the dark pixels. */
function darkPixels(gray: GrayImage): Int32Array {
  const out: number[] = [];
  for (let i = 0; i < gray.data.length; i += 1) {
    if (gray.data[i] < DARK_BELOW) out.push(i % gray.width, Math.floor(i / gray.width));
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
