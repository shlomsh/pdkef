// The contract between Scan's dewarp pieces (SCAN-17). A bent page is flattened in the homography's
// own unit square, where the person's four corners are (0,0), (1,0), (1,1), (0,1): the perspective
// stays exact and only the bend is added on top. Pure: no DOM.

/**
 * How far one side of the page sits from the straight line between its two corners, in unit-square
 * units, for t from 0 (the side's first corner) to 1. Zero at both corners: the person's corners always
 * win. The bow d(t) = t(1 - t)(a + b t): `a` alone is a symmetric arc; `b` lets it lean to one end.
 * Two optional terms for a traced border (SCAN-77): `line`, the side's own straight edge when the corners
 * sit a little off the paper; and `kink`, a fold, where the side runs straight to a point and turns.
 */
export interface SideCurve {
  a: number; b: number;
  /** A straight edge e + f t that the corners sit a little off: followed along the side, faded to zero over CORNER_RAMP before each corner. */
  line?: { e: number; f: number };
  /** A fold: two straight pieces meeting at `at` (0 < at < 1), `by` off the chord there, zero at both corners. */
  kink?: { at: number; by: number };
}

/** How much of a side, next to each corner, a `line` fades to zero over: one step of the traced border (SCAN-75 traces 15 points per side, so 1/16), the same straight piece the person sees from a corner to its first dot.
 * @testSeam The tests check the ramp ends where it says. */
export const CORNER_RAMP = 1 / 16;
export const ramp = (t: number): number => Math.max(0, Math.min(1, t / CORNER_RAMP, (1 - t) / CORNER_RAMP));
export const tent = (at: number, t: number): number => (t < at ? t / at : (1 - t) / (1 - at));

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

export const sideAt = (s: SideCurve, t: number): number =>
  t * (1 - t) * (s.a + s.b * t) + (s.line ? (s.line.e + s.line.f * t) * ramp(t) : 0) + (s.kink ? s.kink.by * tent(s.kink.at, t) : 0);

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
