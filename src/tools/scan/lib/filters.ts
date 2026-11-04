// The three looks a scanned page can have. Pure: no DOM, no canvas. Never mutates its input.
import type { RgbaImage } from '#lib/pageEnhance/quad.ts';
import { eachMark } from './marks.ts';

export type ScanFilter = 'original' | 'grayscale' | 'document';

/** Ratio of a pixel to the paper around it: at or above PAPER it is white, at or below INK it is black. */
const PAPER = 0.9;
const INK = 0.5;
const BLUR_PASSES = 2;
/** A block whose brightest pixel is under this share of the paper level nearby shows no paper (a printed dark area). */
const NO_PAPER = 0.6;
/** How far, in blocks, to look for paper around a dark block; wider than the dark areas worth keeping (about 16 blocks across). */
const PAPER_REACH = 8;
/** A mark is what is darker than this in the look. */
const MARK = 250;
/** A mark with nothing darker than this has no ink in it: show-through from the back of the sheet or the
 * next one. About 82% of the paper level; real ink, faint stamps and small print reach darker (SCAN-44). */
const FAINT_CORE = 224;

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

/** Replace blocks that are dark because of print, not shade, by the paper level around them. */
function fillNoPaper(grid: Float32Array, gw: number, gh: number): Float32Array {
  const maxAlong = (src: Float32Array, horizontal: boolean): Float32Array => {
    const out = new Float32Array(src.length);
    for (let y = 0; y < gh; y += 1) {
      for (let x = 0; x < gw; x += 1) {
        let m = 0;
        for (let d = -PAPER_REACH; d <= PAPER_REACH; d += 1) {
          const xx = horizontal ? x + d : x;
          const yy = horizontal ? y : y + d;
          if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
          const v = src[yy * gw + xx];
          if (v > m) m = v;
        }
        out[y * gw + x] = m;
      }
    }
    return out;
  };
  const paper = maxAlong(maxAlong(grid, true), false);
  const out = new Float32Array(grid);
  for (let i = 0; i < out.length; i += 1) if (grid[i] < NO_PAPER * paper[i]) out[i] = paper[i];
  return out;
}

/** White for every mark with no ink in it. Real ink keeps its soft edge: that is part of an inked mark. */
function clearFaintMarks(grey: Uint8ClampedArray, width: number, height: number): void {
  eachMark(grey, width, height, MARK, (pixels) => {
    for (const i of pixels) if (grey[i] < FAINT_CORE) return;
    for (const i of pixels) grey[i] = 255;
  });
}

/** The Document look as one grey value a pixel: the page against the paper around it, show-through gone. */
export function documentGrey(image: RgbaImage): Uint8ClampedArray {
  const { width, height } = image;
  const luma = lumaPlane(image);
  const bs = Math.max(8, Math.round(Math.max(width, height) / 48));
  const gw = Math.ceil(width / bs);
  const gh = Math.ceil(height / bs);
  let grid: Float32Array = new Float32Array(gw * gh);
  for (let y = 0; y < height; y += 1) {
    const row = Math.floor(y / bs) * gw;
    for (let x = 0; x < width; x += 1) {
      const g = row + Math.floor(x / bs);
      const v = luma[y * width + x];
      if (v > grid[g]) grid[g] = v;
    }
  }
  grid = fillNoPaper(grid, gw, gh);
  for (let i = 0; i < BLUR_PASSES; i += 1) grid = boxBlur3(grid, gw, gh);

  const grey = new Uint8ClampedArray(width * height);
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
      grey[y * width + x] = Math.round(255 * t * t * (3 - 2 * t));
    }
  }
  clearFaintMarks(grey, width, height);
  return grey;
}

function documentLook(image: RgbaImage): RgbaImage {
  const { width, height } = image;
  const grey = documentGrey(image);
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, p = 0; i < grey.length; i += 1, p += 4) {
    out[p] = grey[i]; out[p + 1] = grey[i]; out[p + 2] = grey[i]; out[p + 3] = 255;
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
