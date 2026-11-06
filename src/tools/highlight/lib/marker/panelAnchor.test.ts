import { describe, expect, it } from 'vitest';
import { clickAnchor, panelAnchor } from './panelAnchor.ts';

const bands = [
  { left: 0, top: 0, width: 100, height: 20 },
  { left: 0, top: 30, width: 100, height: 20 },
  { left: 0, top: 60, width: 100, height: 20 },
];

describe('panelAnchor', () => {
  it('a click on the third line gets the third band top', () => {
    expect(panelAnchor(bands, { x: 42, y: 70 })).toEqual({ x: 42, y: 60 });
  });
  it('a click between two bands gets the nearer one', () => {
    expect(panelAnchor(bands, { x: 10, y: 22 })).toEqual({ x: 10, y: 0 });
    expect(panelAnchor(bands, { x: 10, y: 28 })).toEqual({ x: 10, y: 30 });
  });
  it('no bands gives y 0', () => {
    expect(panelAnchor([], { x: 5, y: 50 })).toEqual({ x: 5, y: 0 });
  });
});

describe('clickAnchor', () => {
  const bands = [{ left: 0, top: 0, width: 100, height: 40 }, { left: 0, top: 60, width: 100, height: 40 }];

  it('reads the click against the mark on screen, at any zoom', () => {
    expect(clickAnchor({ left: 100, top: 200, width: 400, height: 50 }, bands, { clientX: 400, clientY: 240 })).toEqual({ x: 75, y: 60 });
  });

  it('a mark with no size on screen has no anchor, so the row opens at the mark', () => {
    expect(clickAnchor({ left: 0, top: 0, width: 0, height: 0 }, bands, { clientX: 5, clientY: 5 })).toBeNull();
  });
});
