// The live camera's focus and size signals (docs/scan-next.md). Pure: no DOM.
import type { GrayImage, Quad } from '../quad.ts';

/** Variance of the 4-neighbour Laplacian over the pixels inside the quad (normalized coordinates), or
 * the whole image without one. A blurred page has soft edges, so the second derivative stays small;
 * the number is only comparable between frames of the same size. Pixels on the image border are skipped.
 */
export function sharpness(image: GrayImage, quad?: Quad | null): number {
  const { width: w, height: h, data } = image;
  if (w < 3 || h < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y += 1) {
    const [from, to] = quad ? rowSpan(quad, (y + 0.5) / h, w) : [1, w - 2];
    for (let x = Math.max(1, from); x <= Math.min(w - 2, to); x += 1) {
      const i = y * w + x;
      const lap = data[i - 1] + data[i + 1] + data[i - w] + data[i + w] - 4 * data[i];
      sum += lap;
      sumSq += lap * lap;
      n += 1;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return Math.max(0, sumSq / n - mean * mean);
}

/** The first and last pixel column of a convex quad on the row at normalized height `ny`; an empty span when it misses. */
function rowSpan(quad: Quad, ny: number, width: number): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < 4; i += 1) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    if ((a.y <= ny) === (b.y <= ny)) continue;
    const x = a.x + ((ny - a.y) / (b.y - a.y)) * (b.x - a.x);
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  }
  if (lo > hi) return [1, 0];
  return [Math.ceil(lo * width - 0.5), Math.floor(hi * width - 0.5)];
}

/**
 * Normalized area of a quad, 0..1 for one inside the frame (shoelace, either winding).
 */
export function quadArea(quad: Quad): number {
  let twice = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}
