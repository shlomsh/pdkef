// What on a flattened page is ink, and which of it is a vertical rule (SCAN-17): the rows and the
// rules are measured from the same two masks. Pure: no DOM.
import type { GrayImage } from '../quad.ts';

/** A pixel is ink when it is darker than this share of the paper level around it. */
const INK_RATIO = 0.75;
/** Share of each dimension ignored along every edge (scanner and corner shadows). */
const MARGIN = 0.03;
/** Block size for the local paper level, as a share of the long edge. */
const PAPER_BLOCK = 1 / 40;
/** An ink pixel belongs to a rule when its vertical run of ink is at least this share of the height:
 * longer than a letter's stroke, shorter than a table cell. */
const MIN_RUN = 0.025;
/** ...and its horizontal run is at most this share of the width (a crossing rule is not a vertical one). */
const MAX_WIDTH = 0.012;

/** The mean of a block and its neighbours that exist. */
function mean3x3(grid: Float32Array, gw: number, gh: number, bx: number, by: number): number {
  let sum = 0;
  let n = 0;
  for (let yy = Math.max(0, by - 1); yy <= Math.min(gh - 1, by + 1); yy += 1) {
    for (let xx = Math.max(0, bx - 1); xx <= Math.min(gw - 1, bx + 1); xx += 1) { sum += grid[yy * gw + xx]; n += 1; }
  }
  return sum / n;
}

/** @testSeam Read through pageMasks; the test checks the ink on its own. */
export function inkMask(gray: GrayImage): Uint8Array {
  const { width: w, height: h, data } = gray;
  const bs = Math.max(8, Math.round(Math.max(w, h) * PAPER_BLOCK));
  const gw = Math.ceil(w / bs);
  const gh = Math.ceil(h / bs);
  const maxes = new Float32Array(gw * gh);
  for (let y = 0; y < h; y += 1) {
    const row = Math.floor(y / bs) * gw;
    for (let x = 0; x < w; x += 1) {
      const i = row + Math.floor(x / bs);
      if (data[y * w + x] > maxes[i]) maxes[i] = data[y * w + x];
    }
  }
  const paper = new Float32Array(gw * gh);
  for (let by = 0; by < gh; by += 1) {
    for (let bx = 0; bx < gw; bx += 1) paper[by * gw + bx] = mean3x3(maxes, gw, gh, bx, by);
  }
  const mask = new Uint8Array(w * h);
  const mx = Math.ceil(w * MARGIN);
  const my = Math.ceil(h * MARGIN);
  for (let y = my; y < h - my; y += 1) {
    const row = Math.floor(y / bs) * gw;
    for (let x = mx; x < w - mx; x += 1) {
      if (data[y * w + x] < INK_RATIO * paper[row + Math.floor(x / bs)]) mask[y * w + x] = 1;
    }
  }
  return mask;
}

/** @testSeam Rule pixels: ink in a long vertical run that is thin across. */
export function ruleMask(ink: Uint8Array, w: number, h: number): Uint8Array {
  const minRun = Math.max(4, Math.round(h * MIN_RUN));
  const maxWidth = Math.max(2, Math.round(w * MAX_WIDTH));
  const thin = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    let x = 0;
    while (x < w) {
      if (!ink[y * w + x]) { x += 1; continue; }
      let end = x;
      while (end < w && ink[y * w + end]) end += 1;
      if (end - x <= maxWidth) for (let k = x; k < end; k += 1) thin[y * w + k] = 1;
      x = end;
    }
  }
  const rule = new Uint8Array(w * h);
  for (let x = 0; x < w; x += 1) {
    let y = 0;
    while (y < h) {
      if (!thin[y * w + x]) { y += 1; continue; }
      let end = y;
      while (end < h && thin[end * w + x]) end += 1;
      if (end - y >= minRun) for (let k = y; k < end; k += 1) rule[k * w + x] = 1;
      y = end;
    }
  }
  return rule;
}

/** A page's ink and, within it, its vertical rules: computed once, read by the rows and the rules. */
export interface PageMasks { width: number; height: number; ink: Uint8Array; rules: Uint8Array }

export function pageMasks(gray: GrayImage): PageMasks {
  const ink = inkMask(gray);
  return { width: gray.width, height: gray.height, ink, rules: ruleMask(ink, gray.width, gray.height) };
}
