// Scores a snap function against the snap corpus (README.md in this folder): three outcomes per tap.
// Pure over data: pages come in as { raster, truth }, the function under test comes in as `snap`.
import { degrade, LEVELS, VIEWS } from './degrade.js';
import { sampleTaps } from './sampleTaps.js';
import { summarise } from './snapStats.js';

// 3 mm on a phone: a CSS px is about 0.1587 mm and the device pixel ratio is 3.
export const MAX_SNAP_PX = Math.round((3 / 0.1587) * 3);
// The window reaches the snap radius plus a margin, so a rule one snap away is seen whole.
const WINDOW_HALF_W = 120;
const WINDOW_HALF_H = MAX_SNAP_PX + 24;

/** A gray window around a raster position; pixels outside the page are white. `origin` maps window px to raster px. */
export function cutWindow(raster, cx, cy, halfW = WINDOW_HALF_W, halfH = WINDOW_HALF_H) {
  const tx = Math.round(cx);
  const ty = Math.round(cy);
  const width = 2 * halfW + 1;
  const height = 2 * halfH + 1;
  const data = new Uint8ClampedArray(width * height).fill(255);
  for (let y = 0; y < height; y++) {
    const ry = ty - halfH + y;
    if (ry < 0 || ry >= raster.height) continue;
    const x0 = Math.max(0, tx - halfW);
    const x1 = Math.min(raster.width, tx + halfW + 1);
    if (x1 <= x0) continue;
    data.set(raster.data.subarray(ry * raster.width + x0, ry * raster.width + x1), y * width + (x0 - (tx - halfW)));
  }
  return {
    window: { data, width, height, pxPerPoint: raster.pxPerPoint },
    tap: { x: halfW + (cx - tx), y: halfH + (cy - ty) },
    origin: { x: tx - halfW, y: ty - halfH },
  };
}

// The y a result claims, and the x extent it covers.
const resultBase = (r) => (r.kind === 'box' ? r.y1 : r.y);

/**
 * correct / wrong / declined for one tap.
 * ctx: { expect, rule (the expected truth rule or undefined), tapWin, origin, unmapPoint, maxSnapPx }.
 */
export function classify(result, ctx) {
  if (!result || !result.snapped) return { outcome: 'declined', why: result?.reason ?? 'declined' };
  const { expect, rule, tapWin, origin, unmapPoint, maxSnapPx } = ctx;
  const y = resultBase(result);
  const dx = Math.max(result.x0 - tapWin.x, 0, tapWin.x - result.x1);
  const dist = Math.hypot(dx, y - tapWin.y);
  if (!(dist <= maxSnapPx + 0.5)) return { outcome: 'wrong', why: 'too-far' };
  if (expect.kind === 'decline') return { outcome: 'wrong', why: `snapped-on-${expect.why}` };
  // Where the snapped line sits on the pristine page, at the tap's own x (clamped into the run).
  const sx = Math.min(Math.max(tapWin.x, result.x0), result.x1);
  const p = unmapPoint(origin.x + sx, origin.y + y);
  const tol = 1.5 + (rule.thickness || 1);
  const onRule = Math.abs(p.y - rule.y) <= tol && p.x >= rule.x0 - tol && p.x <= rule.x1 + tol;
  return onRule ? { outcome: 'correct', why: 'on-rule' } : { outcome: 'wrong', why: 'wrong-rule' };
}

/**
 * Runs the corpus. pages: [{ raster, truth }]; snap(window, tap, { maxSnapPx }, oracle) -> result.
 * The 4th argument is for oracles in tests only; the real function must ignore it.
 */
export function runSnapCorpus({
  pages,
  snap,
  levels = LEVELS,
  views = Object.keys(VIEWS),
  seed = 1,
  perRule = 3,
  decoys = 12,
  maxSnapPx = MAX_SNAP_PX,
}) {
  const cases = [];
  for (const { raster, truth } of pages) {
    const ruleById = new Map(truth.rules.map((r) => [r.id, r]));
    for (const view of views) {
      const taps = sampleTaps(truth, { view, maxSnapPts: maxSnapPx / VIEWS[view], seed, perRule, decoys });
      for (const level of levels) {
        const d = degrade(raster, { level, view, seed });
        for (const { tap, expect } of taps) {
          const at = d.mapPoint(tap.x, tap.y);
          const { window, tap: tapWin, origin } = cutWindow(d.raster, at.x, at.y);
          const oracle = { truth, mapPoint: d.mapPoint, unmapPoint: d.unmapPoint, origin, pxPerPoint: d.raster.pxPerPoint };
          const result = snap(window, tapWin, { maxSnapPx }, oracle);
          const rule = expect.kind === 'snap' ? ruleById.get(expect.ruleId) : undefined;
          const { outcome, why } = classify(result, { expect, rule, tapWin, origin, unmapPoint: d.unmapPoint, maxSnapPx });
          cases.push({ formId: truth.id, level, view, tapId: tap.id, expect: expect.kind, outcome, why });
        }
      }
    }
  }
  return { cases, summary: summarise(cases) };
}
