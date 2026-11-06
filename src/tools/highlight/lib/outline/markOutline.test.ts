import { describe, expect, it } from 'vitest';
import { outlineStrokes, outlineVertices, outlineWobble, type OutlineStroke } from './markOutline.ts';
import type { SketchRect } from '#editor/geometry/sketchStroke.ts';

type OutlinePt = OutlineStroke[number];

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
  it('READ-26: pads a band by shares of its line height, more along the text than above and below', () => {
    const b = box(outlineVertices([{ x: 40, y: 100, w: 300, h: 20 }]));
    expect(b.x0).toBeCloseTo(38.2); expect(b.x1).toBeCloseTo(341.8);
    expect(b.y0).toBeCloseTo(99.4); expect(b.y1).toBeCloseTo(120.6);
  });
  it('READ-26: a line twice the height gets twice the padding and twice the wobble', () => {
    const small: SketchRect[] = [{ x: 40, y: 100, w: 300, h: 10 }], large: SketchRect[] = [{ x: 40, y: 100, w: 300, h: 20 }];
    const pad = (r: SketchRect[]) => r[0].y - box(outlineVertices(r)).y0;
    expect(pad(large)).toBeCloseTo(2 * pad(small));
    expect(outlineWobble(large)).toBeCloseTo(2 * outlineWobble(small));
  });
  it('READ-26: a passage that mixes sizes is padded for its tightest line', () => {
    const mixed: SketchRect[] = [{ x: 40, y: 100, w: 300, h: 30 }, { x: 40, y: 130, w: 300, h: 10 }];
    expect(100 - box(outlineVertices(mixed)).y0).toBeCloseTo(0.3);
    expect(outlineWobble(mixed)).toBeCloseTo(0.8);
  });
  it('READ-26: an empty band, as an imported highlight can carry, does not flatten the outline', () => {
    const imported: SketchRect[] = [{ x: 40, y: 100, w: 300, h: 10 }, { x: 40, y: 110, w: 300, h: 0 }];
    expect(outlineWobble(imported)).toBeCloseTo(0.8);
    expect(100 - box(outlineVertices(imported)).y0).toBeCloseTo(0.3);
  });
  it('READ-26: a mark with nothing but empty bands still gets finite strokes and no wobble', () => {
    const flat: SketchRect[] = [{ x: 40, y: 100, w: 300, h: 0 }];
    expect(outlineWobble(flat)).toBe(0);
    expect(outlineStrokes(flat).flat(2).every(Number.isFinite)).toBe(true);
  });
  it('READ-26: on a turned page the line height is the band\'s width', () => {
    expect(outlineWobble([{ x: 100, y: 40, w: 10, h: 300 }], 1)).toBeCloseTo(0.8);
  });
  it('gives a staircase of 12 vertices for three lines with distinct ends', () => {
    expect(outlineVertices(ragged)).toHaveLength(12);
  });
  it('encloses every band of a right-aligned passage without crossing itself', () => {
    const rtl: SketchRect[] = [{ x: 200, y: 100, w: 140, h: 14 }, { x: 60, y: 116, w: 280, h: 14 }, { x: 150, y: 132, w: 190, h: 14 }];
    const vs = outlineVertices(rtl), b = box(vs);
    for (const r of rtl) {
      expect(b.x0).toBeLessThan(r.x); expect(b.x1).toBeGreaterThan(r.x + r.w);
      expect(b.y0).toBeLessThan(r.y); expect(b.y1).toBeGreaterThan(r.y + r.h);
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
    const b = box(vs);
    expect(b.x0).toBeCloseTo(38.24); expect(b.x1).toBeCloseTo(341.66);
    expect(b.y0).toBeCloseTo(99.58); expect(b.y1).toBeCloseTo(146.42);
  });
  it('does not depend on the order of the bands', () => {
    expect(outlineVertices([ragged[2], ragged[0], ragged[1]])).toEqual(outlineVertices(ragged));
  });
  it('puts the along-text padding on y for a turned page', () => {
    const vs = outlineVertices([{ x: 100, y: 40, w: 14, h: 300 }], 1), b = box(vs);
    expect(vs).toHaveLength(4);
    expect(b.x0).toBeCloseTo(99.58); expect(b.x1).toBeCloseTo(114.42);
    expect(b.y0).toBeCloseTo(38.74); expect(b.y1).toBeCloseTo(341.26);
  });
  it('returns nothing for no bands', () => {
    expect(outlineVertices([])).toEqual([]);
    expect(outlineWobble([])).toBe(0);
  });
});

describe('outlineStrokes', () => {
  const near = (actual: readonly (readonly number[])[], expected: number[][]) => actual.flat().forEach((v, i) => expect(v).toBeCloseTo(expected.flat()[i]));

  it('READ-26: a stroke along the text runs past both corners, a stroke across it stops at them', () => {
    const [right, foot, left, top] = outlineStrokes([{ x: 40, y: 100, w: 300, h: 20 }]);
    near(right, [[341.8, 99.4], [341.8, 120.6]]);
    near(foot, [[346.8, 120.6], [33.2, 120.6]]);
    near(left, [[38.2, 120.6], [38.2, 99.4]]);
    near(top, [[33.2, 99.4], [346.8, 99.4]]);
  });
  it('READ-26: on a turned page the strokes along the text are the upright ones', () => {
    const [across, along] = outlineStrokes([{ x: 100, y: 40, w: 20, h: 300 }], 1);
    expect(Math.abs(across[1][0] - across[0][0])).toBeCloseTo(21.2);
    expect(Math.abs(along[1][1] - along[0][1])).toBeCloseTo(303.6 + 10);
  });
  it('gives one stroke per corner of the staircase', () => {
    expect(outlineStrokes(ragged)).toHaveLength(outlineVertices(ragged).length);
  });
  it('returns nothing for no bands', () => { expect(outlineStrokes([])).toEqual([]); });
});
