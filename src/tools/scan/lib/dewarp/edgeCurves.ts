// Edge curves for a bent page (SCAN-17): given the person's four corners, find how each side of the
// page bows by searching the photo's gradient edges just inside and outside the straight side, in the
// homography's unit square, and fitting each side to the SideCurve shape. A side with no clear, plausible
// bow comes back as zero. Pure: typed arrays only.
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
const MIN_BOW = 0.002; // a side bowing less than this is left straight
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

/** Where the edge sits across the search line at one point of a side, or null when there is none. */
function candidatesAt(map: EdgeMap, h: Matrix3, p: Point, n: Point, wx: number, wy: number): { s: number[]; mag: number[]; ok: boolean[] } {
  const at = (s: number) => applyHomography(h, { x: p.x + n.x * s, y: p.y + n.y * s });
  const p0 = at(0);
  const p1 = at(1e-3);
  const pxPerUnit = Math.hypot(p1.x - p0.x, p1.y - p0.y) / 1e-3;
  const step = Math.min(MAX_STEP, Math.max(MIN_STEP, 1 / Math.max(pxPerUnit, 1e-6)));
  const count = Math.floor(SEARCH / step);
  const out = { s: [] as number[], mag: [] as number[], ok: [] as boolean[] };
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

function sampleSide(map: EdgeMap, h: Matrix3, point: (t: number) => Point, n: Point): Sample[] {
  const found: { t: number; s: number; peak: number }[] = [];
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
  }
  if (!found.length) return [];
  const floor = Math.max(WEAK_VS_MEDIAN * median(found.map((f) => f.peak)), map.supportRef);
  return found.filter((f) => f.peak >= floor).map(({ t, s }) => ({ t, s }));
}

/** Least squares of a free cubic d = e + f t + t(1-t)(a + b t), solved for all four. The person's
 * corners can sit a little off the paper, which reads as a straight edge offset or tilted from the
 * chord: e and f absorb that, and only the bend (a, b), which vanishes at both corners, is kept. */
function fit(samples: Sample[]): { curve: SideCurve; at: (t: number) => number } | null {
  const basis = (t: number) => [1, t, t * (1 - t), t * t * (1 - t)];
  const m = Array.from({ length: 4 }, () => new Array<number>(5).fill(0));
  for (const { t, s } of samples) {
    const f = basis(t);
    for (let r = 0; r < 4; r += 1) {
      for (let c = 0; c < 4; c += 1) m[r][c] += f[r] * f[c];
      m[r][4] += f[r] * s;
    }
  }
  for (let col = 0; col < 4; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < 4; r += 1) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < 4; r += 1) {
      if (r === col) continue;
      const k = m[r][col] / m[col][col];
      for (let c = col; c < 5; c += 1) m[r][c] -= k * m[col][c];
    }
  }
  const x = m.map((row, i) => row[4] / row[i]);
  const curve = { a: x[2], b: x[3] };
  return { curve, at: (t) => x[0] + x[1] * t + sideAt(curve, t) };
}

function fitSide(samples: Sample[]): SideCurve {
  if (samples.length < MIN_KEPT) return ZERO;
  const first = fit(samples);
  if (!first) return ZERO;
  const cut = Math.max(OUTLIER_MULT * median(samples.map((p) => Math.abs(p.s - first.at(p.t)))), OUTLIER_FLOOR);
  const kept = samples.filter((p) => Math.abs(p.s - first.at(p.t)) <= cut);
  if (kept.length < MIN_KEPT || !kept.some((p) => p.t < 0.5) || !kept.some((p) => p.t > 0.5)) return ZERO;
  const second = fit(kept);
  if (!second) return ZERO;
  const rms = Math.sqrt(kept.reduce((sum, p) => sum + (p.s - second.at(p.t)) ** 2, 0) / kept.length);
  let peak = 0;
  for (let i = 0; i <= 100; i += 1) peak = Math.max(peak, Math.abs(sideAt(second.curve, i / 100)));
  if (rms > MAX_RMS || peak < MIN_BOW || peak > MAX_BOW) return ZERO;
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
