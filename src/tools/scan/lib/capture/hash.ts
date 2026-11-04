// A 64-bit average hash of the page itself (SCAN-23): the page is flattened through its corners into 8x8
// cells, each cell one bit (brighter than the mean or not). Sampling through the perspective means the same
// page seen at another angle or distance lands a few bits apart; another page lands far away.
// Pure: no DOM.
import { applyHomography, homography, type Matrix3 } from '../homography.ts';
import { FULL_QUAD, type GrayImage, type Quad } from '../quad.ts';

const GRID = 8;
/** Samples per cell side: enough to average text into tone rather than alias on it. */
const SUB = 8;
/** Share of the page left out at each edge, so a corner found a little off does not pull the table in. */
const INSET = 0.05;

/** Bilinear gray value at pixel coordinates, clamped to the image. */
function sample({ width, height, data }: GrayImage, px: number, py: number): number {
  const x = Math.max(0, Math.min(width - 1, px));
  const y = Math.max(0, Math.min(height - 1, py));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const top = data[y0 * width + x0] * (1 - fx) + data[y0 * width + x1] * fx;
  const bottom = data[y1 * width + x0] * (1 - fx) + data[y1 * width + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

/** The unit square onto the quad, or null when the corners do not make a perspective. */
function pageMap(quad: Quad): Matrix3 | null {
  try {
    return homography(FULL_QUAD, quad);
  } catch {
    return null;
  }
}

/** 16 hex chars. Hashes the page inside the quad, flattened; the whole image when there is no quad. */
export function averageHash(image: GrayImage, quad?: Quad | null): string {
  const map = quad ? pageMap(quad) : null;
  const lo = map ? INSET : 0;
  const span = map ? 1 - 2 * INSET : 1;
  const means = new Array<number>(GRID * GRID).fill(0);
  for (let cy = 0; cy < GRID; cy += 1) {
    for (let cx = 0; cx < GRID; cx += 1) {
      let sum = 0;
      for (let sy = 0; sy < SUB; sy += 1) {
        for (let sx = 0; sx < SUB; sx += 1) {
          const u = lo + (span * (cx + (sx + 0.5) / SUB)) / GRID;
          const v = lo + (span * (cy + (sy + 0.5) / SUB)) / GRID;
          const p = map ? applyHomography(map, { x: u, y: v }) : { x: u, y: v };
          sum += sample(image, p.x * image.width - 0.5, p.y * image.height - 0.5);
        }
      }
      means[cy * GRID + cx] = sum / (SUB * SUB);
    }
  }
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
