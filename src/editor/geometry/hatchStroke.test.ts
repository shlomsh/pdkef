import { describe, expect, it } from 'vitest';
import { hatchOps } from './hatchStroke.ts';
import { HATCH_GAP, hatchPathD } from './hatchInk.ts';
import { strokeSeed, svgPath, type SketchRect } from './sketchStroke.ts';

const one: SketchRect[] = [{ x: 40, y: 100, w: 100, h: 20 }];
const two: SketchRect[] = [{ x: 40, y: 100, w: 300, h: 14 }, { x: 40, y: 130, w: 120, h: 14 }];
const seed = strokeSeed('mark-1');
// rough.js's hachureAngle -41 climbs 49 degrees from the horizontal in the page's y-down space.
const SLANT = 49;

type Op = ReturnType<typeof hatchOps>[number];
const points = (ops: readonly Op[]): [number, number][] => {
  const out: [number, number][] = [];
  for (const op of ops) for (let i = 1; i + 1 < op.length; i += 2) out.push([op[i] as number, op[i + 1] as number]);
  return out;
};
const inside = (p: [number, number], r: SketchRect, slack: number) => p[0] >= r.x - slack && p[0] <= r.x + r.w + slack && p[1] >= r.y - slack && p[1] <= r.y + r.h + slack;

describe('READ-14: hatchOps', () => {
  it('gives the same strokes for the same bands and seed, and other strokes for another seed', () => {
    expect(hatchOps(one, seed)).toEqual(hatchOps(one, seed));
    expect(hatchOps(one, seed)).not.toEqual(hatchOps(one, strokeSeed('mark-2')));
  });

  it('is pen strokes only: M and C with finite numbers, no fill, no close', () => {
    const ops = hatchOps(two, seed);
    expect(ops.length).toBeGreaterThan(10);
    expect(new Set(ops.map((op) => op[0]))).toEqual(new Set(['M', 'C']));
    expect(points(ops).flat().every((n) => Number.isFinite(n))).toBe(true);
  });

  it('keeps every stroke within the band, give or take the pencil wobble', () => {
    for (const p of points(hatchOps(one, seed))) expect(inside(p, one[0], 2.5)).toBe(true);
  });

  it('hatches each line of a multi-line passage and nothing between them', () => {
    const pts = points(hatchOps(two, seed));
    for (const p of pts) expect(two.some((r) => inside(p, r, 2.5))).toBe(true);
    for (const r of two) expect(pts.some((p) => inside(p, r, 0))).toBe(true);
  });

  it('lays one stroke about every HATCH_GAP across the band', () => {
    const strokes = hatchOps(one, seed).filter((op) => op[0] === 'M').length;
    // each line is drawn twice, and the strokes climb at SLANT degrees, so the band is crossed over this distance
    const across = 100 * Math.sin((SLANT * Math.PI) / 180) + 20 * Math.cos((SLANT * Math.PI) / 180);
    const expected = across / HATCH_GAP;
    expect(strokes / 2).toBeGreaterThan(expected * 0.8);
    expect(strokes / 2).toBeLessThan(expected * 1.2);
  });

  it('never leaves a speck: no stroke is shorter than a point', () => {
    const ops = hatchOps(one, seed);
    ops.forEach((op, i) => {
      if (op[0] !== 'M') return;
      const c = ops[i + 1];
      expect(c[0]).toBe('C');
      if (c[0] === 'C') expect(Math.hypot(c[5] - op[1], c[6] - op[2])).toBeGreaterThan(1);
    });
  });

  it('slants the strokes the way a right hand shades: up and to the right', () => {
    const ops = hatchOps(one, seed);
    const angles: number[] = [];
    ops.forEach((op, i) => {
      if (op[0] !== 'M') return;
      const c = ops[i + 1];
      if (c[0] !== 'C') return;
      angles.push((Math.atan2(-(c[6] - op[2]), c[5] - op[1]) * 180) / Math.PI);
    });
    const mean = angles.reduce((a, b) => a + b, 0) / angles.length;
    expect(Math.abs(mean - SLANT)).toBeLessThan(4);
  });

  it('hatchPathD is the strokes as one path for the mark id, the same every time', () => {
    expect(hatchPathD(hatchOps, one, 'mark-1')).toBe(svgPath(hatchOps(one, strokeSeed('mark-1'))));
    expect(hatchPathD(hatchOps, one, 'mark-1')).toBe(hatchPathD(hatchOps, one, 'mark-1'));
  });

  it('is path data the screen can draw and an empty list draws nothing', () => {
    expect(svgPath(hatchOps(one, seed)).startsWith('M')).toBe(true);
    expect(hatchOps([], seed)).toEqual([]);
  });
});
