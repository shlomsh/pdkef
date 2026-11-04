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
 * normalized units. `c` holds the nine coefficients of
 *   sum over i = 1..3, j = 0..2 of c[(i - 1) * 3 + j] * (x^i - 1 / (i + 1)) * y^j
 * (each x-term has zero mean across the page's width, so the bend never shifts a whole line up or down).
 */
export interface LineBend { c: number[] }

export const sideAt = (s: SideCurve, t: number): number => t * (1 - t) * (s.a + s.b * t);

export function bendAt(bend: LineBend, x: number, y: number): number {
  let sum = 0;
  let xi = x;
  for (let i = 1; i <= 3; i += 1) {
    const basis = xi - 1 / (i + 1);
    sum += basis * (bend.c[(i - 1) * 3] + y * (bend.c[(i - 1) * 3 + 1] + y * bend.c[(i - 1) * 3 + 2]));
    xi *= x;
  }
  return sum;
}
