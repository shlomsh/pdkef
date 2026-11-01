import { describe, expect, it, vi } from 'vitest';
import type { HighlightElement } from '../model/editorModel.ts';
import { flipChanges } from './flip.ts';

// Box at (10, 20), 40 x 10 page percent; two bands of half the box height each.
const twoRows = (direction?: 'ltr' | 'rtl'): HighlightElement => ({
  id: 'h', type: 'highlight', pageIndex: 0, color: '#ff0', left: 10, top: 20, width: 40, height: 10,
  bands: [
    { left: 50, top: 0, width: 50, height: 50 },
    { left: 0, top: 50, width: 50, height: 50 },
  ],
  ...(direction ? { direction } : {}),
});

describe('flipChanges recovers the swipe from the bands', () => {
  const ends = (el: HighlightElement) => {
    const bandsBetween = vi.fn(() => []);
    flipChanges(el, bandsBetween);
    return bandsBetween.mock.calls[0];
  };
  it('RTL: from the first row right edge to the last row left edge', () => {
    expect(ends(twoRows('rtl'))).toEqual([{ x: 50, y: 22.5 }, { x: 10, y: 27.5 }]);
  });
  it('LTR: from the first row left edge to the last row right edge', () => {
    expect(ends(twoRows())).toEqual([{ x: 30, y: 22.5 }, { x: 30, y: 27.5 }]);
  });
});

describe('flipChanges', () => {
  it('re-reads the bands in the other direction and returns the new geometry', () => {
    const el = twoRows('rtl');
    const bandsBetween = vi.fn(() => [
      { left: 10, top: 20, width: 40, height: 5 },
      { left: 10, top: 25, width: 20, height: 5 },
    ]);
    const out = flipChanges(el, bandsBetween);
    expect(bandsBetween).toHaveBeenCalledWith({ x: 50, y: 22.5 }, { x: 10, y: 27.5 });
    expect(out).toMatchObject({ left: 10, top: 20, width: 40, height: 10, direction: 'ltr' });
    expect('bands' in out && out.bands).toHaveLength(2);
  });
  it('flips ltr to rtl', () => {
    expect(flipChanges(twoRows(), () => [])).toEqual({ direction: 'rtl' });
  });
  it('changes only the direction for a single band', () => {
    const el = { ...twoRows('rtl'), bands: [{ left: 0, top: 0, width: 100, height: 100 }] };
    const bandsBetween = vi.fn();
    expect(flipChanges(el, bandsBetween)).toEqual({ direction: 'ltr' });
    expect(bandsBetween).not.toHaveBeenCalled();
  });
  it('changes only the direction when no reader is available or it returns nothing', () => {
    expect(flipChanges(twoRows('rtl'))).toEqual({ direction: 'ltr' });
    expect(flipChanges(twoRows('rtl'), () => [])).toEqual({ direction: 'ltr' });
  });
});
