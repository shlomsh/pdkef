import { describe, expect, it } from 'vitest';
import { bandRects, passageCrop } from './passageCrop.ts';

const canvas = { left: 0, top: 100, width: 400, height: 600 };
const px1 = { width: 400, height: 600 };

describe('passageCrop', () => {
  it('pads a mid-page mark by 24 px above and below, full canvas width', () => {
    const c = passageCrop({ mark: { left: 40, top: 300, width: 200, height: 30 }, canvas, canvasPx: px1 });
    expect(c).toMatchObject({ sx: 0, sw: 400, width: 400, height: 78, offsetTop: 24 });
    expect(c.sy).toBe(176);
    expect(c.sh).toBe(78);
  });
  it('grows a small mark to at least 72 px', () => {
    const c = passageCrop({ mark: { left: 0, top: 300, width: 50, height: 10 }, canvas, canvasPx: px1 });
    expect(c.height).toBe(72);
    expect(c.offsetTop).toBeCloseTo(24 + (72 - 58) / 2, 5);
  });
  it('clamps at the top edge', () => {
    const c = passageCrop({ mark: { left: 0, top: 110, width: 50, height: 30 }, canvas, canvasPx: px1 });
    expect(c.sy).toBe(0);
    expect(c.offsetTop).toBe(10);
    expect(c.height).toBe(78);
  });
  it('clamps at the bottom edge', () => {
    const c = passageCrop({ mark: { left: 0, top: 670, width: 50, height: 25 }, canvas, canvasPx: px1 });
    expect(c.sy + c.sh).toBe(600);
    expect(c.height).toBe(73);
    expect(c.sy).toBe(600 - 73);
    expect(c.offsetTop).toBe(670 - 100 - c.sy);
  });
  it('shows the top of a very tall mark at 160 px', () => {
    const c = passageCrop({ mark: { left: 0, top: 300, width: 50, height: 400 }, canvas, canvasPx: px1 });
    expect(c.height).toBe(160);
    expect(c.sy).toBe(176);
    expect(c.offsetTop).toBe(24);
  });
  it('maps CSS px to backing pixels at 2x', () => {
    const c = passageCrop({ mark: { left: 0, top: 300, width: 50, height: 30 }, canvas, canvasPx: { width: 800, height: 1200 } });
    expect(c).toMatchObject({ sx: 0, sy: 352, sw: 800, sh: 156, width: 400, height: 78, offsetTop: 24 });
  });
});

describe('bandRects', () => {
  it('turns percent bands into CSS px inside the crop', () => {
    const mark = { left: 50, top: 300, width: 200, height: 40 };
    const rects = bandRects(mark, [{ left: 0, top: 0, width: 100, height: 50 }, { left: 10, top: 50, width: 50, height: 50 }], 24, 50);
    expect(rects).toEqual([
      { left: 50, top: 24, width: 200, height: 20 },
      { left: 70, top: 44, width: 100, height: 20 },
    ]);
  });
});
