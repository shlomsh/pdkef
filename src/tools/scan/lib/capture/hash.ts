// A 64-bit average hash: the page region shrunk to 8x8 cells, each cell one bit (brighter than the
// mean or not). Two frames of the same page land a few bits apart; another page lands far away.
// Pure: no DOM.
import type { GrayImage, Quad } from '../quad.ts';

const GRID = 8;

/** 16 hex chars. Hashes the quad's bounding box, or the whole image when there is no quad. */
export function averageHash(image: GrayImage, quad?: Quad | null): string {
  const { width, height, data } = image;
  let x0 = 0;
  let y0 = 0;
  let x1 = width;
  let y1 = height;
  if (quad) {
    x0 = Math.floor(Math.min(...quad.map((p) => p.x)) * width);
    x1 = Math.ceil(Math.max(...quad.map((p) => p.x)) * width);
    y0 = Math.floor(Math.min(...quad.map((p) => p.y)) * height);
    y1 = Math.ceil(Math.max(...quad.map((p) => p.y)) * height);
    x0 = Math.max(0, Math.min(width - 1, x0));
    y0 = Math.max(0, Math.min(height - 1, y0));
    x1 = Math.max(x0 + 1, Math.min(width, x1));
    y1 = Math.max(y0 + 1, Math.min(height, y1));
  }
  const w = x1 - x0;
  const h = y1 - y0;
  const sums = new Array<number>(GRID * GRID).fill(0);
  const counts = new Array<number>(GRID * GRID).fill(0);
  for (let y = y0; y < y1; y += 1) {
    const cy = Math.min(GRID - 1, Math.floor(((y - y0) * GRID) / h));
    for (let x = x0; x < x1; x += 1) {
      const cell = cy * GRID + Math.min(GRID - 1, Math.floor(((x - x0) * GRID) / w));
      sums[cell] += data[y * width + x];
      counts[cell] += 1;
    }
  }
  const means = sums.map((s, i) => (counts[i] ? s / counts[i] : 0));
  const mean = means.reduce((a, b) => a + b, 0) / means.length;
  let hex = '';
  for (let nibble = 0; nibble < 16; nibble += 1) {
    let v = 0;
    for (let bit = 0; bit < 4; bit += 1) v = v * 2 + (means[nibble * 4 + bit] > mean ? 1 : 0);
    hex += v.toString(16);
  }
  return hex;
}

/** Hamming distance between two hashes, 0..64. */
export function hashDistance(a: string, b: string): number {
  let bits = 0;
  for (let i = 0; i < a.length; i += 1) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      bits += x & 1;
      x >>= 1;
    }
  }
  return bits;
}
