// Turns a page's traced border (SCAN-75) into the side curves the flattening reads. The traced points sit on the
// picture; the flattening wants each side's bow in the unit square of the page's corners, so every point is mapped
// through the inverse homography and a two-term curve is fitted to its offset. Pure: no DOM.
import { sideAt, type EdgeCurves, type SideCurve } from '#lib/pageEnhance/dewarp/types.ts';
import { applyHomography, homography, type Matrix3 } from '#lib/pageEnhance/homography.ts';
import { scaleQuad, type Point, type Quad } from '#lib/pageEnhance/quad.ts';
import type { Sides } from '../edges/follow.ts';

// A side bowing less than this many pixels (at a long edge of REFERENCE_PX) is left straight; same meaning as the edge finder's.
const MIN_BOW_PX = 2.5;
// The long edge, in pixels, the bow threshold is measured at, so it does not depend on the photo's resolution.
const REFERENCE_PX = 1000;
// How many steps along a side the fitted curve's peak is looked for.
const PEAK_STEPS = 100;
// A normal-equation determinant below this (relative to its diagonal) counts as singular.
const SINGULAR = 1e-12;
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

/** Least squares of d = a t(1-t) + b t^2 (1-t); the zero curve when the system is singular. */
function fitCurve(samples: Sample[]): SideCurve {
  let s11 = 0, s12 = 0, s22 = 0, r1 = 0, r2 = 0;
  for (const { t, d } of samples) {
    const f1 = t * (1 - t);
    const f2 = t * f1;
    s11 += f1 * f1; s12 += f1 * f2; s22 += f2 * f2; r1 += f1 * d; r2 += f2 * d;
  }
  const det = s11 * s22 - s12 * s12;
  if (!(Math.abs(det) > SINGULAR * s11 * s22)) return ZERO;
  const a = (r1 * s22 - r2 * s12) / det;
  const b = (s11 * r2 - s12 * r1) / det;
  return Number.isFinite(a) && Number.isFinite(b) ? { a, b } : ZERO;
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
  const bent = [top, right, bottom, left].some((c) => c.a !== 0 || c.b !== 0);
  return bent ? { top, right, bottom, left } : null;
}
