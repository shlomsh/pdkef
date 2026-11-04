import { describe, expect, it } from 'vitest';
import { applyHomography, homography } from '../homography.ts';
import type { Quad, RgbaImage } from '../quad.ts';
import { seededRandom } from '../edges/testImages.ts';
import { bentPx, isFlat, measureBend, pageMap, toGray } from './index.ts';
import { findLineBend } from './lineBend.ts';
import { warpAlong } from './meshWarp.ts';
import { sideAt, type SideCurve } from './types.ts';

const W = 1500;
const H = 1150;
const UNIT: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
/** Normalized corners of the page in the photo. */
const QUAD: Quad = [{ x: 0.12, y: 0.08 }, { x: 0.86, y: 0.05 }, { x: 0.9, y: 0.95 }, { x: 0.08, y: 0.92 }];
const MARGIN = 0.008;
const FLAT: SideCurve = { a: 0, b: 0 };
/** A book page: lines bow most at the top, as 0.08 (x - 0.5)^2 (1 - y). */
const BOOK = (x: number, y: number): number => 0.08 * (1 - y) * (x * x - x + 1 / 6);

/** Is there ink at (u, v) of the straight page: 16 rows of words. */
function straightInk(u: number, v: number): boolean {
  if (u < 0.08 || u > 0.92 || v < 0.1 || v > 0.9) return false;
  const row = (v - 0.1) / 0.05;
  if (row - Math.floor(row) > 0.28) return false;
  const word = (u * 37 + Math.floor(row) * 0.37) % 1;
  return word < 0.82;
}

/** A photo of the page: dark table, light paper with the given top edge and text-line bend. */
function photo(top: SideCurve, lines: ((x: number, y: number) => number) | null): RgbaImage {
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
        const straightV = lines ? v - lines(u, v) : v;
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

describe('bentPx', () => {
  const lift = (by: number) => ({ nx: 2, ny: 2, d: [by, by, by, by] });

  it('is 0 for a flat page', () => {
    expect(bentPx({ curves: null, lines: null, columns: null }, MARGIN, 2000, 2400)).toBe(0);
  });

  it('measures a shift of the rows in output pixels', () => {
    // Every row read 1% of the page lower: 24 pixels of a 2400 px tall output, whatever the margin.
    expect(bentPx({ curves: null, lines: lift(0.01), columns: null }, MARGIN, 2000, 2400)).toBeCloseTo(24, 6);
    expect(bentPx({ curves: null, lines: null, columns: lift(-0.01) }, MARGIN, 2000, 2400)).toBeCloseTo(20, 6);
  });

  it('finds a bowed top edge at its deepest, near the top centre', () => {
    const bend = { curves: { top: { a: -0.1, b: 0 }, right: FLAT, bottom: FLAT, left: FLAT }, lines: null, columns: null };
    // d(1/2) = 0.025 of the unit square at the top edge, (1 - margin) of it at the output's top row.
    const expected = (0.025 * (1 - MARGIN) * 2400) / (1 - 2 * MARGIN);
    expect(bentPx(bend, MARGIN, 2000, 2400)).toBeCloseTo(expected, 6);
  });
});
