import { describe, expect, it, vi } from 'vitest';
import { readScanUnit } from './scanUnits.ts';

// A synthetic 600 x 400 scan: words are 40 x 14 ink blocks, 10 apart, on rows y 100-114 and 140-154.
const W = 600;
const H = 400;
type Rect = [number, number, number, number];

function imageOf(rects: Rect[]) {
  return (sx: number, sy: number, w: number, h: number) => {
    const data = new Uint8ClampedArray(w * h * 4).fill(255);
    for (const [x, y, rw, rh] of rects) {
      for (let j = y; j < y + rh; j += 1) {
        for (let i = x; i < x + rw; i += 1) {
          const px = i - sx;
          const py = j - sy;
          if (px >= 0 && px < w && py >= 0 && py < h) data.fill(0, (py * w + px) * 4, (py * w + px) * 4 + 3);
        }
      }
    }
    return { data, width: w, height: h };
  };
}

const oneColumn: Rect[] = [];
for (const y of [100, 140]) for (const x of [20, 70, 120]) oneColumn.push([x, y, 40, 14]);

const twoColumns: Rect[] = [];
for (const y of [100, 140]) for (const x of [20, 70, 330, 380]) twoColumns.push([x, y, 40, 14]);

const canvasOf = (getImageData: unknown) =>
  ({ width: W, height: H, getContext: () => ({ getImageData }) }) as unknown as HTMLCanvasElement;
const at = (x: number, y: number) => ({ x: (x / W) * 100, y: (y / H) * 100 });
const PAGE_PTS = 400;

describe('readScanUnit', () => {
  it('a word is the ink between the gaps either side of the point, padded like a swipe band, in page percent', () => {
    const band = readScanUnit(canvasOf(imageOf(oneColumn)), at(90, 107), 'word', PAGE_PTS)!;
    expect(band.left).toBeCloseTo((70 / W) * 100, 0);
    expect(band.width).toBeCloseTo((40 / W) * 100, 0);
    expect(band.top).toBeLessThanOrEqual((100 / H) * 100);
    expect(band.top + band.height).toBeGreaterThanOrEqual((114 / H) * 100);
    expect(band.height).toBeLessThan(((140 - 100) / H) * 100);
  });

  it('a line is the whole row', () => {
    const band = readScanUnit(canvasOf(imageOf(oneColumn)), at(90, 107), 'line', PAGE_PTS)!;
    expect(band.left).toBeCloseTo((20 / W) * 100, 0);
    expect(band.left + band.width).toBeCloseTo((160 / W) * 100, 0);
  });

  it('finds the row it is on, not its neighbours', () => {
    const band = readScanUnit(canvasOf(imageOf(oneColumn)), at(90, 147), 'word', PAGE_PTS)!;
    expect(band.top).toBeGreaterThan((130 / H) * 100);
  });

  it('keeps a line inside the column the click is in', () => {
    const band = readScanUnit(canvasOf(imageOf(twoColumns)), at(100, 107), 'line', PAGE_PTS)!;
    expect(band.left).toBeCloseTo((20 / W) * 100, 0);
    expect(band.left + band.width).toBeCloseTo((110 / W) * 100, 0);
    const right = readScanUnit(canvasOf(imageOf(twoColumns)), at(400, 107), 'line', PAGE_PTS)!;
    expect(right.left).toBeCloseTo((330 / W) * 100, 0);
  });

  it('is null in the space between words, between rows and on blank page', () => {
    const canvas = canvasOf(imageOf(oneColumn));
    expect(readScanUnit(canvas, at(65, 107), 'word', PAGE_PTS)).toBeNull();
    expect(readScanUnit(canvas, at(90, 127), 'word', PAGE_PTS)).toBeNull();
    expect(readScanUnit(canvasOf(imageOf([])), at(90, 107), 'word', PAGE_PTS)).toBeNull();
  });

  it('reads the canvas once per click', () => {
    const getImageData = vi.fn(imageOf(oneColumn));
    readScanUnit(canvasOf(getImageData), at(90, 107), 'line', PAGE_PTS);
    expect(getImageData).toHaveBeenCalledTimes(1);
  });

  it('is null without a canvas, without a 2d context, and when the pixels cannot be read', () => {
    expect(readScanUnit(null, at(90, 107), 'word', PAGE_PTS)).toBeNull();
    const noContext = { width: W, height: H, getContext: () => null } as unknown as HTMLCanvasElement;
    expect(readScanUnit(noContext, at(90, 107), 'word', PAGE_PTS)).toBeNull();
    expect(readScanUnit(canvasOf(() => { throw new Error('tainted'); }), at(90, 107), 'word', PAGE_PTS)).toBeNull();
  });
});
