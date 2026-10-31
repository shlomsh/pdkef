import { describe, expect, it } from 'vitest';
import { cropPlan } from './passageCrop.ts';

const page = { width: 1000, height: 2000 };

describe('cropPlan', () => {
  it('draws the line at the given height from its start, as much as fits the width', () => {
    // band 500x20 canvas px; at 24 css px tall the scale is 1.2, so 250 css px show 208.3 source px.
    const p = cropPlan({ left: 10, top: 5, width: 50, height: 1 }, page, 250, 1, 24, 'ltr');
    expect([p.sx, p.sy, p.sh]).toEqual([100, 100, 20]);
    expect(p.sw).toBeCloseTo(208.33, 1);
    expect([p.cssWidth, p.cssHeight]).toEqual([250, 24]);
  });
  it('starts a right-to-left line at its right end', () => {
    const p = cropPlan({ left: 10, top: 5, width: 50, height: 1 }, page, 250, 1, 24, 'rtl');
    expect(p.sx + p.sw).toBeCloseTo(600, 5);
  });
  it('draws a short band at its own width, never stretched', () => {
    const p = cropPlan({ left: 0, top: 0, width: 5, height: 1 }, page, 250, 2, 20, 'ltr');
    expect([p.sw, p.cssWidth, p.cssHeight]).toEqual([50, 50, 20]);
    expect([p.dw, p.dh]).toEqual([100, 40]);
  });
});
