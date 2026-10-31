import { describe, expect, it } from 'vitest';
import { findTextRows, type RasterWindow } from './textRows.ts';

type Rect = [x: number, y: number, w: number, h: number];

/** White canvas with black rects. */
function paint(width: number, height: number, rects: Rect[]): RasterWindow {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const [x, y, w, h] of rects) {
    for (let j = y; j < y + h; j += 1) {
      for (let i = x; i < x + w; i += 1) data.fill(0, (j * width + i) * 4, (j * width + i) * 4 + 3);
    }
  }
  return { data, width, height };
}

/** Three words of the given height starting at y; x offsets are the word starts. */
function line(y: number, xs: number[], h = 14): Rect[] {
  return xs.map((x) => [x, y, 40, h] as Rect);
}

describe('findTextRows', () => {
  it('finds two lines of three words with two gaps each', () => {
    const win = paint(300, 120, [...line(20, [20, 90, 160]), ...line(60, [20, 90, 160])]);
    const rows = findTextRows(win);
    expect(rows).toHaveLength(2);
    expect(Math.abs(rows[0].top - 20)).toBeLessThanOrEqual(1);
    expect(Math.abs(rows[0].bottom - 34)).toBeLessThanOrEqual(1);
    expect(Math.abs(rows[1].top - 60)).toBeLessThanOrEqual(1);
    expect(rows[0].left).toBe(20);
    expect(rows[0].right).toBe(200);
    expect(rows[0].gaps).toEqual([[60, 90], [130, 160]]);
    expect(rows[1].gaps).toHaveLength(2);
  });

  it('merges a dot above a word into its row', () => {
    const win = paint(200, 80, [[20, 30, 40, 14], [35, 25, 3, 3]]);
    const rows = findTextRows(win);
    expect(rows).toHaveLength(1);
    expect(rows[0].top).toBeLessThanOrEqual(26);
    expect(rows[0].bottom).toBeGreaterThanOrEqual(43);
  });

  it('returns nothing for a blank window', () => {
    expect(findTextRows(paint(200, 80, []))).toEqual([]);
  });

  it('handles a right-aligned (Hebrew-like) line', () => {
    const win = paint(300, 60, line(20, [60, 130, 200]));
    const rows = findTextRows(win);
    expect(rows).toHaveLength(1);
    expect(rows[0].left).toBe(60);
    expect(rows[0].right).toBe(240);
    expect(rows[0].gaps).toHaveLength(2);
  });
});
