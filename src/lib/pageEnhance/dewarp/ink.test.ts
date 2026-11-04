import { describe, expect, it } from 'vitest';
import { inkMask, ruleMask } from './ink.ts';

const W = 400;
const H = 400;

/** Paper shaded from 240 on the left to 150 on the right, with `dark` rectangles [x0, y0, x1, y1] at 40. */
function page(...dark: [number, number, number, number][]) {
  const data = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) data[y * W + x] = 240 - (90 * x) / W;
  for (const [x0, y0, x1, y1] of dark) for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) data[y * W + x] = 40;
  return { width: W, height: H, data };
}

const count = (mask: Uint8Array, x0: number, y0: number, x1: number, y1: number) => {
  let n = 0;
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) n += mask[y * W + x];
  return n;
};

describe('inkMask', () => {
  it('finds print, not the shade across the paper', () => {
    const ink = inkMask(page([50, 50, 60, 60], [330, 300, 340, 310]));
    expect(count(ink, 50, 50, 60, 60)).toBe(100);
    expect(count(ink, 330, 300, 340, 310)).toBe(100);
    let total = 0;
    for (const v of ink) total += v;
    expect(total).toBe(200);
  });
});

describe('ruleMask', () => {
  it('keeps a long thin vertical rule and drops a letter stroke and a crossing rule', () => {
    const gray = page(
      [100, 40, 102, 360], // a rule down most of the page
      [200, 100, 203, 106], // a letter's short stroke
      [40, 200, 360, 202], // a horizontal rule crossing the vertical one
    );
    const rule = ruleMask(inkMask(gray), W, H);
    expect(count(rule, 100, 40, 102, 198)).toBe(2 * 158);
    expect(count(rule, 200, 100, 203, 106)).toBe(0);
    expect(count(rule, 110, 200, 360, 202)).toBe(0);
  });
});
