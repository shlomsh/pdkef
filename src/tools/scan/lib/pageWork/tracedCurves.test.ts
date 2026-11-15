import { describe, expect, it } from 'vitest';
import { sideAt, type EdgeCurves, type SideCurve } from '#lib/pageEnhance/dewarp/types.ts';
import { applyHomography, homography } from '#lib/pageEnhance/homography.ts';
import { scaleQuad, type Point, type Quad } from '#lib/pageEnhance/quad.ts';
import type { Sides } from '../edges/follow.ts';
import { curvesFromSides } from './tracedCurves.ts';

const W = 1000;
const H = 800;
const POINTS = 15;
const UNIT: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const FLAT: SideCurve = { a: 0, b: 0 };
const SQUARE_ON: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
const PERSPECTIVE: Quad = [{ x: 0.15, y: 0.1 }, { x: 0.85, y: 0.14 }, { x: 0.9, y: 0.92 }, { x: 0.08, y: 0.88 }];
const QUADS: [string, Quad][] = [['square-on', SQUARE_ON], ['perspective', PERSPECTIVE]];

const curves = (c: Partial<EdgeCurves>): EdgeCurves => ({ top: FLAT, right: FLAT, bottom: FLAT, left: FLAT, ...c });

interface Traced { sides: Sides; ts: number[][]; offsets: number[][] }

/** A traced border lying exactly on the given curves: chord points even in the picture, moved across in the unit square. */
function trace(quad: Quad, c: EdgeCurves): Traced {
  const quadPx = scaleQuad(quad, W, H);
  const forward = homography(UNIT, quadPx);
  const inverse = homography(quadPx, UNIT);
  const order: SideCurve[] = [c.top, c.right, c.bottom, c.left];
  const sides: Point[][] = [];
  const ts: number[][] = [];
  const offsets: number[][] = [];
  order.forEach((curve, s) => {
    const from = quadPx[s];
    const to = quadPx[(s + 1) % 4];
    const pts: Point[] = [];
    const sideTs: number[] = [];
    const sideOffsets: number[] = [];
    for (let k = 0; k < POINTS; k += 1) {
      const f = (k + 1) / (POINTS + 1);
      const u = applyHomography(inverse, { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f });
      const t = s === 0 || s === 2 ? u.x : u.y;
      const d = sideAt(curve, t);
      const moved = s === 0 ? { x: u.x, y: d } : s === 1 ? { x: 1 + d, y: u.y } : s === 2 ? { x: u.x, y: 1 + d } : { x: d, y: u.y };
      const p = applyHomography(forward, moved);
      pts.push({ x: p.x / W, y: p.y / H });
      sideTs.push(t);
      sideOffsets.push(d);
    }
    sides.push(pts);
    ts.push(sideTs);
    offsets.push(sideOffsets);
  });
  return { sides: sides as Sides, ts, offsets };
}

const fit = (quad: Quad, c: EdgeCurves) => curvesFromSides(quad, trace(quad, c).sides, W, H);

function expectCurve(got: SideCurve | undefined, want: SideCurve, tol = 0.002) {
  expect(got).toBeDefined();
  expect(Math.abs(got!.a - want.a)).toBeLessThan(tol);
  expect(Math.abs(got!.b - want.b)).toBeLessThan(tol);
}

describe('curvesFromSides', () => {
  it.each(QUADS)('returns null for straight sides (%s), so a flat page is never bent', (_n, quad) => {
    expect(fit(quad, curves({}))).toBeNull();
  });

  it.each(QUADS)('recovers a symmetric top bow with the other sides flat (%s), so the top is read as v', (_n, quad) => {
    const got = fit(quad, curves({ top: { a: -0.06, b: 0 } }));
    expect(got).not.toBeNull();
    expectCurve(got?.top, { a: -0.06, b: 0 });
    for (const side of [got?.right, got?.bottom, got?.left]) expectCurve(side, FLAT);
  });

  it.each(QUADS)('recovers a leaning bottom bow (%s), so the reversed bottom order and sign are right', (_n, quad) => {
    const want = { a: -0.06, b: 0.08 };
    const got = fit(quad, curves({ bottom: want }));
    expectCurve(got?.bottom, want);
    expectCurve(got?.top, FLAT);
  });

  it.each(QUADS)('recovers a leaning left bow (%s), so the reversed left order and sign are right', (_n, quad) => {
    const want = { a: -0.06, b: 0.08 };
    const got = fit(quad, curves({ left: want }));
    expectCurve(got?.left, want);
    expectCurve(got?.right, FLAT);
  });

  it.each(QUADS)('recovers a leaning right bow (%s), so the right side reads top to bottom with the +1 offset', (_n, quad) => {
    const want = { a: -0.06, b: 0.08 };
    const got = fit(quad, curves({ right: want }));
    expectCurve(got?.right, want);
    expectCurve(got?.left, FLAT);
  });

  it.each(QUADS)('recovers all four sides bowed at once (%s), so the sides do not leak into each other', (_n, quad) => {
    const want = curves({ top: { a: -0.05, b: 0.04 }, right: { a: 0.04, b: -0.06 }, bottom: { a: -0.06, b: 0.08 }, left: { a: 0.03, b: 0.05 } });
    const got = fit(quad, want);
    expectCurve(got?.top, want.top);
    expectCurve(got?.right, want.right);
    expectCurve(got?.bottom, want.bottom);
    expectCurve(got?.left, want.left);
  });

  it('drops a bow under the pixel threshold and keeps one just over it, so photo-edge wobble does not bend a page', () => {
    // Square-on, a top bow's peak is a/4 across 640 px: 0.012 gives 1.9 px, 0.02 gives 3.2 px.
    expect(fit(SQUARE_ON, curves({ top: { a: 0.012, b: 0 } }))).toBeNull();
    const got = fit(SQUARE_ON, curves({ top: { a: 0.012, b: 0 }, bottom: { a: 0.02, b: 0 } }));
    expectCurve(got?.top, FLAT);
    expectCurve(got?.bottom, { a: 0.02, b: 0 });
  });

  it('zeroes a side containing NaN and still fits the others, so one bad trace does not lose the page', () => {
    const traced = trace(PERSPECTIVE, curves({ top: { a: -0.06, b: 0 }, bottom: { a: -0.06, b: 0.08 } }));
    traced.sides[0][4] = { x: Number.NaN, y: 0.1 };
    const got = curvesFromSides(PERSPECTIVE, traced.sides, W, H);
    expectCurve(got?.top, FLAT);
    expectCurve(got?.bottom, { a: -0.06, b: 0.08 });
  });

  it('returns null for corners with no perspective, so a degenerate quad never throws', () => {
    const line: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.3, y: 0.1 }];
    expect(curvesFromSides(line, trace(SQUARE_ON, curves({})).sides, W, H)).toBeNull();
  });

  it('reproduces each generated point offset from the recovered curves under perspective, so the fit is exact where it is read', () => {
    const want = curves({ top: { a: -0.05, b: 0.04 }, right: { a: 0.04, b: -0.06 }, bottom: { a: -0.06, b: 0.08 }, left: { a: 0.03, b: 0.05 } });
    const traced = trace(PERSPECTIVE, want);
    const got = curvesFromSides(PERSPECTIVE, traced.sides, W, H);
    expect(got).not.toBeNull();
    const order = [got!.top, got!.right, got!.bottom, got!.left];
    order.forEach((curve, s) => {
      traced.ts[s].forEach((t, k) => expect(Math.abs(sideAt(curve, t) - traced.offsets[s][k])).toBeLessThan(0.0005));
    });
  });
});

describe('curvesFromSides with a fold and a straight edge off the corners', () => {
  const profile = (c: SideCurve | undefined, ts: number[]) => ts.map((t) => sideAt(c!, t));
  const range = (from: number, to: number) => Array.from({ length: 17 }, (_, i) => from + ((to - from) * i) / 16);
  const close = (c: SideCurve | undefined, want: SideCurve, from: number, to: number, tol = 0.0005) => {
    expect(c).toBeDefined();
    range(from, to).forEach((t) => expect(Math.abs(sideAt(c!, t) - sideAt(want, t))).toBeLessThan(tol));
  };

  it.each(QUADS)('recovers a fold (%s)', (_n, quad) => {
    const want: SideCurve = { a: 0, b: 0, kink: { at: 0.47, by: 0.01 } };
    const got = fit(quad, curves({ left: want }));
    close(got?.left, want, 0.05, 0.95);
    expect(Math.abs(got!.left.kink!.at - 0.47)).toBeLessThan(0.02);
  });

  it.each(QUADS)('recovers a straight edge off the chord as flat in the middle (%s)', (_n, quad) => {
    const want: SideCurve = { a: 0, b: 0, line: { e: 0.006, f: 0 } };
    close(fit(quad, curves({ left: want }))?.left, want, 0.1, 0.9);
  });

  it.each(QUADS)('recovers a tilted straight edge (%s)', (_n, quad) => {
    const want: SideCurve = { a: 0, b: 0, line: { e: 0.002, f: 0.006 } };
    close(fit(quad, curves({ left: want }))?.left, want, 0.1, 0.9);
  });

  it.each(QUADS)('keeps a curl a curl (%s), compared by sideAt profile', (_n, quad) => {
    const want: SideCurve = { a: 0.06, b: 0.03 };
    const got = fit(quad, curves({ left: want }))?.left;
    expect(profile(got, range(0, 1))).toEqual(profile(want, range(0, 1)).map((v) => expect.closeTo(v, 3)));
  });

  it.each(QUADS)('round-trips a curl plus an offset (%s)', (_n, quad) => {
    const want: SideCurve = { a: 0.05, b: 0, line: { e: 0.004, f: 0 } };
    close(fit(quad, curves({ left: want }))?.left, want, 0.1, 0.9);
  });
});
