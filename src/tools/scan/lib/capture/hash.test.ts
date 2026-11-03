import { describe, expect, it } from 'vitest';
import type { GrayImage } from '../quad.ts';
import { averageHash, hashDistance } from './hash.ts';

const image = (w: number, h: number, f: (x: number, y: number) => number): GrayImage => {
  const data = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) data[y * w + x] = f(x, y);
  return { width: w, height: h, data };
};
const halves = image(64, 64, (x) => (x < 32 ? 20 : 220));

describe('averageHash', () => {
  it('is 16 hex chars and stable for the same image', () => {
    const h = averageHash(halves);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(averageHash(halves)).toBe(h);
  });
  it('is the same at another resolution', () => {
    expect(hashDistance(averageHash(halves), averageHash(image(128, 96, (x) => (x < 64 ? 20 : 220))))).toBe(0);
  });
  it('differs for a different layout', () => {
    const rows = image(64, 64, (_, y) => (y < 32 ? 20 : 220));
    expect(hashDistance(averageHash(halves), averageHash(rows))).toBeGreaterThan(16);
  });
  it('hashes only the quad bounding box', () => {
    const img = image(64, 64, (x) => (x < 32 ? 20 : 220));
    const left = [{ x: 0, y: 0 }, { x: 0.4, y: 0 }, { x: 0.4, y: 1 }, { x: 0, y: 1 }] as const;
    const flat = averageHash(img, [...left] as never);
    expect(hashDistance(flat, averageHash(halves))).toBeGreaterThan(0);
  });
});

describe('hashDistance', () => {
  it('counts differing bits', () => {
    expect(hashDistance('0000000000000000', '0000000000000000')).toBe(0);
    expect(hashDistance('0000000000000000', 'ffffffffffffffff')).toBe(64);
    expect(hashDistance('0000000000000001', '0000000000000003')).toBe(1);
  });
});
