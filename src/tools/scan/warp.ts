// Perspective warp (docs/scan-to-pdf.md, "Contract"). Pure: no DOM, no canvas.
import type { Point, Quad, RgbaImage } from './quad';
import { homography } from './homography.ts';

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
