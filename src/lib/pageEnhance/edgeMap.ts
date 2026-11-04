// The gradient map the outline guesser and the dewarp's edge curves both read: blur, Sobel gradient and
// non-maximum suppression. Pure, typed arrays only.
import type { GrayImage } from './quad.ts';

const FULL_CONTRAST = 25; // gray levels of inside-vs-outside difference that count as a real boundary

export function blur3(src: ArrayLike<number>, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(w - 1, x + 1);
      let sum = 0;
      let n = 0;
      for (let yy = y0; yy <= y1; yy += 1) for (let xx = x0; xx <= x1; xx += 1) { sum += src[yy * w + xx]; n += 1; }
      out[y * w + x] = sum / n;
    }
  }
  return out;
}

export interface EdgeMap {
  width: number;
  height: number;
  /** The blurred gray values the gradients came from. */
  gray: Float32Array;
  /** 1 where the pixel is a thin, strong edge. */
  edge: Uint8Array;
  /** Indices of the edge pixels, so line fitting walks thousands of pixels, not the whole image. */
  list: Int32Array;
  mag: Float32Array;
  /** Unit gradient direction per pixel (meaningful where `edge` is 1). */
  ux: Float32Array;
  uy: Float32Array;
  /** Gradient strength below which a pixel is not an edge at all. */
  floor: number;
  /** Gradient strength that counts as a strong edge (line votes weigh by it). */
  ref: number;
  /** Gradient strength at which an edge fully supports a side: far lower, a faint edge still is one. */
  supportRef: number;
  /** Gray levels of inside-vs-outside difference that count as a real boundary. */
  contrast: number;
  /** A faint map (faintEdgeMap): a side must also stop at its corners, not run on past them. */
  faint: boolean;
}

export function buildEdgeMap(image: GrayImage): EdgeMap {
  const { width: w, height: h } = image;
  const g = blur3(blur3(image.data, w, h), w, h);
  const n = w * h;
  const mag = new Float32Array(n);
  const ux = new Float32Array(n);
  const uy = new Float32Array(n);
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const gx = g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1];
      const gy = g[i + w - 1] + 2 * g[i + w] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - w] - g[i - w + 1];
      const m = Math.hypot(gx, gy);
      mag[i] = m;
      if (m > 0) { ux[i] = gx / m; uy[i] = gy / m; }
    }
  }
  // p99 of the gradient strength sets the floor for what counts as an edge at all.
  const floor = Math.max(14, 0.12 * magPercentile(mag, 0.99));
  const { edge, list, strengths } = thinEdges(mag, ux, uy, w, h, floor);
  strengths.sort((a, b) => a - b);
  const top = strengths.length ? strengths[Math.floor(strengths.length * 0.98)] : floor;
  return { width: w, height: h, gray: g, edge, list, mag, ux, uy, floor, ref: 0.5 * top, supportRef: Math.max(floor, 0.15 * top), contrast: FULL_CONTRAST, faint: false };
}

export function magPercentile(mag: Float32Array, p: number): number {
  const hist = new Uint32Array(2048);
  for (let i = 0; i < mag.length; i += 1) hist[Math.min(2047, mag[i] | 0)] += 1;
  let c = 0;
  for (let b = 0; b < 2048; b += 1) { c += hist[b]; if (c >= p * mag.length) return b; }
  return 2047;
}

/** Non-maximum suppression: the pixels at least `floor` strong that peak across their own edge. */
export function thinEdges(mag: Float32Array, ux: Float32Array, uy: Float32Array, w: number, h: number, floor: number): { edge: Uint8Array; list: Int32Array; strengths: number[] } {
  const n = w * h;
  const edge = new Uint8Array(n);
  const strengths: number[] = [];
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const m = mag[i];
      if (m < floor) continue;
      // Compare along the gradient direction, snapped to one of four neighbour pairs.
      const ax = Math.abs(ux[i]);
      const ay = Math.abs(uy[i]);
      let d: number;
      if (ay < 0.38) d = 1;
      else if (ax < 0.38) d = w;
      else d = (ux[i] > 0) === (uy[i] > 0) ? w + 1 : w - 1;
      if (m >= mag[i - d] && m > mag[i + d]) { edge[i] = 1; strengths.push(m); }
    }
  }
  const list = new Int32Array(strengths.length);
  for (let i = 0, k = 0; i < n; i += 1) if (edge[i]) list[k++] = i;
  return { edge, list, strengths };
}
