import { describe, it, expect, vi } from 'vitest';
import type { ColorMode } from '../../editor/model/editorModel.ts';
import { autoColorChanges, boxPixelRect, followsPage, medianColor, ringStrips } from './pageColor.ts';

const px = (r: number, g: number, b: number, a = 255, n = 1) => Array.from({ length: n }, () => [r, g, b, a]).flat();

describe('medianColor', () => {
  it('ignores a minority of dark text pixels', () => {
    const run = new Uint8ClampedArray([...px(250, 240, 230, 255, 70), ...px(0, 0, 0, 255, 30)]);
    expect(medianColor([run])).toBe('#faf0e6');
  });
  it('takes the lower median on an even count', () => {
    expect(medianColor([[...px(10, 10, 10), ...px(20, 20, 20)]])).toBe('#0a0a0a');
  });
  it('skips alpha 0 pixels', () => {
    expect(medianColor([[...px(0, 0, 0, 0, 5), ...px(9, 8, 7)]])).toBe('#090807');
  });
  it('gives null when every pixel is unpainted or there are none', () => {
    expect(medianColor([px(1, 2, 3, 0, 4)])).toBeNull();
    expect(medianColor([])).toBeNull();
  });
  it('composites half-transparent black over white', () => {
    expect(medianColor([px(0, 0, 0, 128)])).toBe('#7f7f7f');
  });
  it('treats channels independently', () => {
    const run = [...px(10, 200, 50), ...px(10, 100, 60), ...px(250, 150, 70)];
    expect(medianColor([run])).toBe('#0a963c');
  });
  it('combines several runs', () => {
    expect(medianColor([px(10, 10, 10), px(20, 20, 20), px(30, 30, 30)])).toBe('#141414');
  });
});

describe('ringStrips', () => {
  const area = (s: { width: number; height: number }[]) => s.reduce((n, r) => n + r.width * r.height, 0);
  it('gives four exact strips around an interior rect', () => {
    const strips = ringStrips({ x: 20, y: 30, width: 40, height: 10 }, 3, 200, 100);
    expect(strips).toEqual([
      { x: 17, y: 27, width: 46, height: 3 },
      { x: 17, y: 40, width: 46, height: 3 },
      { x: 17, y: 30, width: 3, height: 10 },
      { x: 60, y: 30, width: 3, height: 10 },
    ]);
    expect(area(strips)).toBe(46 * 16 - 400);
  });
  it('clips a rect at the top-left edge', () => {
    expect(ringStrips({ x: 0, y: 0, width: 10, height: 10 }, 2, 100, 100)).toEqual([
      { x: 0, y: 10, width: 12, height: 2 },
      { x: 10, y: 0, width: 2, height: 10 },
    ]);
  });
  it('gives nothing for a rect covering the canvas or a zero thickness', () => {
    expect(ringStrips({ x: 0, y: 0, width: 50, height: 50 }, 4, 50, 50)).toEqual([]);
    expect(ringStrips({ x: 5, y: 5, width: 10, height: 10 }, 0, 50, 50)).toEqual([]);
  });
});

describe('boxPixelRect', () => {
  it('floors the start and ceils the end', () => {
    expect(boxPixelRect({ left: 10.5, top: 20.5, width: 10, height: 10 }, 100, 100)).toEqual({ x: 10, y: 20, width: 11, height: 11 });
  });
  it('clamps to the canvas and never goes negative', () => {
    expect(boxPixelRect({ left: -5, top: 90, width: 200, height: 50 }, 100, 50)).toEqual({ x: 0, y: 45, width: 100, height: 5 });
    expect(boxPixelRect({ left: 120, top: 0, width: 5, height: 5 }, 100, 100).width).toBe(0);
  });
});

describe('followsPage', () => {
  it('is true only for auto whiteouts and strokes', () => {
    expect(followsPage({ type: 'whiteout', colorMode: 'auto' })).toBe(true);
    expect(followsPage({ type: 'whiteoutStroke', colorMode: 'auto' })).toBe(true);
    expect(followsPage({ type: 'whiteout', colorMode: 'custom' })).toBe(false);
    expect(followsPage({ type: 'whiteout' })).toBe(false);
    expect(followsPage({ type: 'blackout', colorMode: 'auto' })).toBe(false);
  });
});

describe('autoColorChanges', () => {
  const base = { type: 'whiteout', pageIndex: 2, left: 10, top: 10, width: 20, height: 5, color: '#ffffff', colorMode: 'auto' as ColorMode };
  it('re-samples at the new geometry on move and resize', () => {
    const sample = vi.fn(() => '#eeeeee');
    expect(autoColorChanges(base, { left: 30 }, sample)).toEqual({ color: '#eeeeee' });
    expect(sample).toHaveBeenLastCalledWith(2, { left: 30, top: 10, width: 20, height: 5 });
    expect(autoColorChanges(base, { width: 40, height: 9 }, sample)).toEqual({ color: '#eeeeee' });
    expect(sample).toHaveBeenLastCalledWith(2, { left: 10, top: 10, width: 40, height: 9 });
  });
  it('leaves custom boxes and unrelated edits alone without sampling', () => {
    const sample = vi.fn(() => '#eeeeee');
    expect(autoColorChanges({ ...base, colorMode: 'custom' as const }, { left: 1 }, sample)).toEqual({});
    expect(autoColorChanges({ ...base, repeatGroupId: 'g' }, { repeatGroupId: 'h' } as never, sample)).toEqual({});
    expect(autoColorChanges({ ...base, type: 'blackout' }, { left: 1 }, sample)).toEqual({});
    expect(sample).not.toHaveBeenCalled();
  });
  it('ignores geometry keys whose value did not change', () => {
    const sample = vi.fn(() => '#eeeeee');
    expect(autoColorChanges(base, { left: 10, top: 10 }, sample)).toEqual({});
    expect(sample).not.toHaveBeenCalled();
    expect(autoColorChanges(base, { left: 10, top: 11 }, sample)).toEqual({ color: '#eeeeee' });
    expect(sample).toHaveBeenCalledTimes(1);
  });
  it('samples when a custom box switches to auto', () => {
    const sample = vi.fn(() => '#abcdef');
    expect(autoColorChanges({ ...base, colorMode: 'custom' as ColorMode }, { colorMode: 'auto' }, sample)).toEqual({ color: '#abcdef' });
  });
  it('adds nothing for a null sample or an unchanged colour', () => {
    expect(autoColorChanges(base, { top: 1 }, () => null)).toEqual({});
    expect(autoColorChanges(base, { top: 1 }, () => '#ffffff')).toEqual({});
  });
});
