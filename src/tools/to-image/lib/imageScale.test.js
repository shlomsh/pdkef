import { describe, expect, it } from 'vitest';
import { MAX_CANVAS_AREA, MAX_CANVAS_SIDE } from '#lib/images/canvasLimits.js';
import { stackedRenderScale } from './toImage.js';

const fits = (w, h, scale) => {
  const cw = Math.floor(w * scale);
  const ch = Math.floor(h * scale);
  return cw * ch <= MAX_CANVAS_AREA && Math.max(cw, ch) <= MAX_CANVAS_SIDE;
};

describe('stackedRenderScale', () => {
  it('keeps ordinary stacks at exactly the chosen scale', () => {
    const pages = Array.from({ length: 5 }, () => ({ width: 612, height: 792 }));
    expect(stackedRenderScale(pages, 2)).toBe(2);
  });

  it('scales every page down uniformly so the combined canvas fits', () => {
    const pages = Array.from({ length: 60 }, () => ({ width: 612, height: 792 }));
    const scale = stackedRenderScale(pages, 3);
    expect(scale).toBeLessThan(3);
    const width = Math.max(...pages.map((p) => p.width));
    const height = pages.reduce((sum, p) => sum + p.height, 0);
    expect(fits(width, height, scale)).toBe(true);
  });

  it('accounts for the widest page when pages differ', () => {
    const pages = [{ width: 612, height: 792 }, { width: 6000, height: 4000 }];
    expect(fits(6000, 4792, stackedRenderScale(pages, 2))).toBe(true);
  });
});
