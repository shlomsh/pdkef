import { describe, expect, it } from 'vitest';
import { applyBoxResize } from './boxResize.ts';

const start = { left: 20, top: 30, width: 30, height: 25 };

describe('applyBoxResize', () => {
  it('keeps the opposite edge anchored for every horizontal handle', () => {
    const right = applyBoxResize({ handle: 'right', delta: { x: 100, y: 0 }, start });
    expect(right.left).toBe(start.left);
    expect(right.left + right.width).toBeLessThanOrEqual(100);

    const left = applyBoxResize({ handle: 'left', delta: { x: -100, y: 0 }, start });
    expect(left.left).toBeGreaterThanOrEqual(0);
    expect(left.left + left.width).toBeCloseTo(start.left + start.width);
  });

  it('keeps the opposite edge anchored for every vertical handle', () => {
    const bottom = applyBoxResize({ handle: 'bottom', delta: { x: 0, y: 100 }, start });
    expect(bottom.top).toBe(start.top);
    expect(bottom.top + bottom.height).toBeLessThanOrEqual(100);

    const top = applyBoxResize({ handle: 'top', delta: { x: 0, y: -100 }, start });
    expect(top.top).toBeGreaterThanOrEqual(0);
    expect(top.top + top.height).toBeCloseTo(start.top + start.height);
  });

  it('is a no-op for a zero delta', () => {
    expect(applyBoxResize({ handle: 'top-left', delta: { x: 0, y: 0 }, start })).toEqual(start);
  });
});
