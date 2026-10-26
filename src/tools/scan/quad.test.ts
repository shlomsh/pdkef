import { describe, expect, it } from 'vitest';
import { FULL_QUAD, clampPoint, isConvexQuad, orderQuad, quadKey, scaleQuad, type Quad } from './quad.ts';

describe('orderQuad', () => {
  it('orders four points top-left, top-right, bottom-right, bottom-left', () => {
    const shuffled = [{ x: 0.9, y: 0.85 }, { x: 0.1, y: 0.1 }, { x: 0.15, y: 0.9 }, { x: 0.8, y: 0.05 }];
    expect(orderQuad(shuffled)).toEqual([{ x: 0.1, y: 0.1 }, { x: 0.8, y: 0.05 }, { x: 0.9, y: 0.85 }, { x: 0.15, y: 0.9 }]);
  });

  it('orders a page turned close to 45 degrees by angle, not by sums', () => {
    const diamond = [{ x: 0.5, y: 0.05 }, { x: 0.95, y: 0.5 }, { x: 0.5, y: 0.95 }, { x: 0.05, y: 0.5 }];
    const [tl, tr, br, bl] = orderQuad(diamond);
    // Clockwise from the corner nearest the top-left, whichever that is.
    expect(isConvexQuad([tl, tr, br, bl])).toBe(true);
    expect(new Set([tl, tr, br, bl].map((p) => `${p.x},${p.y}`)).size).toBe(4);
  });

  it('rejects anything but four points', () => {
    expect(() => orderQuad([{ x: 0, y: 0 }])).toThrow();
  });
});

describe('isConvexQuad', () => {
  it('accepts the full photo', () => {
    expect(isConvexQuad(FULL_QUAD)).toBe(true);
  });

  it('rejects a bow tie (two corners swapped)', () => {
    const [tl, tr, br, bl] = FULL_QUAD;
    expect(isConvexQuad([tl, br, tr, bl])).toBe(false);
  });

  it('rejects a dent (one corner pulled inside)', () => {
    const dented: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.3, y: 0.3 }, { x: 0, y: 1 }];
    expect(isConvexQuad(dented)).toBe(false);
  });

  it('rejects three points on a line', () => {
    expect(isConvexQuad([{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }])).toBe(false);
  });
});

describe('clampPoint', () => {
  it('keeps a point inside the photo', () => {
    expect(clampPoint({ x: -0.2, y: 1.4 })).toEqual({ x: 0, y: 1 });
    expect(clampPoint({ x: 0.3, y: 0.6 })).toEqual({ x: 0.3, y: 0.6 });
  });
});

describe('scaleQuad', () => {
  it('turns a normalized quad into pixels', () => {
    expect(scaleQuad(FULL_QUAD, 400, 300)).toEqual([{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }]);
  });
});

describe('quadKey', () => {
  it('is stable under float noise and changes with a real move', () => {
    const a: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
    const noisy: Quad = a.map((p) => ({ x: p.x + 1e-9, y: p.y })) as Quad;
    const moved: Quad = [{ x: 0.12, y: 0.1 }, a[1], a[2], a[3]];
    expect(quadKey(noisy)).toBe(quadKey(a));
    expect(quadKey(moved)).not.toBe(quadKey(a));
  });
});
