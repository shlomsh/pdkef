// Edge guess, after the fold. Cutting a side in to the fold leaves the other three sides as the brightness
// guess drew them, axis-aligned, where an open book on a desk is turned a little and its real edges run
// slightly off them. Each of those sides is moved to the strongest page edge near it: either end may shift
// along the neighbouring side, so a tilted edge is followed. Pure.
import type { EdgeMap } from '#lib/pageEnhance/edgeMap.ts';
import type { Point, Quad } from '#lib/pageEnhance/quad.ts';
import { sideSupport } from './outline.ts';

const REACH = 0.06; // of the neighbouring side's length: how far an end may shift, either way
const STEP = 0.005;
const GAIN = 0.15; // how much support a side must gain before it moves

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function meet(a: Point, b: Point, c: Point, d: Point): Point | null {
  const r = { x: b.x - a.x, y: b.y - a.y }; const s = { x: d.x - c.x, y: d.y - c.y };
  const det = r.x * s.y - r.y * s.x;
  if (Math.abs(det) < 1e-9) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / det;
  return { x: a.x + r.x * t, y: a.y + r.y * t };
}

/** After a fold cut, each side but the folds is moved to the strongest page edge near it: either end may
 * shift by up to REACH of the neighbouring side's length, so a tilted edge is followed. A side moves only
 * when its support rises by at least GAIN. */
export function snapSides(map: EdgeMap, quad: Quad, folds: readonly number[]): Quad {
  const q = quad.map((p) => ({ x: p.x * map.width, y: p.y * map.height }));
  const centre = { x: q.reduce((s, p) => s + p.x, 0) / 4, y: q.reduce((s, p) => s + p.y, 0) / 4 };
  const steps = Math.round(REACH / STEP);
  const lines = q.map((a, i) => {
    const b = q[(i + 1) % 4];
    if (folds.includes(i)) return [a, b];
    const before = q[(i + 3) % 4]; const after = q[(i + 2) % 4];
    let best = [a, b];
    let bestSupport = sideSupport(map, a, b, centre) + GAIN;
    for (let j = -steps; j <= steps; j += 1) {
      const pa = lerp(a, before, j * STEP);
      for (let k = -steps; k <= steps; k += 1) {
        const pb = lerp(b, after, k * STEP);
        const v = sideSupport(map, pa, pb, centre);
        if (v > bestSupport) { bestSupport = v; best = [pa, pb]; }
      }
    }
    return best;
  });
  const corners = q.map((p, i) => {
    const prev = lines[(i + 3) % 4]; const own = lines[i];
    return meet(prev[0], prev[1], own[0], own[1]) ?? p;
  });
  return corners.map((p) => ({ x: p.x / map.width, y: p.y / map.height })) as Quad;
}
