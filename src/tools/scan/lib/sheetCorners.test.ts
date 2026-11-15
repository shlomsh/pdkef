import { describe, expect, it } from 'vitest';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import { addNoise, fillQuad, norm, solid } from './edges/testImages.ts';
import { isFullQuad, onThePaper } from './sheetCorners.ts';

const quad = (l: number, t: number, r: number, b: number): Quad => [{ x: l, y: t }, { x: r, y: t }, { x: r, y: b }, { x: l, y: b }];

const W = 600;
const H = 800;
const PAGE_PX: Quad = [{ x: 110, y: 120 }, { x: 500, y: 100 }, { x: 520, y: 700 }, { x: 130, y: 690 }];
const TRUE = PAGE_PX.map((p) => norm(p, W, H)) as Quad;
// Each corner pulled 4 to 6% of the picture inward, as a plan that reaches out from the text only part way would.
const PLANNED = [{ x: 0.05, y: 0.04 }, { x: -0.04, y: 0.05 }, { x: -0.06, y: -0.04 }, { x: 0.04, y: -0.05 }]
  .map((d, i) => ({ x: TRUE[i].x + d.x, y: TRUE[i].y + d.y })) as Quad;

describe('onThePaper', () => {
  it('pulls corners planned 4 to 6% inside a light page on a darker table back onto its corners', () => {
    const image = solid(W, H, 120);
    fillQuad(image, PAGE_PX, 200);
    addNoise(image, 3, 5);
    const out = onThePaper(PLANNED, image);
    out.forEach((p, i) => {
      expect(Math.abs(p.x - TRUE[i].x)).toBeLessThan(0.012);
      expect(Math.abs(p.y - TRUE[i].y)).toBeLessThan(0.012);
    });
  });
});

describe('isFullQuad', () => {
  it('is true only for the whole picture, to the corner', () => {
    expect(isFullQuad(quad(0, 0, 1, 1))).toBe(true);
    expect(isFullQuad(quad(0, 0, 1, 0.999))).toBe(false);
  });
});
