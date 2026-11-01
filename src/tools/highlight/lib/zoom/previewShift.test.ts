import { describe, expect, it } from 'vitest';
import { previewShiftY } from './previewShift.ts';

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
