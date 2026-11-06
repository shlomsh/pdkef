import { describe, expect, it } from 'vitest';
import { clickAnchor, focusAnchor, panelAnchor, rowSide } from './panelAnchor.ts';

const bands = [
  { left: 0, top: 0, width: 100, height: 20 },
  { left: 0, top: 30, width: 100, height: 20 },
  { left: 0, top: 60, width: 100, height: 20 },
];

describe('panelAnchor', () => {
  it('a click on the third line gets the third band top', () => {
    expect(panelAnchor(bands, { x: 42, y: 70 })).toEqual({ x: 42, y: 60, bottom: 80, pull: -50 });
  });
  it('a click between two bands gets the nearer one', () => {
    expect(panelAnchor(bands, { x: 10, y: 22 })).toEqual({ x: 10, y: 0, bottom: 20, pull: -50 });
    expect(panelAnchor(bands, { x: 10, y: 28 })).toEqual({ x: 10, y: 30, bottom: 50, pull: -50 });
  });
  it('no bands gives the whole mark', () => {
    expect(panelAnchor([], { x: 5, y: 50 })).toEqual({ x: 5, y: 0, bottom: 100, pull: -50 });
  });
});

describe('clickAnchor', () => {
  const bands = [{ left: 0, top: 0, width: 100, height: 40 }, { left: 0, top: 60, width: 100, height: 40 }];

  it('reads the click against the mark on screen, at any zoom', () => {
    expect(clickAnchor({ left: 100, top: 200, width: 400, height: 50 }, bands, { clientX: 400, clientY: 240 })).toEqual({ x: 75, y: 60, bottom: 100, pull: -50 });
  });

  it('a mark with no size on screen has no anchor, so the row opens at the mark', () => {
    expect(clickAnchor({ left: 0, top: 0, width: 0, height: 0 }, bands, { clientX: 5, clientY: 5 })).toBeNull();
  });
});

describe('focusAnchor', () => {
  it('stands on the whole mark, lined up with its start edge', () => {
    expect(focusAnchor(false)).toEqual({ x: 0, y: 0, bottom: 100, pull: 0 });
  });
  it('a right-to-left mark starts at its right edge', () => {
    expect(focusAnchor(true)).toEqual({ x: 100, y: 0, bottom: 100, pull: -100 });
  });
});

describe('rowSide', () => {
  it('the row sits above a line with room for it and its menu', () => {
    expect(rowSide(500, 46, 114)).toBe('top');
  });
  it('a line right under the stuck bar sends the row below it', () => {
    expect(rowSide(126, 46, 114)).toBe('bottom');
  });
  it('a line with room for the row but not for its tallest menu sends the row below it too', () => {
    expect(rowSide(200, 46, 114)).toBe('bottom');
  });
  it('a tall bar with the line well under it still leaves the row above', () => {
    expect(rowSide(320, 46, 248)).toBe('top');
  });
});
