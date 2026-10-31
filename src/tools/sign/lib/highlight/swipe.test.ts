import { describe, expect, it } from 'vitest';
import { bandsToPagePercent, canvasWindowRect, highlightGeometry } from './swipe.ts';

const canvas = { width: 1000, height: 2000 };

describe('canvasWindowRect', () => {
  it('spans the canvas width and pads the vertical range by the margin', () => {
    expect(canvasWindowRect(canvas, 500, 300, 40)).toEqual({ x: 0, y: 260, width: 1000, height: 280 });
  });
  it('clamps to the canvas', () => {
    expect(canvasWindowRect(canvas, 10, 1990, 40)).toEqual({ x: 0, y: 0, width: 1000, height: 2000 });
  });
});

describe('bandsToPagePercent', () => {
  it('offsets by the window top and divides by the canvas size', () => {
    const [b] = bandsToPagePercent([{ left: 100, top: 20, width: 500, height: 30 }], 980, canvas);
    expect(b).toEqual({ left: 10, top: 50, width: 50, height: 1.5 });
  });
});

describe('highlightGeometry', () => {
  it('returns null for no bands', () => {
    expect(highlightGeometry([])).toBeNull();
  });
  it('boxes the union and re-expresses each band in percent of the box', () => {
    const g = highlightGeometry([
      { left: 10, top: 20, width: 40, height: 2 },
      { left: 20, top: 24, width: 50, height: 2 },
    ])!;
    expect(g).toMatchObject({ left: 10, top: 20, width: 60, height: 6 });
    expect(g.bands[0]).toEqual({ left: 0, top: 0, width: (40 / 60) * 100, height: (2 / 6) * 100 });
    expect(g.bands[1].left).toBeCloseTo((10 / 60) * 100);
    expect(g.bands[1].top).toBeCloseTo((4 / 6) * 100);
  });
});
