import { describe, expect, it } from 'vitest';
import { turnedPageBox } from './turnedBox.ts';

const size = { width: 600, height: 800 };
const ink = { left: 0.1, right: 0.8 };

describe('turnedPageBox', () => {
  it('keeps an unturned page and its ink', () => {
    expect(turnedPageBox(size, 0, ink)).toEqual({ width: 600, height: 800, textLeft: 60, textRight: 480 });
  });
  it('swaps width and height on a quarter turn and counts the whole width as text', () => {
    expect(turnedPageBox(size, 1, ink)).toEqual({ width: 800, height: 600, textLeft: 0, textRight: 800 });
    expect(turnedPageBox(size, 3, null)).toEqual({ width: 800, height: 600, textLeft: 0, textRight: 800 });
  });
  it('mirrors the ink on a half turn', () => {
    const box = turnedPageBox(size, 2, ink);
    expect(box.textLeft).toBeCloseTo(120);
    expect(box.textRight).toBeCloseTo(540);
  });
});
