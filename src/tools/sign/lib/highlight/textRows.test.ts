import { describe, expect, it } from 'vitest';
import { columnSpanAt, findTextRows, type RasterWindow } from './textRows.ts';

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
    const win = paint(200, 80, [[20, 30, 40, 14], [35, 25, 6, 3]]);
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

describe('findTextRows on a skewed, speckled scan', () => {
  it('keeps six lines apart when every gap carries speckle and the lines are skewed', () => {
    const width = 480;
    const height = 6 * 25 + 30;
    const win = paint(width, height, []);
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const ink = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      win.data.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
    };
    const tops: number[] = [];
    for (let k = 0; k < 6; k += 1) {
      const top = 10 + k * 25;
      tops.push(top);
      // words of 40px with 10px spaces; each column shifts down 1px per 120px of x
      for (let x = 0; x < width - 10; x += 50) {
        for (let i = x; i < Math.min(x + 40, width); i += 1) {
          const shift = Math.floor(i / 120);
          for (let j = 0; j < 18; j += 1) ink(i, top + shift + j);
        }
      }
      // speckle in the gap below this line, 2-4 pixels per row, over the gap rows
      for (let y = top + 18 + 3; y < top + 25 - 1; y += 1) {
        const n = 2 + Math.floor(rand() * 3);
        for (let q = 0; q < n; q += 1) ink(Math.floor(rand() * width), y);
      }
    }
    const rows = findTextRows(win);
    expect(rows).toHaveLength(6);
    rows.forEach((r, k) => {
      expect(r.bottom - r.top).toBeGreaterThanOrEqual(14);
      expect(r.bottom - r.top).toBeLessThanOrEqual(24);
      expect(Math.abs(r.top - tops[k])).toBeLessThanOrEqual(3);
    });
  });
});

describe('columnSpanAt', () => {
  // Two columns, gutter x 140-170. Left lines at y 20/60, right lines at y 30/70 (they overlap, so full-width rows merge): different baselines.
  const left: Rect[] = [...line(20, [10, 60, 100]), ...line(60, [10, 60, 100])];
  const right: Rect[] = [...line(30, [180, 230, 270]), ...line(70, [180, 230, 270])];
  const win = paint(320, 120, [...left, ...right]);

  it('returns the column around x, bounded by the gutter', () => {
    const l = columnSpanAt(win, 50);
    const r = columnSpanAt(win, 250);
    expect(l.left).toBe(0);
    expect(l.right).toBeGreaterThanOrEqual(140);
    expect(l.right).toBeLessThanOrEqual(170);
    expect(r.left).toBeGreaterThanOrEqual(140);
    expect(r.left).toBeLessThanOrEqual(180);
    expect(r.right).toBe(320);
  });

  it('picks the nearer column when x is inside the gutter', () => {
    expect(columnSpanAt(win, 145).right).toBeLessThanOrEqual(170);
    expect(columnSpanAt(win, 145).left).toBe(0);
    expect(columnSpanAt(win, 165).left).toBeGreaterThanOrEqual(140);
  });

  it('returns the whole window when there is no gutter', () => {
    const one = paint(300, 80, line(20, [20, 48, 76, 104, 132, 160, 188, 216]));
    expect(columnSpanAt(one, 100)).toEqual({ left: 0, right: 300 });
  });

  it('rows merge across columns at full width but are clean on a column crop', () => {
    const full = findTextRows(win);
    expect(full).toHaveLength(2);
    expect(full[0].bottom - full[0].top).toBeGreaterThan(20);
    const span = columnSpanAt(win, 50);
    const crop: RasterWindow = { width: span.right - span.left, height: win.height, data: new Uint8ClampedArray((span.right - span.left) * win.height * 4) };
    for (let y = 0; y < win.height; y += 1) {
      crop.data.set(win.data.subarray((y * win.width + span.left) * 4, (y * win.width + span.right) * 4), y * crop.width * 4);
    }
    const rows = findTextRows(crop);
    expect(rows).toHaveLength(2);
    expect(Math.abs(rows[0].top - 20)).toBeLessThanOrEqual(1);
    expect(Math.abs(rows[1].top - 60)).toBeLessThanOrEqual(1);
  });
});
