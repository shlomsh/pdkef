// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { readScanUnit } from './scanUnits.ts';

// A synthetic 600 x 400 scan: words are 40 x 14 ink blocks, 10 apart, on rows y 100-114 and 140-154.
const W = 600;
const H = 400;
type Rect = [number, number, number, number];

// A real jsdom canvas, painted white with black ink blocks, read back by the real getImageData.
function scanOf(rects: Rect[]) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000000';
  for (const [x, y, rw, rh] of rects) ctx.fillRect(x, y, rw, rh);
  return canvas;
}

const oneColumn: Rect[] = [];
for (const y of [100, 140]) for (const x of [20, 70, 120]) oneColumn.push([x, y, 40, 14]);

const twoColumns: Rect[] = [];
for (const y of [100, 140]) for (const x of [20, 70, 330, 380]) twoColumns.push([x, y, 40, 14]);

const at = (x: number, y: number) => ({ x: (x / W) * 100, y: (y / H) * 100 });
const PAGE_PTS = 400;

describe('readScanUnit', () => {
  it('a word is the ink between the gaps either side of the point, padded like a swipe band, in page percent', () => {
    const band = readScanUnit(scanOf(oneColumn), at(90, 107), 'word', PAGE_PTS)!;
    expect(band.left).toBeCloseTo((70 / W) * 100, 0);
    expect(band.width).toBeCloseTo((40 / W) * 100, 0);
    expect(band.top).toBeLessThanOrEqual((100 / H) * 100);
    expect(band.top + band.height).toBeGreaterThanOrEqual((114 / H) * 100);
    expect(band.height).toBeLessThan(((140 - 100) / H) * 100);
  });

  it('a line is the whole row', () => {
    const band = readScanUnit(scanOf(oneColumn), at(90, 107), 'line', PAGE_PTS)!;
    expect(band.left).toBeCloseTo((20 / W) * 100, 0);
    expect(band.left + band.width).toBeCloseTo((160 / W) * 100, 0);
  });

  it('finds the row it is on, not its neighbours', () => {
    const band = readScanUnit(scanOf(oneColumn), at(90, 147), 'word', PAGE_PTS)!;
    expect(band.top).toBeGreaterThan((130 / H) * 100);
  });

  it('keeps a line inside the column the click is in', () => {
    const band = readScanUnit(scanOf(twoColumns), at(100, 107), 'line', PAGE_PTS)!;
    expect(band.left).toBeCloseTo((20 / W) * 100, 0);
    expect(band.left + band.width).toBeCloseTo((110 / W) * 100, 0);
    const right = readScanUnit(scanOf(twoColumns), at(400, 107), 'line', PAGE_PTS)!;
    expect(right.left).toBeCloseTo((330 / W) * 100, 0);
  });

  it('is null in the space between words, between rows and on blank page', () => {
    const canvas = scanOf(oneColumn);
    expect(readScanUnit(canvas, at(65, 107), 'word', PAGE_PTS)).toBeNull();
    expect(readScanUnit(canvas, at(90, 127), 'word', PAGE_PTS)).toBeNull();
    expect(readScanUnit(scanOf([]), at(90, 107), 'word', PAGE_PTS)).toBeNull();
  });

  it('reads the canvas once per click', () => {
    const canvas = scanOf(oneColumn);
    const getImageData = vi.spyOn(canvas.getContext('2d')!, 'getImageData');
    readScanUnit(canvas, at(90, 107), 'line', PAGE_PTS);
    expect(getImageData).toHaveBeenCalledTimes(1);
  });

  it('is null without a canvas, without a 2d context, and when the pixels cannot be read', () => {
    expect(readScanUnit(null, at(90, 107), 'word', PAGE_PTS)).toBeNull();
    // Forced: jsdom's real canvas always has a 2d context, so a canvas without one is a plain object.
    const noContext = { width: W, height: H, getContext: () => null } as unknown as HTMLCanvasElement;
    expect(readScanUnit(noContext, at(90, 107), 'word', PAGE_PTS)).toBeNull();
    // Forced: a tainted canvas (cross-origin pixels) cannot be made in jsdom.
    const tainted = { width: W, height: H, getContext: () => ({ getImageData: () => { throw new Error('tainted'); } }) } as unknown as HTMLCanvasElement;
    expect(readScanUnit(tainted, at(90, 107), 'word', PAGE_PTS)).toBeNull();
  });
});
