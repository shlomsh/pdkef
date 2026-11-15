// Turns a page's traced border (SCAN-75) into the side curves the flattening reads. The traced points sit on the
// picture; the flattening wants each side's offset in the unit square of the page's corners, so every point is mapped
// through the inverse homography and fitted with three terms at once (SCAN-77): the side's own straight edge (the
// corners sit a few pixels off the paper, so it is faded to zero before each corner), a bow, and one kink (a fold).
// Forcing a single bow through both corners would turn that offset into a slope along the whole side. Pure: no DOM.
import { leastSquares } from '#lib/pageEnhance/dewarp/leastSquares.ts';
import { ramp, sideAt, tent, type EdgeCurves, type SideCurve } from '#lib/pageEnhance/dewarp/types.ts';
import { applyHomography, homography, type Matrix3 } from '#lib/pageEnhance/homography.ts';
import { scaleQuad, type Point, type Quad } from '#lib/pageEnhance/quad.ts';
import type { Sides } from '../edges/follow.ts';

// A side bowing less than this many pixels (at a long edge of REFERENCE_PX) is left straight; same meaning as the edge finder's.
const MIN_BOW_PX = 2.5;
// The long edge, in pixels, the bow threshold is measured at, so it does not depend on the photo's resolution.
const REFERENCE_PX = 1000;
// How many steps along a side the fitted curve's peak is looked for.
const PEAK_STEPS = 100;
// Where along a side the fold's kink is looked for, and the step between the positions tried.
const KINK_FROM = 0.1;
const KINK_TO = 0.9;
const KINK_STEP = 0.01;
const ZERO: SideCurve = { a: 0, b: 0 };
const UNIT_SQUARE: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

interface Sample { t: number; d: number }

/** One traced point as the side's (t, d): t along the side, d its offset from the straight side, both in the unit square. */
function sampleOf(side: number, p: Point): Sample {
  switch (side) {
    case 0: return { t: p.x, d: p.y };
    case 1: return { t: p.y, d: p.x - 1 };
    case 2: return { t: p.x, d: p.y - 1 };
    default: return { t: p.y, d: p.x };
  }
}

/** Best fit of d = ramped line + bow + kink: the kink position with the smallest squared residual wins; the zero curve when none can be solved. */
function fitCurve(samples: Sample[]): SideCurve {
  const ts = samples.map((p) => p.t);
  const ds = samples.map((p) => p.d);
  let best: SideCurve = ZERO;
  let bestError = Infinity;
  const steps = Math.round((KINK_TO - KINK_FROM) / KINK_STEP);
  for (let i = 0; i <= steps; i += 1) {
    const at = KINK_FROM + i * KINK_STEP;
    const x = leastSquares(ts, ds, (t) => [ramp(t), t * ramp(t), t * (1 - t), t * t * (1 - t), tent(at, t)]);
    if (!x || !x.every(Number.isFinite)) continue;
    const curve: SideCurve = { a: x[2], b: x[3], line: { e: x[0], f: x[1] }, kink: { at, by: x[4] } };
    const error = samples.reduce((sum, p) => sum + (p.d - sideAt(curve, p.t)) ** 2, 0);
    if (error < bestError) { best = curve; bestError = error; }
  }
  return best;
}

function peakOf(curve: SideCurve): number {
  let peak = 0;
  for (let i = 0; i <= PEAK_STEPS; i += 1) peak = Math.max(peak, Math.abs(sideAt(curve, i / PEAK_STEPS)));
  return peak;
}

const length = (p: Point, q: Point) => Math.hypot(q.x - p.x, q.y - p.y);

/** Pixels one unit across each side spans, at the reference size: top and bottom across the page's height, left and right across its width. */
function acrossPx(quadPx: Quad, width: number, height: number): [number, number, number, number] {
  const scale = REFERENCE_PX / Math.max(width, height);
  const [tl, tr, br, bl] = quadPx;
  const vertical = ((length(tl, bl) + length(tr, br)) / 2) * scale;
  const horizontal = ((length(tl, tr) + length(bl, br)) / 2) * scale;
  return [vertical, horizontal, vertical, horizontal];
}

function sideCurve(inverse: Matrix3, points: Point[], side: number, across: number, width: number, height: number): SideCurve {
  const samples: Sample[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return ZERO;
    const q = applyHomography(inverse, { x: p.x * width, y: p.y * height });
    if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) return ZERO;
    samples.push(sampleOf(side, q));
  }
  const curve = fitCurve(samples);
  return peakOf(curve) * across < MIN_BOW_PX ? ZERO : curve;
}

/** The side curves the flattening reads, fitted to a page's traced border. `quad` (0 to 1 of the picture, [TL, TR, BR, BL])
 * and `sides` (clockwise from each of those corners) go together; `width` and `height` are the picture's size in pixels.
 * Null when no side bows enough to matter. */
export function curvesFromSides(quad: Quad, sides: Sides, width: number, height: number): EdgeCurves | null {
  const quadPx = scaleQuad(quad, width, height);
  let inverse: Matrix3;
  try {
    inverse = homography(quadPx, UNIT_SQUARE);
  } catch {
    // expected: degenerate corners have no perspective, so there is nothing to fit
    return null;
  }
  const across = acrossPx(quadPx, width, height);
  const [top, right, bottom, left] = sides.map((points, side) => sideCurve(inverse, points, side, across[side], width, height));
  const bent = [top, right, bottom, left].some((c) => c !== ZERO);
  return bent ? { top, right, bottom, left } : null;
}
