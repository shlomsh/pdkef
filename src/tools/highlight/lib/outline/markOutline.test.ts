import { describe, expect, it } from 'vitest';
import { outlineVertices, type OutlinePt } from './markOutline.ts';
import type { SketchRect } from '#editor/geometry/sketchStroke.ts';

const box = (vs: readonly OutlinePt[]) => ({
  x0: Math.min(...vs.map((v) => v[0])), x1: Math.max(...vs.map((v) => v[0])),
  y0: Math.min(...vs.map((v) => v[1])), y1: Math.max(...vs.map((v) => v[1])),
});

/** True when two non-adjacent edges of the closed polygon cross or touch. */
function selfIntersects(vs: readonly OutlinePt[]): boolean {
  const n = vs.length;
  const orient = (a: OutlinePt, b: OutlinePt, c: OutlinePt) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  const on = (a: OutlinePt, b: OutlinePt, c: OutlinePt) => Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]);
  const cross = (a: OutlinePt, b: OutlinePt, c: OutlinePt, d: OutlinePt) => {
    const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
    return (o1 !== o2 && o3 !== o4) || (o1 === 0 && on(a, b, c)) || (o2 === 0 && on(a, b, d)) || (o3 === 0 && on(c, d, a)) || (o4 === 0 && on(c, d, b));
  };
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (cross(vs[i], vs[(i + 1) % n], vs[j], vs[(j + 1) % n])) return true;
  }
  return false;
}

const ragged: SketchRect[] = [{ x: 40, y: 100, w: 300, h: 14 }, { x: 80, y: 116, w: 240, h: 14 }, { x: 120, y: 132, w: 180, h: 14 }];

describe('outlineVertices', () => {
  it('pads a single band by 3 along the text and 4 above and below', () => {
    expect(outlineVertices([{ x: 40, y: 100, w: 300, h: 14 }])).toEqual([[343, 96], [343, 118], [37, 118], [37, 96]]);
  });
  it('gives a staircase of 12 vertices for three lines with distinct ends', () => {
    expect(outlineVertices(ragged)).toHaveLength(12);
  });
  it('encloses every band of a right-aligned passage without crossing itself', () => {
    const rtl: SketchRect[] = [{ x: 200, y: 100, w: 140, h: 14 }, { x: 60, y: 116, w: 280, h: 14 }, { x: 150, y: 132, w: 190, h: 14 }];
    const vs = outlineVertices(rtl), b = box(vs);
    for (const r of rtl) {
      expect(b.x0).toBeLessThanOrEqual(r.x - 3); expect(b.x1).toBeGreaterThanOrEqual(r.x + r.w + 3);
      expect(b.y0).toBeLessThanOrEqual(r.y - 4); expect(b.y1).toBeGreaterThanOrEqual(r.y + r.h + 4);
    }
    expect(selfIntersects(vs)).toBe(false);
  });
  it('meets lines whose padding overlaps at the midpoint, so a tight stack never crosses itself', () => {
    const tight: SketchRect[] = [{ x: 40, y: 100, w: 300, h: 14 }, { x: 70, y: 114, w: 200, h: 14 }, { x: 20, y: 128, w: 250, h: 14 }];
    const vs = outlineVertices(tight);
    expect(selfIntersects(vs)).toBe(false);
    expect(vs.some((v) => v[1] === 114)).toBe(true);
  });
  it('snaps near-equal line ends so a justified paragraph has straight sides', () => {
    const j: SketchRect[] = [{ x: 40, y: 100, w: 300, h: 14 }, { x: 40.8, y: 116, w: 299.4, h: 14 }, { x: 39.5, y: 132, w: 300.9, h: 14 }];
    const vs = outlineVertices(j);
    expect(vs).toHaveLength(4);
    expect(box(vs)).toEqual({ x0: 36.5, x1: 343.4, y0: 96, y1: 150 });
  });
  it('does not depend on the order of the bands', () => {
    expect(outlineVertices([ragged[2], ragged[0], ragged[1]])).toEqual(outlineVertices(ragged));
  });
  it('puts the along-text padding on y for a turned page', () => {
    const vs = outlineVertices([{ x: 100, y: 40, w: 14, h: 300 }], 1), b = box(vs);
    expect(vs).toHaveLength(4);
    expect(b).toEqual({ x0: 96, x1: 118, y0: 37, y1: 343 });
  });
  it('returns nothing for no bands', () => { expect(outlineVertices([])).toEqual([]); });
});
