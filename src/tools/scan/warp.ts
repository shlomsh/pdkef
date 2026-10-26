// Homography and perspective warp (docs/scan-to-pdf.md, "Contract"). Pure: no DOM, no canvas.
import type { Point, Quad, RgbaImage } from './quad';

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

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Output size for a pixel quad: the longer of each pair of opposite edges, long side capped. */
export function warpSize(quadPx: Quad, maxLongEdge: number): { width: number; height: number } {
  let width = Math.max(dist(quadPx[0], quadPx[1]), dist(quadPx[3], quadPx[2]));
  let height = Math.max(dist(quadPx[0], quadPx[3]), dist(quadPx[1], quadPx[2]));
  const long = Math.max(width, height);
  if (long > maxLongEdge) {
    const k = maxLongEdge / long;
    width *= k;
    height *= k;
  }
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

/** Maps the output rectangle onto `quadPx`, sampling `src` bilinearly; outside the photo is white. */
export function warpPerspective(src: RgbaImage, quadPx: Quad, width: number, height: number): RgbaImage {
  const out = new Uint8ClampedArray(width * height * 4);
  const h = homography([{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }], quadPx);
  const sw = src.width;
  const sh = src.height;
  const s = src.data;
  const maxX = sw - 1;
  const maxY = sh - 1;
  let o = 0;
  for (let v = 0; v < height; v += 1) {
    const cy = v + 0.5;
    // Numerators and denominator at the first pixel centre of the row; each step adds a column of h.
    let nx = h[0] * 0.5 + h[1] * cy + h[2];
    let ny = h[3] * 0.5 + h[4] * cy + h[5];
    let nw = h[6] * 0.5 + h[7] * cy + h[8];
    for (let u = 0; u < width; u += 1, o += 4) {
      const sx = nx / nw;
      const sy = ny / nw;
      nx += h[0];
      ny += h[3];
      nw += h[6];
      if (!(nw > 0) || !(sx >= 0 && sx <= sw && sy >= 0 && sy <= sh)) {
        out[o] = 255; out[o + 1] = 255; out[o + 2] = 255; out[o + 3] = 255;
        continue;
      }
      let fx = sx - 0.5;
      let fy = sy - 0.5;
      if (fx < 0) fx = 0; else if (fx > maxX) fx = maxX;
      if (fy < 0) fy = 0; else if (fy > maxY) fy = maxY;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = x0 < maxX ? x0 + 1 : x0;
      const y1 = y0 < maxY ? y0 + 1 : y0;
      const tx = fx - x0;
      const ty = fy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const w00 = (1 - tx) * (1 - ty);
      const w10 = tx * (1 - ty);
      const w01 = (1 - tx) * ty;
      const w11 = tx * ty;
      out[o] = s[i00] * w00 + s[i10] * w10 + s[i01] * w01 + s[i11] * w11;
      out[o + 1] = s[i00 + 1] * w00 + s[i10 + 1] * w10 + s[i01 + 1] * w01 + s[i11 + 1] * w11;
      out[o + 2] = s[i00 + 2] * w00 + s[i10 + 2] * w10 + s[i01 + 2] * w01 + s[i11 + 2] * w11;
      out[o + 3] = 255;
    }
  }
  return { width, height, data: out };
}
