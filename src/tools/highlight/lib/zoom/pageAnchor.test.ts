import { describe, expect, it } from 'vitest';
import { pageAnchorAt, scrollDelta } from './pageAnchor.ts';

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });

describe('pageAnchorAt', () => {
  const pages = [rect(100, 40, 400, 500), rect(100, 600, 400, 500)];
  it('finds the page holding the point and the fraction inside it', () => {
    expect(pageAnchorAt(pages, { x: 300, y: 790 })).toEqual({ pageIndex: 1, fx: 0.5, fy: 0.38 });
  });
  it('falls back to the nearest page by vertical distance, unclamped', () => {
    const a = pageAnchorAt(pages, { x: 100, y: 560 });
    expect(a?.pageIndex).toBe(0);
    expect(a?.fy).toBeCloseTo(1.04);
    expect(pageAnchorAt(pages, { x: 100, y: 580 })?.pageIndex).toBe(1);
  });
  it('is null with no pages', () => {
    expect(pageAnchorAt([], { x: 1, y: 1 })).toBeNull();
  });
});

describe('scrollDelta', () => {
  it('puts the same page fraction back under the screen point', () => {
    const point = { x: 300, y: 790 };
    const anchor = { fx: 0.5, fy: 0.38 };
    // after a 1.5x zoom the page is bigger and its top moved: the delta brings the fraction back to the point
    const after = rect(40, 640, 600, 750);
    const { dx, dy } = scrollDelta(anchor, after, point);
    expect(after.left + anchor.fx * after.width - dx).toBeCloseTo(point.x);
    expect(after.top + anchor.fy * after.height - dy).toBeCloseTo(point.y);
  });
  it('is exact below a fixed-height header that does not scale', () => {
    // page 3 sits under 3 headers and gaps that stay 48px tall however far we zoom
    const header = 48;
    const before = rect(0, 3 * header + 1000, 400, 500);
    const point = { x: 200, y: before.top + 125 };
    const anchor = pageAnchorAt([before], point)!;
    const after = rect(0, 3 * header + 1500, 600, 750);
    const { dy } = scrollDelta(anchor, after, point);
    expect(after.top + (anchor.fy * after.height) - dy).toBeCloseTo(point.y);
  });
});
