import { describe, expect, it } from 'vitest';
import { comparePreviewWidth } from './compareSize.js';

describe('comparePreviewWidth', () => {
  it('asks for the on-screen pixels of a phone, floored at 900', () => {
    // 390 css px at dpr 3 is 1170 device px.
    expect(comparePreviewWidth(390, 3, 768)).toBe(1170);
  });

  it('caps an inline desktop slider at the css max, times dpr', () => {
    // min(1440, 768) * 2 = 1536
    expect(comparePreviewWidth(1440, 2, 768)).toBe(1536);
  });

  it('uses the whole viewport for full screen', () => {
    // 1440 * 2 = 2880, clamped to the 2400 ceiling; 1000 * 2 stays as is.
    expect(comparePreviewWidth(1440, 2, 1440)).toBe(2400);
    expect(comparePreviewWidth(1000, 2, 1000)).toBe(2000);
  });

  it('never goes below 900 or above 2400', () => {
    expect(comparePreviewWidth(320, 1, 768)).toBe(900);
    expect(comparePreviewWidth(5000, 3, 5000)).toBe(2400);
  });

  it('rounds to a whole pixel', () => {
    expect(comparePreviewWidth(1001, 1.25, 2000)).toBe(1251);
  });
});
