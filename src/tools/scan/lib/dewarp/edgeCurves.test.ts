import { describe, expect, it } from 'vitest';
import { applyHomography, homography } from '../homography.ts';
import type { GrayImage, Quad } from '../quad.ts';
import { seededRandom } from '../edges/testImages.ts';
import { findEdgeCurves } from './edgeCurves.ts';
import { sideAt } from './types.ts';
import type { SideCurve } from './types.ts';

const W = 900;
const H = 700;
const UNIT: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const QUAD: Quad = [{ x: 150, y: 90 }, { x: 760, y: 60 }, { x: 800, y: 620 }, { x: 110, y: 650 }];
const FLAT: SideCurve = { a: 0, b: 0 };

/** A side as a bow, or as any offset along it (a fold's kink is not a bow). */
type Side = SideCurve | ((t: number) => number);
interface Bows { top: Side; right: Side; bottom: Side; left: Side }
const off = (side: Side, t: number) => (typeof side === 'function' ? side(t) : sideAt(side, t));

function render(quad: Quad, bows: Bows, width = W): GrayImage {
  const inv = homography(quad, UNIT);
  const data = new Uint8ClampedArray(width * H);
  const rnd = seededRandom(7);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const { x: u, y: v } = applyHomography(inv, { x: x + 0.5, y: y + 0.5 });
      const page = u >= off(bows.left, v) && u <= 1 + off(bows.right, v) && v >= off(bows.top, u) && v <= 1 + off(bows.bottom, u);
      data[y * width + x] = (page ? 220 : 40) + (rnd() - 0.5) * 12;
    }
  }
  return { width, height: H, data };
}

describe('findEdgeCurves', () => {
  it('returns null for a flat page', () => {
    expect(findEdgeCurves(render(QUAD, { top: FLAT, right: FLAT, bottom: FLAT, left: FLAT }), QUAD)).toBeNull();
  });

  it('keeps a flat page flat when the corners sit a little off the paper', () => {
    const image = render(QUAD, { top: FLAT, right: FLAT, bottom: FLAT, left: FLAT });
    // A hand-dragged set of corners: each a few pixels inside or outside the real one.
    const off: Quad = [{ x: 158, y: 97 }, { x: 753, y: 54 }, { x: 806, y: 613 }, { x: 116, y: 656 }];
    expect(findEdgeCurves(image, off)).toBeNull();
  });

  it('recovers a top bowed up and a bottom bowed down, leaving the straight sides alone', () => {
    const r = findEdgeCurves(render(QUAD, { top: { a: -0.08, b: 0 }, right: FLAT, bottom: { a: 0.06, b: 0 }, left: FLAT }), QUAD);
    expect(r).not.toBeNull();
    expect(Math.abs(r!.top.a + 0.08)).toBeLessThan(0.015);
    expect(Math.abs(r!.bottom.a - 0.06)).toBeLessThan(0.015);
    for (const side of [r!.left, r!.right]) for (let t = 0; t <= 1; t += 0.05) expect(Math.abs(sideAt(side, t))).toBeLessThan(0.003);
  });

  it('recovers a leaning bow', () => {
    const truth = { a: -0.06, b: 0.08 };
    const r = findEdgeCurves(render(QUAD, { top: truth, right: FLAT, bottom: FLAT, left: FLAT }), QUAD);
    expect(r).not.toBeNull();
    for (let t = 0.1; t <= 0.9001; t += 0.1) expect(Math.abs(sideAt(r!.top, t) - sideAt(truth, t))).toBeLessThan(0.004);
  });

  // SCAN-35: a letter folded in thirds and laid flat. Its top panel sits a little askew, so the left
  // side runs straight to the fold and turns there, 5 px in at the fold: a kink, not a bow.
  it('keeps a folded letter flat when its side kinks at a fold', () => {
    const fold = (t: number) => 0.008 * (t < 1 / 3 ? 3 * t : 1.5 * (1 - t));
    expect(findEdgeCurves(render(QUAD, { top: FLAT, right: FLAT, bottom: FLAT, left: fold }), QUAD)).toBeNull();
  });

  it('leaves a side bowing less than a cut edge wanders (2 px) straight', () => {
    expect(findEdgeCurves(render(QUAD, { top: FLAT, right: FLAT, bottom: FLAT, left: { a: 0.01, b: 0 } }), QUAD)).toBeNull();
  });

  it('leaves a side with no edge in the picture at zero', () => {
    const quad: Quad = [{ x: 150, y: 90 }, { x: 1000, y: 60 }, { x: 1040, y: 620 }, { x: 110, y: 650 }];
    const r = findEdgeCurves(render(quad, { top: { a: -0.08, b: 0 }, right: FLAT, bottom: FLAT, left: FLAT }, 900), quad);
    expect(r?.right ?? FLAT).toEqual(FLAT);
  });
});
