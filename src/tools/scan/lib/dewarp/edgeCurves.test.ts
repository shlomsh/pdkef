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

interface Bows { top: SideCurve; right: SideCurve; bottom: SideCurve; left: SideCurve }

function render(quad: Quad, bows: Bows, width = W): GrayImage {
  const inv = homography(quad, UNIT);
  const data = new Uint8ClampedArray(width * H);
  const rnd = seededRandom(7);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const { x: u, y: v } = applyHomography(inv, { x: x + 0.5, y: y + 0.5 });
      const page = u >= sideAt(bows.left, v) && u <= 1 + sideAt(bows.right, v) && v >= sideAt(bows.top, u) && v <= 1 + sideAt(bows.bottom, u);
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

  it('leaves a side with no edge in the picture at zero', () => {
    const quad: Quad = [{ x: 150, y: 90 }, { x: 1000, y: 60 }, { x: 1040, y: 620 }, { x: 110, y: 650 }];
    const r = findEdgeCurves(render(quad, { top: { a: -0.08, b: 0 }, right: FLAT, bottom: FLAT, left: FLAT }, 900), quad);
    expect(r?.right ?? FLAT).toEqual(FLAT);
  });
});
