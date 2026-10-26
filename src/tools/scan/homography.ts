// The projective map between two quads: shared by the warp (in the lazy pipeline chunk) and the
// flatten animation (on the page from the start), so the animation does not pull the warp in. Pure.
import type { Point, Quad } from './quad';

export type Matrix3 = [number, number, number, number, number, number, number, number, number];

/** The projective map taking each from[i] onto to[i] (8x8 solve, h[8] = 1). */
export function homography(from: Quad, to: Quad): Matrix3 {
  const m: number[][] = [];
  for (let i = 0; i < 4; i += 1) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    m.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    m.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  let scale = 0;
  for (const row of m) for (let c = 0; c < 8; c += 1) scale = Math.max(scale, Math.abs(row[c]));
  for (let col = 0; col < 8; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < 8; r += 1) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (!(Math.abs(m[pivot][col]) > 1e-12 * (scale || 1))) throw new Error('homography: the corners do not define a perspective');
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = col + 1; r < 8; r += 1) {
      const f = m[r][col] / m[col][col];
      if (f !== 0) for (let c = col; c < 9; c += 1) m[r][c] -= f * m[col][c];
    }
  }
  const h = new Array<number>(9).fill(1);
  for (let r = 7; r >= 0; r -= 1) {
    let sum = m[r][8];
    for (let c = r + 1; c < 8; c += 1) sum -= m[r][c] * h[c];
    h[r] = sum / m[r][r];
  }
  if (h.some((v) => !Number.isFinite(v))) throw new Error('homography: the corners do not define a perspective');
  return h as Matrix3;
}

export function applyHomography(h: Matrix3, p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}
