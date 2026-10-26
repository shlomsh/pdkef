// Test-only fixtures for the edge guessers: gray images built in code. Not imported by app code.
import type { GrayImage, Point, Quad } from '../quad.ts';

export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function solid(width: number, height: number, value: number): GrayImage {
  return { width, height, data: new Uint8ClampedArray(width * height).fill(value) };
}

function inside(q: Quad, x: number, y: number): boolean {
  let pos = false;
  let neg = false;
  for (let i = 0; i < 4; i += 1) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (c > 0) pos = true;
    else if (c < 0) neg = true;
  }
  return !(pos && neg);
}

/** Fill a convex pixel-space quad with `value`. */
export function fillQuad(image: GrayImage, quad: Quad, value: number): void {
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(image.width - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(image.height - 1, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (inside(quad, x + 0.5, y + 0.5)) image.data[y * image.width + x] = value;
    }
  }
}

export function fillRect(image: GrayImage, x: number, y: number, w: number, h: number, value: number): void {
  fillQuad(image, [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], value);
}

export function addNoise(image: GrayImage, amplitude: number, seed: number): void {
  const rnd = seededRandom(seed);
  for (let i = 0; i < image.data.length; i += 1) image.data[i] += (rnd() - 0.5) * 2 * amplitude;
}

/** Add a left-to-right brightness ramp of `strength` levels across the width. */
export function addGradient(image: GrayImage, strength: number): void {
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) image.data[y * image.width + x] += (x / image.width - 0.5) * strength;
  }
}

/** Normalized (x+0.5)/w style truth for pixel-space corners given as raw edge positions. */
export const norm = (p: Point, w: number, h: number): Point => ({ x: p.x / w, y: p.y / h });
