// Edge curves for a bent page (SCAN-17): given the person's four corners, find how each side of the
// page bows by searching the photo's gradient edges just inside and outside the straight side, in the
// homography's unit square, and fitting each side to the SideCurve shape. A side with no clear, plausible
// bow comes back as zero: one within a cut edge's own pixel wander, or one a fold's kink explains as well
// (SCAN-35). Pure: typed arrays only.
import { applyHomography, homography } from '../homography.ts';
import type { Matrix3 } from '../homography.ts';
import { buildEdgeMap } from '../edges/outline.ts';
import type { EdgeMap } from '../edges/outline.ts';
import type { GrayImage, Point, Quad } from '../quad.ts';
import type { EdgeCurves, SideCurve } from './types.ts';
import { sideAt } from './types.ts';

const SAMPLES = 15; // interior points tried along each side
const SEARCH = 0.06; // how far either way of the straight side to look, in unit-square units
const MIN_STEP = 0.0005; // finest and coarsest search step, in unit-square units
const MAX_STEP = 0.005;
const ALIGN = Math.cos((30 * Math.PI) / 180); // gradient may lean this far off the side's normal
const WEAK_VS_MEDIAN = 0.5; // a sample weaker than this share of the side's median peak is dropped
const MIN_KEPT = 8; // samples a side needs after the robust refit, spread over both halves
const OUTLIER_MULT = 2.5; // residual cut, in median absolute residuals
const OUTLIER_FLOOR = 0.004; // ...but never tighter than this
// A side bowing less than this many pixels of the measured photo is left straight: each sample reads
// the edge to the nearest pixel, and a cut paper edge wanders a pixel or two on its own (SCAN-35).
const MIN_BOW_PX = 2.5;
// Where a fold's kink is looked for, along the side: a letter folds in halves, thirds or quarters.
const FOLD_FROM = 0.2;
const FOLD_TO = 0.8;
const MAX_BOW = 0.05; // a side bowing more than this is probably another edge
const MAX_RMS = 0.006; // fit residual above this means the edge is not a clean curve
const NEAR_BIAS = 0.3; // a candidate at the end of the search counts this much less than one on the side
const ZERO: SideCurve = { a: 0, b: 0 };

interface Sample { t: number; s: number }

const median = (v: number[]): number => {
  const s = [...v].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The edge strength across the search line at one point of a side, and the photo pixels one unit of
 * that line spans. */
function candidatesAt(map: EdgeMap, h: Matrix3, p: Point, n: Point, wx: number, wy: number): { s: number[]; mag: number[]; ok: boolean[]; px: number } {
  const at = (s: number) => applyHomography(h, { x: p.x + n.x * s, y: p.y + n.y * s });
  const p0 = at(0);
  const p1 = at(1e-3);
  const pxPerUnit = Math.hypot(p1.x - p0.x, p1.y - p0.y) / 1e-3;
  const step = Math.min(MAX_STEP, Math.max(MIN_STEP, 1 / Math.max(pxPerUnit, 1e-6)));
  const count = Math.floor(SEARCH / step);
  const out = { s: [] as number[], mag: [] as number[], ok: [] as boolean[], px: pxPerUnit };
  for (let k = -count; k <= count; k += 1) {
    const s = k * step;
    const q = at(s);
    const x = Math.round(q.x);
    const y = Math.round(q.y);
    if (x < 1 || y < 1 || x >= map.width - 1 || y >= map.height - 1) { out.s.push(s); out.mag.push(0); out.ok.push(false); continue; }
    const i = y * map.width + x;
    out.s.push(s);
    out.mag.push(map.mag[i]);
    out.ok.push(Math.abs(map.ux[i] * wx + map.uy[i] * wy) >= ALIGN);
  }
  return out;
}

/** The edge's offsets along one side, and the photo pixels per unit offset (their mean). */
function sampleSide(map: EdgeMap, h: Matrix3, point: (t: number) => Point, n: Point): { samples: Sample[]; px: number } {
  const found: { t: number; s: number; peak: number }[] = [];
  let px = 0;
  for (let k = 0; k < SAMPLES; k += 1) {
    const t = (k + 1) / (SAMPLES + 1);
    const p = point(t);
    // The side's normal in the photo: the direction the straight side's edge gradient should have.
    const a = applyHomography(h, p);
    const b = applyHomography(h, { x: p.x + n.x * 1e-3, y: p.y + n.y * 1e-3 });
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const c = candidatesAt(map, h, p, n, (b.x - a.x) / len, (b.y - a.y) / len);
    let best = -1;
    // Nearer the straight side wins a close call, so a dark band printed near the margin does not
    // outbid the page's own edge.
    const score = (i: number) => c.mag[i] * (1 - NEAR_BIAS * Math.abs(c.s[i]) / SEARCH);
    for (let i = 0; i < c.s.length; i += 1) if (c.ok[i] && c.mag[i] > 0 && (best < 0 || score(i) > score(best))) best = i;
    if (best < 0) continue;
    let s = c.s[best];
    if (best > 0 && best < c.s.length - 1) {
      const m0 = c.mag[best - 1]; const m1 = c.mag[best]; const m2 = c.mag[best + 1];
      const den = m0 - 2 * m1 + m2;
      if (den < 0) s += (0.5 * (m0 - m2)) / den * (c.s[best + 1] - c.s[best]);
    }
    found.push({ t, s, peak: c.mag[best] });
    px += c.px;
  }
  if (!found.length) return { samples: [], px: 0 };
  const floor = Math.max(WEAK_VS_MEDIAN * median(found.map((f) => f.peak)), map.supportRef);
  return { samples: found.filter((f) => f.peak >= floor).map(({ t, s }) => ({ t, s })), px: px / found.length };
}

/** Least squares of s over the given basis functions of t: their weights, or null when degenerate. */
function solve(samples: Sample[], basis: (t: number) => number[]): number[] | null {
  const n = basis(0).length;
  const m = Array.from({ length: n }, () => new Array<number>(n + 1).fill(0));
  for (const { t, s } of samples) {
    const f = basis(t);
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) m[r][c] += f[r] * f[c];
      m[r][n] += f[r] * s;
    }
  }
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const k = m[r][col] / m[col][col];
      for (let c = col; c < n + 1; c += 1) m[r][c] -= k * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

const rms = (samples: Sample[], at: (t: number) => number) =>
  Math.sqrt(samples.reduce((sum, p) => sum + (p.s - at(p.t)) ** 2, 0) / samples.length);

/** Least squares of a free cubic d = e + f t + t(1-t)(a + b t), solved for all four. The person's
 * corners can sit a little off the paper, which reads as a straight edge offset or tilted from the
 * chord: e and f absorb that, and only the bend (a, b), which vanishes at both corners, is kept. */
function fit(samples: Sample[]): { curve: SideCurve; at: (t: number) => number } | null {
  const x = solve(samples, (t) => [1, t, t * (1 - t), t * t * (1 - t)]);
  if (!x) return null;
  const curve = { a: x[2], b: x[3] };
  return { curve, at: (t) => x[0] + x[1] * t + sideAt(curve, t) };
}

/** How closely two straight pieces meeting at one kink follow the samples (the best kink between
 * FOLD_FROM and FOLD_TO): a folded sheet lying flat, whose panels sit a pixel or two askew. */
function foldRms(samples: Sample[]): number {
  let best = Infinity;
  for (let k = FOLD_FROM; k <= FOLD_TO + 1e-9; k += 0.01) {
    const x = solve(samples, (t) => [1, t, Math.max(0, t - k)]);
    if (x) best = Math.min(best, rms(samples, (t) => x[0] + x[1] * t + x[2] * Math.max(0, t - k)));
  }
  return best;
}

function fitSide({ samples, px }: { samples: Sample[]; px: number }): SideCurve {
  if (samples.length < MIN_KEPT) return ZERO;
  const first = fit(samples);
  if (!first) return ZERO;
  const cut = Math.max(OUTLIER_MULT * median(samples.map((p) => Math.abs(p.s - first.at(p.t)))), OUTLIER_FLOOR);
  const kept = samples.filter((p) => Math.abs(p.s - first.at(p.t)) <= cut);
  if (kept.length < MIN_KEPT || !kept.some((p) => p.t < 0.5) || !kept.some((p) => p.t > 0.5)) return ZERO;
  const second = fit(kept);
  if (!second) return ZERO;
  const residual = rms(kept, second.at);
  let peak = 0;
  for (let i = 0; i <= 100; i += 1) peak = Math.max(peak, Math.abs(sideAt(second.curve, i / 100)));
  if (residual > MAX_RMS || peak * px < MIN_BOW_PX || peak > MAX_BOW) return ZERO;
  // A curled side bends all along; a folded letter's side runs straight to the fold and turns there.
  // When one kink follows the edge as well as the bow does, the page is flat and folded (SCAN-35).
  if (foldRms(kept) <= residual) return ZERO;
  return second.curve;
}

export function findEdgeCurves(gray: GrayImage, quadPx: Quad): EdgeCurves | null {
  let h: Matrix3;
  try {
    h = homography([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], quadPx);
  } catch {
    // expected: degenerate corners have no perspective, so there is nothing to measure
    return null;
  }
  const map = buildEdgeMap(gray);
  const along: Point = { x: 0, y: 1 };
  const across: Point = { x: 1, y: 0 };
  const curves: EdgeCurves = {
    top: fitSide(sampleSide(map, h, (t) => ({ x: t, y: 0 }), along)),
    bottom: fitSide(sampleSide(map, h, (t) => ({ x: t, y: 1 }), along)),
    left: fitSide(sampleSide(map, h, (t) => ({ x: 0, y: t }), across)),
    right: fitSide(sampleSide(map, h, (t) => ({ x: 1, y: t }), across)),
  };
  const bent = [curves.top, curves.right, curves.bottom, curves.left].some((c) => c.a !== 0 || c.b !== 0);
  return bent ? curves : null;
}
