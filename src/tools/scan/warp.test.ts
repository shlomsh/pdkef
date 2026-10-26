import { describe, expect, it } from 'vitest';
import type { Point, Quad, RgbaImage } from './quad';
import { applyHomography, homography, warpPerspective, warpSize } from './warp';

const quad = (...c: number[]): Quad => [
  { x: c[0], y: c[1] }, { x: c[2], y: c[3] }, { x: c[4], y: c[5] }, { x: c[6], y: c[7] },
];

const image = (width: number, height: number, pixel: (x: number, y: number) => [number, number, number]): RgbaImage => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, y);
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
};

const rect = (w: number, h: number): Quad => quad(0, 0, w, 0, w, h, 0, h);

describe('homography', () => {
  it('maps each corner of an arbitrary skewed quad exactly', () => {
    const from = rect(100, 60);
    const to = quad(12, 7, 140, 22, 118, 95, -4, 70);
    const h = homography(from, to);
    from.forEach((p, i) => {
      const q = applyHomography(h, p);
      expect(q.x).toBeCloseTo(to[i].x, 9);
      expect(q.y).toBeCloseTo(to[i].y, 9);
    });
  });

  it('throws when the quad is degenerate', () => {
    expect(() => homography(rect(10, 10), quad(0, 0, 5, 5, 10, 10, 20, 20))).toThrow();
    expect(() => homography(rect(10, 10), quad(3, 3, 3, 3, 3, 3, 3, 3))).toThrow();
  });
});

describe('warpSize', () => {
  it('takes the longer of each pair of opposite edges', () => {
    const trapezoid = quad(10, 0, 90, 0, 100, 150, 0, 140);
    expect(warpSize(trapezoid, 2400)).toEqual({ width: 100, height: 150 });
  });

  it('scales both sides down proportionally past the cap', () => {
    expect(warpSize(rect(4800, 2400), 2400)).toEqual({ width: 2400, height: 1200 });
    expect(warpSize(rect(1000, 3000), 1500)).toEqual({ width: 500, height: 1500 });
  });

  it('is never below one pixel', () => {
    expect(warpSize(rect(0.1, 0.2), 2400)).toEqual({ width: 1, height: 1 });
  });
});

describe('warpPerspective', () => {
  const gradient = image(7, 5, (x, y) => [x * 30, y * 50, (x + y) * 10]);

  it('returns the same pixels for the full-image quad', () => {
    const out = warpPerspective(gradient, rect(7, 5), 7, 5);
    expect(out.width).toBe(7);
    expect(out.height).toBe(5);
    expect(Array.from(out.data)).toEqual(Array.from(gradient.data));
  });

  it('flattens a skewed checkerboard back to the checkerboard', () => {
    const cell = 20;
    const size = 160;
    const board = (x: number, y: number) => (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
    const skew = quad(60, 40, 400, 90, 360, 330, 20, 280);
    const toPhoto = homography(rect(size, size), skew);
    const photo = image(440, 360, (px, py) => {
      // Inverse map: photo pixel centre -> board coordinates.
      const inv = homography(skew, rect(size, size));
      const b: Point = applyHomography(inv, { x: px + 0.5, y: py + 0.5 });
      if (b.x < 0 || b.y < 0 || b.x >= size || b.y >= size) return [128, 128, 128];
      return board(b.x, b.y) ? [255, 255, 255] : [0, 0, 0];
    });
    expect(toPhoto).toHaveLength(9);
    const out = warpPerspective(photo, skew, size, size);
    let checked = 0;
    let matching = 0;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = (x + 0.5) % cell;
        const dy = (y + 0.5) % cell;
        if (dx < 4 || dx > cell - 4 || dy < 4 || dy > cell - 4) continue;
        checked += 1;
        const v = out.data[(y * size + x) * 4];
        if ((board(x, y) && v > 200) || (!board(x, y) && v < 55)) matching += 1;
      }
    }
    expect(matching / checked).toBeGreaterThan(0.98);
  });

  it('paints samples outside the photo white with full alpha', () => {
    const dark = image(10, 10, () => [10, 20, 30]);
    const out = warpPerspective(dark, quad(-20, -20, 30, -20, 30, 30, -20, 30), 50, 50);
    const at = (x: number, y: number) => Array.from(out.data.slice((y * 50 + x) * 4, (y * 50 + x) * 4 + 4));
    expect(at(0, 0)).toEqual([255, 255, 255, 255]);
    expect(at(49, 0)).toEqual([255, 255, 255, 255]);
    expect(at(49, 49)).toEqual([255, 255, 255, 255]);
    expect(at(25, 25)).toEqual([10, 20, 30, 255]);
  });
});
