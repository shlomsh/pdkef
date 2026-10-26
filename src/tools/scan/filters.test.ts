import { describe, expect, it } from 'vitest';
import { applyFilter, type ScanFilter } from './filters';
import type { RgbaImage } from './quad';

function make(width: number, height: number, fn: (x: number, y: number) => [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = fn(x, y);
      const i = (y * width + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 200;
    }
  }
  return { width, height, data };
}

const W = 240;
const H = 160;
// Two thin text bars (3px tall) on the page.
const BARS = [{ y0: 40, y1: 43, x0: 30, x1: 200 }, { y0: 100, y1: 103, x0: 30, x1: 200 }];
const inBar = (x: number, y: number, pad = 0) =>
  BARS.some((b) => x >= b.x0 - pad && x < b.x1 + pad && y >= b.y0 - pad && y < b.y1 + pad);
const paperAt = (x: number) => 110 + (120 * x) / (W - 1);
const unevenPage = () =>
  make(W, H, (x, y) => {
    const v = Math.round(inBar(x, y) ? paperAt(x) * 0.35 : paperAt(x));
    return [v, v, v];
  });

describe('applyFilter', () => {
  it('document evens out uneven light: paper white, ink black', () => {
    const out = applyFilter(unevenPage(), 'document');
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const v = out.data[(y * W + x) * 4];
        if (inBar(x, y)) expect(v, `bar ${x},${y}`).toBeLessThanOrEqual(60);
        else if (!inBar(x, y, 3)) expect(v, `paper ${x},${y}`).toBeGreaterThanOrEqual(245);
      }
    }
  });

  it('document keeps a uniformly lit clean page white', () => {
    const out = applyFilter(make(W, H, () => [180, 180, 180]), 'document');
    for (let i = 0; i < out.data.length; i += 4) expect(out.data[i]).toBe(255);
  });

  it('document outputs gray with alpha 255', () => {
    const out = applyFilter(unevenPage(), 'document');
    for (let i = 0; i < out.data.length; i += 4) {
      expect(out.data[i + 1]).toBe(out.data[i]);
      expect(out.data[i + 2]).toBe(out.data[i]);
      expect(out.data[i + 3]).toBe(255);
    }
  });

  describe('document keeps solid dark areas', () => {
    const PW = 1200;
    const PH = 1600;
    const page = (fn: (x: number, y: number) => number) =>
      make(PW, PH, (x, y) => { const v = fn(x, y); return [v, v, v]; });
    const inRect = (x: number, y: number) => x >= 400 && x < 800 && y >= 600 && y < 900;
    const interior = (out: RgbaImage, x0: number, x1: number, y0: number, y1: number) => {
      for (let y = y0; y < y1; y += 20) {
        for (let x = x0; x < x1; x += 20) expect(out.data[(y * PW + x) * 4], `${x},${y}`).toBeLessThanOrEqual(60);
      }
    };

    it('a 400x300 black rectangle on white stays black', () => {
      const out = applyFilter(page((x, y) => (inRect(x, y) ? 30 : 255)), 'document');
      interior(out, 420, 780, 620, 880);
      expect(out.data[(300 * PW + 100) * 4]).toBe(255);
    });

    it('a full-width black header band stays black', () => {
      const out = applyFilter(page((_x, y) => (y < 200 ? 30 : 255)), 'document');
      interior(out, 20, 1180, 20, 180);
    });

    it('a mid-grey photo card (luma 90) on white stays dark', () => {
      const out = applyFilter(page((x, y) => (inRect(x, y) ? 90 : 255)), 'document');
      for (let y = 620; y < 880; y += 20) {
        for (let x = 420; x < 780; x += 20) expect(out.data[(y * PW + x) * 4], `${x},${y}`).toBeLessThanOrEqual(100);
      }
    });
  });

  it('grayscale of a known colour gives the known luma', () => {
    const out = applyFilter(make(2, 2, () => [200, 100, 50]), 'grayscale');
    const luma = Math.round(0.299 * 200 + 0.587 * 100 + 0.114 * 50);
    expect([...out.data.slice(0, 4)]).toEqual([luma, luma, luma, 255]);
  });

  it('original is equal in value but not the same array', () => {
    const src = make(4, 3, (x, y) => [x * 10, y * 20, 7]);
    const out = applyFilter(src, 'original');
    expect(out).not.toBe(src);
    expect(out.data).not.toBe(src.data);
    expect([...out.data.slice(0, 3)]).toEqual([...src.data.slice(0, 3)]);
    expect(out.width).toBe(4);
    expect(out.height).toBe(3);
    for (let i = 3; i < out.data.length; i += 4) expect(out.data[i]).toBe(255);
  });

  it.each<ScanFilter>(['original', 'grayscale', 'document'])('%s never mutates its input', (filter) => {
    const src = unevenPage();
    const before = new Uint8ClampedArray(src.data);
    const out = applyFilter(src, filter);
    expect(out.data).not.toBe(src.data);
    expect(src.data).toEqual(before);
  });
});
