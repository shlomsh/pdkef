import { describe, expect, it } from 'vitest';
import { FLAT_PAGE } from './dewarp/index.ts';
import { levelQuad, pageLean } from './lean.ts';
import { applyPiece, type Piece } from './piece.ts';
import type { GrayImage, Quad, RgbaImage } from './quad.ts';

const FULL: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

/** Text-like rows (short dashes, gaps between words) leaning by `degrees`, y down, as RGBA. */
function leaning(width: number, height: number, degrees: number, left = 0, right = width): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const t = Math.tan((degrees * Math.PI) / 180);
  for (let y = 0; y < height; y += 1) {
    for (let x = left; x < right; x += 1) {
      const level = y - (x - width / 2) * t;
      const row = ((level % 24) + 24) % 24;
      const word = (((x - left) % 40) + 40) % 40;
      if (row >= 8 && row < 15 && word < 31) {
        const i = (y * width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 20;
      }
    }
  }
  return { width, height, data };
}

const gray = ({ width, height, data }: RgbaImage): GrayImage => {
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0; i < out.length; i += 1) out[i] = data[i * 4];
  return { width, height, data: out };
};

const level = (src: RgbaImage, degrees: number, quad: Quad = FULL, width = src.width, height = src.height): RgbaImage => {
  const piece: Piece = { quad: levelQuad(quad, degrees, src.width, src.height), inset: 0, width, height, bend: FLAT_PAGE, mesh: null };
  return applyPiece(src, piece);
};

describe('pageLean', () => {
  it.each([-4.7, -2.4, 0.3, 3])('reads a lean of %f degrees', (degrees) => {
    expect(Math.abs(pageLean(gray(leaning(800, 1100, degrees))) - degrees)).toBeLessThan(0.2);
  });

  it('is 0 for a blank page', () => {
    const blank = { width: 200, height: 300, data: new Uint8ClampedArray(200 * 300).fill(240) };
    expect(pageLean(blank)).toBe(0);
  });
});

describe('levelQuad', () => {
  it('levels a wide page and a tall page through the real resample', () => {
    for (const [w, h] of [[640, 300], [300, 640]]) {
      for (const degrees of [-5.5, 4.2]) {
        const out = level(leaning(w, h, degrees), degrees);
        expect(Math.abs(pageLean(gray(out)))).toBeLessThan(0.2);
      }
    }
  });

  it('levels two halves of one sheet by their own angles', () => {
    const w = 800;
    const h = 500;
    const left = leaning(w, h, -3.5, 0, 400);
    const right = leaning(w, h, 2.5, 400, w);
    const half = (src: RgbaImage, x0: number, x1: number, degrees: number) =>
      level(src, degrees, [{ x: x0, y: 0 }, { x: x1, y: 0 }, { x: x1, y: 1 }, { x: x0, y: 1 }], 400, h);
    expect(Math.abs(pageLean(gray(half(left, 0, 0.5, -3.5))))).toBeLessThan(0.2);
    expect(Math.abs(pageLean(gray(half(right, 0.5, 1, 2.5))))).toBeLessThan(0.2);
  });

  it('does not throw when a turned corner leaves the source, and paints white there', () => {
    const src = leaning(300, 200, 0);
    const out = level(src, 6);
    expect(out.data.slice(0, 4)).toEqual(new Uint8ClampedArray([255, 255, 255, 255]));
  });
});
