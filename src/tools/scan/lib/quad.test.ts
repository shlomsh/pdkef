import { describe, expect, it } from 'vitest';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import { FULL_QUAD, clampPoint, isConvexQuad, quadKey, isPagelike, turnedQuad, unturnedQuad } from './quad.ts';

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

describe('quadKey', () => {
  it('is stable under float noise and changes with a real move', () => {
    const a: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
    const noisy: Quad = a.map((p) => ({ x: p.x + 1e-9, y: p.y })) as Quad;
    const moved: Quad = [{ x: 0.12, y: 0.1 }, a[1], a[2], a[3]];
    expect(quadKey(noisy)).toBe(quadKey(a));
    expect(quadKey(moved)).not.toBe(quadKey(a));
  });
});

describe('turnedQuad / unturnedQuad', () => {
  const q: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.8, y: 0.05 }, { x: 0.9, y: 0.85 }, { x: 0.15, y: 0.9 }];

  it('shows the corners on the photo turned clockwise, the page top-left first', () => {
    // A clockwise turn moves a photo point (x, y) to (1 - y, x); the photo's bottom-left is the page's top-left.
    expect(turnedQuad(q, 1)).toEqual([
      { x: 1 - q[3].y, y: q[3].x },
      { x: 1 - q[0].y, y: q[0].x },
      { x: 1 - q[1].y, y: q[1].x },
      { x: 1 - q[2].y, y: q[2].x },
    ]);
    expect(turnedQuad(FULL_QUAD, 1)).toEqual(FULL_QUAD);
  });

  it('is the photo itself at no turn', () => {
    expect(turnedQuad(q, 0)).toEqual(q);
    expect(unturnedQuad(q, 0)).toEqual(q);
  });

  it('comes back to the photo corners from any turn', () => {
    for (const turns of [1, 2, 3, 5, -1]) {
      const back = unturnedQuad(turnedQuad(q, turns), turns);
      back.forEach((p, i) => {
        expect(p.x).toBeCloseTo(q[i].x, 10);
        expect(p.y).toBeCloseTo(q[i].y, 10);
      });
    }
  });
});

describe('isPagelike', () => {
  it('takes a page in any reasonable perspective', () => {
    expect(isPagelike(FULL_QUAD)).toBe(true);
    expect(isPagelike([{ x: 0.1, y: 0.1 }, { x: 0.8, y: 0.05 }, { x: 0.9, y: 0.85 }, { x: 0.15, y: 0.9 }])).toBe(true);
  });

  it('refuses a corner on, or all but on, the line between its neighbours: the warp fans out', () => {
    // Top-left on the diagonal from top-right to bottom-left: 180 degrees.
    expect(isPagelike([{ x: 0.5, y: 0.5 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }])).toBe(false);
    // A hair off it: still not a page.
    expect(isPagelike([{ x: 0.49, y: 0.49 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }])).toBe(false);
  });

  it('refuses a bow tie and a dent, as isConvexQuad does', () => {
    expect(isPagelike([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.1, y: 0.9 }, { x: 0.9, y: 0.9 }])).toBe(false);
    expect(isPagelike([{ x: 0.6, y: 0.6 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }])).toBe(false);
  });
});
