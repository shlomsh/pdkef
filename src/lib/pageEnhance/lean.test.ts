import { describe, expect, it } from 'vitest';
import { FLAT_PAGE } from './dewarp/index.ts';
import { levelQuad, pageLean } from './lean.ts';
import { applyPiece, type Piece } from './piece.ts';
import { gray, leaning } from './leaning.test-helper.ts';
import type { Quad, RgbaImage } from './quad.ts';

const FULL: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

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

  it('does not throw when a turned corner leaves the source, and paints white there', () => {
    const src = leaning(300, 200, 0);
    const out = level(src, 6);
    expect(out.data.slice(0, 4)).toEqual(new Uint8ClampedArray([255, 255, 255, 255]));
  });
});
