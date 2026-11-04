// A warp along any smooth map (SCAN-17). The map is evaluated on a coarse grid of the output and
// interpolated inside each cell, so a bend that costs a homography and two polynomials per call still
// warps a 2400px page quickly. Pure: no DOM, no canvas.
import type { Point, RgbaImage } from '../quad.ts';

/** Output pixels between two evaluations of the map: the map bends over hundreds of pixels, so the
 * error of interpolating a cell this size is far below a pixel. */
const CELL = 8;

/** Where in `src` (pixels) the output point (x, y), both 0..1 across the output, is read from. */
export type PageMap = (x: number, y: number) => Point;

/** Fills a `width` x `height` image by sampling `src` bilinearly at `map` of each pixel centre;
 * outside the photo is white, as in warpPerspective. */
export function warpAlong(src: RgbaImage, map: PageMap, width: number, height: number): RgbaImage {
  const gw = Math.ceil(width / CELL) + 1;
  const gh = Math.ceil(height / CELL) + 1;
  const gx = new Float64Array(gw * gh);
  const gy = new Float64Array(gw * gh);
  for (let j = 0; j < gh; j += 1) {
    for (let i = 0; i < gw; i += 1) {
      const p = map((i * CELL) / width, (j * CELL) / height);
      gx[j * gw + i] = p.x;
      gy[j * gw + i] = p.y;
    }
  }
  const out = new Uint8ClampedArray(width * height * 4);
  const { width: sw, height: sh, data: s } = src;
  const maxX = sw - 1;
  const maxY = sh - 1;
  for (let v = 0; v < height; v += 1) {
    const fy = (v + 0.5) / CELL;
    const j = Math.min(gh - 2, Math.floor(fy));
    const ty = fy - j;
    for (let u = 0; u < width; u += 1) {
      const fx = (u + 0.5) / CELL;
      const i = Math.min(gw - 2, Math.floor(fx));
      const tx = fx - i;
      const k = j * gw + i;
      const sx = (gx[k] * (1 - tx) + gx[k + 1] * tx) * (1 - ty) + (gx[k + gw] * (1 - tx) + gx[k + gw + 1] * tx) * ty;
      const sy = (gy[k] * (1 - tx) + gy[k + 1] * tx) * (1 - ty) + (gy[k + gw] * (1 - tx) + gy[k + gw + 1] * tx) * ty;
      const o = (v * width + u) * 4;
      if (!(sx >= 0 && sx <= sw && sy >= 0 && sy <= sh)) {
        out[o] = 255; out[o + 1] = 255; out[o + 2] = 255; out[o + 3] = 255;
        continue;
      }
      let px = sx - 0.5;
      let py = sy - 0.5;
      if (px < 0) px = 0; else if (px > maxX) px = maxX;
      if (py < 0) py = 0; else if (py > maxY) py = maxY;
      const x0 = Math.floor(px);
      const y0 = Math.floor(py);
      const x1 = x0 < maxX ? x0 + 1 : x0;
      const y1 = y0 < maxY ? y0 + 1 : y0;
      const ax = px - x0;
      const ay = py - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const w00 = (1 - ax) * (1 - ay);
      const w10 = ax * (1 - ay);
      const w01 = (1 - ax) * ay;
      const w11 = ax * ay;
      out[o] = s[i00] * w00 + s[i10] * w10 + s[i01] * w01 + s[i11] * w11;
      out[o + 1] = s[i00 + 1] * w00 + s[i10 + 1] * w10 + s[i01 + 1] * w01 + s[i11 + 1] * w11;
      out[o + 2] = s[i00 + 2] * w00 + s[i10 + 2] * w10 + s[i01 + 2] * w01 + s[i11 + 2] * w11;
      out[o + 3] = 255;
    }
  }
  return { width, height, data: out };
}
