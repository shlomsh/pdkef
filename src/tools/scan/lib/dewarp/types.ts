// The contract between Scan's dewarp pieces (SCAN-17). A bent page is flattened in the homography's
// own unit square, where the person's four corners are (0,0), (1,0), (1,1), (0,1): the perspective
// stays exact and only the bend is added on top. Pure: no DOM.

/**
 * How far one side of the page bows away from the straight line between its two corners, in unit-square
 * units, as d(t) = t(1 - t)(a + b t) for t from 0 (the side's first corner) to 1. Zero at both corners:
 * the person's corners always win. `a` alone is a symmetric arc; `b` lets the bow lean to one end.
 */
export interface SideCurve { a: number; b: number }

/**
 * The page's four sides as curves, each displacing a unit-square coordinate:
 * top    v = 0 + d(u), u from 0 (top-left) to 1 (top-right)
 * bottom v = 1 + d(u), u from 0 (bottom-left) to 1 (bottom-right)
 * left   u = 0 + d(v), v from 0 (top-left) to 1 (bottom-left)
 * right  u = 1 + d(v), v from 0 (top-right) to 1 (bottom-right)
 * Positive moves along +u / +v (right / down in the page), whichever side it is.
 */
export interface EdgeCurves { top: SideCurve; right: SideCurve; bottom: SideCurve; left: SideCurve }

/**
 * The text-line bend of a page already flattened by its corners (and edges): for an output point
 * (x, y), both 0..1 across the page, the point to read is (x, y + bendAt(bend, x, y)), in the same
 * normalized units. It is a grid of `nx` x `ny` displacements over the page (row-major in `d`, node
 * (i, j) at x = i / (nx - 1), y = j / (ny - 1)), read between nodes bilinearly: smooth where the page
 * curls, and able to turn within one cell where it is creased. `box` is where the fit saw lines;
 * outside it the bend is held at its nearest edge, never extrapolated into a blank margin.
 */
export interface LineBend { nx: number; ny: number; d: number[]; box?: { x0: number; x1: number; y0: number; y1: number } }

export const sideAt = (s: SideCurve, t: number): number => t * (1 - t) * (s.a + s.b * t);

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function bendAt(bend: LineBend, px: number, py: number): number {
  const { nx, ny, d, box } = bend;
  const x = clamp(box ? clamp(px, box.x0, box.x1) : px, 0, 1) * (nx - 1);
  const y = clamp(box ? clamp(py, box.y0, box.y1) : py, 0, 1) * (ny - 1);
  const i = Math.min(nx - 2, Math.floor(x));
  const j = Math.min(ny - 2, Math.floor(y));
  const tx = x - i;
  const ty = y - j;
  const k = j * nx + i;
  return (d[k] * (1 - tx) + d[k + 1] * tx) * (1 - ty) + (d[k + nx] * (1 - tx) + d[k + nx + 1] * tx) * ty;
}
