import { describe, expect, it } from 'vitest';
import { previewShiftX, previewShiftY } from './previewShift.ts';

// A view 800 tall starting at y=0 with 16px of padding each side: the content box is 16..784.
const shift = (top: number, height: number) => previewShiftY(top, height, 0, 800, 16, 16);

describe('previewShiftY', () => {
  it('leaves a tall column alone while its edges still cover the content box', () => {
    expect(shift(-200, 1500)).toBe(0);
  });
  it('pulls a tall column back down when its top has moved past the content top', () => {
    expect(shift(100, 1500)).toBe(16 - 100);
  });
  it('pulls a tall column back up when its bottom has risen above the content bottom', () => {
    expect(shift(-900, 1500)).toBe(784 - 600);
  });
  it('centres a column shorter than the content box', () => {
    expect(shift(300, 400)).toBe(16 + (768 - 400) / 2 - 300);
  });
  it('measures from the view top', () => {
    expect(previewShiftY(150, 400, 100, 800, 16, 16)).toBe(100 + 16 + (768 - 400) / 2 - 150);
  });
});

// A view 400 wide starting at x=0 with 16px of padding each side: the content box is 16..384.
const shiftX = (left: number, width: number) => previewShiftX(left, width, 0, 400, 16, 16);

describe('previewShiftX', () => {
  it('leaves a wide column alone while its edges still cover the content box', () => {
    expect(shiftX(-100, 700)).toBe(0);
  });
  it('pulls a wide column back when its left edge has moved inside the content box (QA: 169px)', () => {
    expect(shiftX(185, 700)).toBe(16 - 185);
  });
  it('pulls a wide column back when its right edge has moved inside the content box', () => {
    expect(shiftX(-500, 700)).toBe(384 - 200);
  });
  it('centres a column narrower than the content box (QA: a pinch-in near the floor, 35px left of centre)', () => {
    const left = 16 + (368 - 200) / 2 - 35;
    expect(shiftX(left, 200)).toBe(35);
  });
  it('measures from the view left', () => {
    expect(previewShiftX(150, 200, 100, 400, 16, 16)).toBe(100 + 16 + (368 - 200) / 2 - 150);
  });
});
