import { describe, expect, it } from 'vitest';
import { applyHomography, homography } from '../homography.ts';
import type { Quad, RgbaImage } from '../quad.ts';
import { seededRandom } from '../edges/testImages.ts';
import { isFlat, measureBend, pageMap, toGray } from './index.ts';
import { findLineBend } from './lineBend.ts';
import { warpAlong } from './meshWarp.ts';
import { bendAt, sideAt, type LineBend, type SideCurve } from './types.ts';

const W = 1500;
const H = 1150;
const UNIT: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
/** Normalized corners of the page in the photo. */
const QUAD: Quad = [{ x: 0.12, y: 0.08 }, { x: 0.86, y: 0.05 }, { x: 0.9, y: 0.95 }, { x: 0.08, y: 0.92 }];
const MARGIN = 0.008;
const FLAT: SideCurve = { a: 0, b: 0 };
/** A book page: lines bow most at the top, as 0.08 (x - 0.5)^2 (1 - y). */
const BOOK: LineBend = { c: [-0.08, 0.08, 0, 0.08, -0.08, 0, 0, 0, 0] };

/** Is there ink at (u, v) of the straight page: 16 rows of words. */
function straightInk(u: number, v: number): boolean {
  if (u < 0.08 || u > 0.92 || v < 0.1 || v > 0.9) return false;
  const row = (v - 0.1) / 0.05;
  if (row - Math.floor(row) > 0.28) return false;
  const word = (u * 37 + Math.floor(row) * 0.37) % 1;
  return word < 0.82;
}

/** A photo of the page: dark table, light paper with the given top edge and text-line bend. */
function photo(top: SideCurve, lines: LineBend | null): RgbaImage {
  const quadPx = QUAD.map((p) => ({ x: p.x * W, y: p.y * H })) as Quad;
  const inv = homography(quadPx, UNIT);
  const rnd = seededRandom(3);
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const { x: u, y: v0 } = applyHomography(inv, { x: x + 0.5, y: y + 0.5 });
      // The top edge bends the page's v by (1 - v) * d(u), as the Coons patch does.
      const v = (v0 - sideAt(top, u)) / (1 - sideAt(top, u));
      const onPage = u >= 0 && u <= 1 && v >= 0 && v <= 1;
      let g = 50;
      if (onPage) {
        const straightV = lines ? v - bendAt(lines, u, v) : v;
        g = straightInk(u, straightV) ? 45 : 225 - 20 * u;
      }
      g += (rnd() - 0.5) * 8;
      data.set([g, g, g, 255], (y * W + x) * 4);
    }
  }
  return { width: W, height: H, data };
}

describe('measureBend + pageMap', () => {
  it('leaves a flat page with straight lines flat', () => {
    const bend = measureBend(photo(FLAT, null), QUAD, MARGIN, 1100, 1400);
    expect(isFlat(bend)).toBe(true);
  });

  it('straightens a page whose top edge and text lines both bow', () => {
    const src = photo({ a: -0.1, b: 0 }, BOOK);
    const bend = measureBend(src, QUAD, MARGIN, 1100, 1400);
    expect(bend.curves).not.toBeNull();
    expect(bend.lines).not.toBeNull();
    const quadPx = QUAD.map((p) => ({ x: p.x * W, y: p.y * H })) as Quad;
    // Before: the corners alone leave the lines curved. After: nothing left to straighten.
    const before = warpAlong(src, pageMap(quadPx, MARGIN, { curves: null, lines: null, columns: null }), 1000, 1300);
    const after = warpAlong(src, pageMap(quadPx, MARGIN, bend), 1000, 1300);
    expect(findLineBend(toGray(before))).not.toBeNull();
    expect(findLineBend(toGray(after))).toBeNull();
  });
});
