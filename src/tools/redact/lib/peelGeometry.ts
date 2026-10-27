/**
 * RED-28: the geometry of a deleted object peeling off the page like a
 * sticker. Pure: DeleteLift.tsx asks for one frame per animation tick and
 * writes the result to the DOM.
 *
 * The object is a w x h rectangle in its own pixels. A fold line starts at the
 * peeled corner and sweeps across it; everything past the line has been
 * lifted and lies folded back over the rest, mirrored in the line.
 */

export type Point = readonly [number, number];

export interface PeelFrame {
  /** What still sits on the page, as a CSS clip-path. */
  front: string;
  /** The lifted part, before folding, as a CSS clip-path. */
  flap: string;
  /** The fold: mirrors the lifted part in the fold line (transform-origin 0 0). */
  fold: string;
}

/** The chosen look (tuned with Shlomi, 2026-09-29; the 12% shadow
 * is in PdfRedactTool.module.css). The peel always starts
 * at the top-right corner, where a right-to-left line starts. */
export const PEEL = {
  foldAngleDeg: 10,
  peelMs: 500,
  flyMs: 160,
  flyDistancePx: 18,
  flySpinDeg: 10,
} as const;

const EMPTY = 'polygon(0 0, 0 0, 0 0)';

/** The unit normal of the fold line, pointing from the object out through the
 * top-right corner, at `angleDeg` above horizontal. */
function normal(angleDeg: number): Point {
  const a = (angleDeg * Math.PI) / 180;
  return [Math.cos(a), -Math.sin(a)];
}

/** How far the fold line travels from the corner until nothing is left. */
export function peelDistance(w: number, h: number, angleDeg: number): number {
  const [nx, ny] = normal(angleDeg);
  // The farthest point from the top-right corner along -n is the bottom-left.
  return w * nx - h * ny;
}

/** Keeps the part of `poly` where `side` is >= 0 (one Sutherland-Hodgman pass). */
export function clipHalfPlane(poly: readonly Point[], side: (p: Point) => number): Point[] {
  const out: Point[] = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const fa = side(a);
    const fb = side(b);
    if (fa >= 0) out.push(a);
    if (fa >= 0 !== fb >= 0) {
      const k = fa / (fa - fb);
      out.push([a[0] + k * (b[0] - a[0]), a[1] + k * (b[1] - a[1])]);
    }
  });
  return out;
}

function toClipPath(poly: readonly Point[]): string {
  if (poly.length < 3) return EMPTY;
  return `polygon(${poly.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(', ')})`;
}

/** The frame with the fold line `d` pixels in from the top-right corner. */
export function peelFrame(w: number, h: number, d: number, angleDeg: number): PeelFrame {
  const [nx, ny] = normal(angleDeg);
  const rect: Point[] = [[0, 0], [w, 0], [w, h], [0, h]];
  // Signed distance past the fold line: > 0 is lifted.
  const past = ([x, y]: Point) => (x - w) * nx + y * ny + d;
  // Mirror in the fold line: p' = p - 2 * past(p) * n, an affine map.
  const shift = 2 * (w * nx - d);
  const fold = `matrix(${1 - 2 * nx * nx}, ${-2 * nx * ny}, ${-2 * nx * ny}, ${1 - 2 * ny * ny}, ${shift * nx}, ${shift * ny})`;
  return {
    front: toClipPath(clipHalfPlane(rect, (p) => -past(p))),
    flap: toClipPath(clipHalfPlane(rect, past)),
    fold,
  };
}

/** Even pull: slow in, slow out. */
export function easeInOut(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
}
