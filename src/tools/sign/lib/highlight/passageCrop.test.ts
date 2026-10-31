import { describe, expect, it } from 'vitest';
import { cropPlan } from './passageCrop.ts';

const page = { width: 1000, height: 2000 };

describe('cropPlan', () => {
  it('maps the band percent onto canvas pixels', () => {
    const p = cropPlan({ left: 10, top: 5, width: 50, height: 1 }, page, 250, 1, 100);
    expect([p.sx, p.sy, p.sw, p.sh]).toEqual([100, 100, 500, 20]);
  });
  it('takes its height from the aspect ratio and scales the backing store by dpr', () => {
    const p = cropPlan({ left: 0, top: 0, width: 50, height: 1 }, page, 250, 2, 100);
    expect(p.cssHeight).toBe(10);
    expect([p.dw, p.dh]).toEqual([500, 20]);
  });
  it('caps a tall band and crops the source to match', () => {
    const p = cropPlan({ left: 0, top: 0, width: 50, height: 10 }, page, 250, 1, 40);
    expect(p.cssHeight).toBe(40);
    expect(p.sh).toBe(80);
  });
});
