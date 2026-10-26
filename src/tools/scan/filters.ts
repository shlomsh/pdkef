// The three looks a scanned page can have. Pure: no DOM, no canvas. Never mutates its input.
import type { RgbaImage } from './quad';

export type ScanFilter = 'original' | 'grayscale' | 'document';

/** Ratio of a pixel to the paper around it: at or above PAPER it is white, at or below INK it is black. */
const PAPER = 0.9;
const INK = 0.5;
const BLUR_PASSES = 2;

function lumaPlane(image: RgbaImage): Float32Array {
  const n = image.width * image.height;
  const luma = new Float32Array(n);
  const d = image.data;
  for (let i = 0, p = 0; i < n; i += 1, p += 4) luma[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
  return luma;
}

function boxBlur3(grid: Float32Array, gw: number, gh: number): Float32Array {
  const out = new Float32Array(grid.length);
  for (let y = 0; y < gh; y += 1) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(gh - 1, y + 1);
    for (let x = 0; x < gw; x += 1) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(gw - 1, x + 1);
      let sum = 0;
      for (let yy = y0; yy <= y1; yy += 1) for (let xx = x0; xx <= x1; xx += 1) sum += grid[yy * gw + xx];
      out[y * gw + x] = sum / ((y1 - y0 + 1) * (x1 - x0 + 1));
    }
  }
  return out;
}

function documentLook(image: RgbaImage): RgbaImage {
  const { width, height } = image;
  const luma = lumaPlane(image);
  const bs = Math.max(8, Math.round(Math.max(width, height) / 48));
  const gw = Math.ceil(width / bs);
  const gh = Math.ceil(height / bs);
  let grid = new Float32Array(gw * gh);
  for (let y = 0; y < height; y += 1) {
    const row = Math.floor(y / bs) * gw;
    for (let x = 0; x < width; x += 1) {
      const g = row + Math.floor(x / bs);
      const v = luma[y * width + x];
      if (v > grid[g]) grid[g] = v;
    }
  }
  for (let i = 0; i < BLUR_PASSES; i += 1) grid = boxBlur3(grid, gw, gh);

  const out = new Uint8ClampedArray(width * height * 4);
  // Bilinear sample positions along x are the same for every row.
  const gx0 = new Int32Array(width);
  const gxf = new Float32Array(width);
  for (let x = 0; x < width; x += 1) {
    const f = Math.min(gw - 1, Math.max(0, (x + 0.5) / bs - 0.5));
    const i0 = Math.min(gw - 2 < 0 ? 0 : gw - 2, Math.floor(f));
    gx0[x] = i0;
    gxf[x] = gw > 1 ? f - i0 : 0;
  }
  const span = PAPER - INK;
  for (let y = 0; y < height; y += 1) {
    const fy = Math.min(gh - 1, Math.max(0, (y + 0.5) / bs - 0.5));
    const iy = Math.min(gh - 2 < 0 ? 0 : gh - 2, Math.floor(fy));
    const ty = gh > 1 ? fy - iy : 0;
    const r0 = iy * gw;
    const r1 = Math.min(gh - 1, iy + 1) * gw;
    for (let x = 0; x < width; x += 1) {
      const a = gx0[x];
      const b = Math.min(gw - 1, a + 1);
      const tx = gxf[x];
      const top = grid[r0 + a] * (1 - tx) + grid[r0 + b] * tx;
      const bottom = grid[r1 + a] * (1 - tx) + grid[r1 + b] * tx;
      const bg = Math.max(1, top * (1 - ty) + bottom * ty);
      const t = Math.min(1, Math.max(0, (luma[y * width + x] / bg - INK) / span));
      const v = Math.round(255 * t * t * (3 - 2 * t));
      const p = (y * width + x) * 4;
      out[p] = v; out[p + 1] = v; out[p + 2] = v; out[p + 3] = 255;
    }
  }
  return { width, height, data: out };
}

export function applyFilter(image: RgbaImage, filter: ScanFilter): RgbaImage {
  const { width, height } = image;
  if (filter === 'document') return documentLook(image);
  const out = new Uint8ClampedArray(image.data);
  if (filter === 'grayscale') {
    for (let p = 0; p < out.length; p += 4) {
      const v = Math.round(0.299 * out[p] + 0.587 * out[p + 1] + 0.114 * out[p + 2]);
      out[p] = v; out[p + 1] = v; out[p + 2] = v;
    }
  }
  for (let p = 3; p < out.length; p += 4) out[p] = 255;
  return { width, height, data: out };
}
