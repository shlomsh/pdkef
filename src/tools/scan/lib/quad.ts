// Scan's own quad helpers: the full-photo quad, the page-likeness test, the cache key and the turned-photo
// views. The shapes and the pure corner moves are in src/lib/pageEnhance/quad.ts.
import { rotateQuad } from '#lib/pageEnhance/quad.ts';
import type { Point, Quad } from '#lib/pageEnhance/quad.ts';

export const FULL_QUAD: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Strictly convex with every turn the same way: no bow tie, no dent, no three corners on a line. */
export function isConvexQuad(quad: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const turn = cross(quad[i], quad[(i + 1) % 4], quad[(i + 2) % 4]);
    if (Math.abs(turn) < 1e-9) return false;
    const s = Math.sign(turn);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** The sine of 15 degrees: no corner of a photographed page is sharper than that, or flatter than 165. */
const MIN_CORNER_SINE = Math.sin((15 * Math.PI) / 180);

/** Convex, and every corner a real page could have: a corner on, or all but on, the line between its
 * neighbours (near 180 degrees) passes isConvexQuad by a hair, and the warp fans the page out. */
export function isPagelike(quad: Quad): boolean {
  if (!isConvexQuad(quad)) return false;
  return quad.every((p, i) => {
    const a = quad[(i + 1) % 4];
    const b = quad[(i + 3) % 4];
    const lengths = Math.hypot(a.x - p.x, a.y - p.y) * Math.hypot(b.x - p.x, b.y - p.y);
    return lengths > 0 && Math.abs(cross(p, a, b)) / lengths >= MIN_CORNER_SINE;
  });
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function clampPoint(point: Point): Point {
  return { x: clamp01(point.x), y: clamp01(point.y) };
}

/** A cache key: four decimals, a tenth of a pixel on a 1000px photo. */
export function quadKey(quad: Quad): string {
  return quad.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(';');
}

const quarters = (turns: number) => ((turns % 4) + 4) % 4;
/** A photo point on the photo turned one quarter clockwise. */
const turnOnce = (p: Point): Point => ({ x: 1 - p.y, y: p.x });
/** Back again: one quarter anticlockwise. */
const unturnOnce = (p: Point): Point => ({ x: p.y, y: 1 - p.x });
const repeat = (p: Point, step: (p: Point) => Point, n: number) => {
  let out = p;
  for (let i = 0; i < n; i += 1) out = step(out);
  return out;
};

/** The page's corners as the corner editor shows them on the photo turned `turns` quarters clockwise:
 * normalized in the turned photo, the page's top-left first, so its handles read the right way up. */
export function turnedQuad(quad: Quad, turns: number): Quad {
  const n = quarters(turns);
  return rotateQuad(quad, n).map((p) => repeat(p, turnOnce, n)) as Quad;
}

/** The corners a person placed on the turned photo, back in the photo as photographed. */
export function unturnedQuad(shown: Quad, turns: number): Quad {
  const n = quarters(turns);
  return rotateQuad(shown.map((p) => repeat(p, unturnOnce, n)) as Quad, -n);
}
