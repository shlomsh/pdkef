import { describe, expect, it } from 'vitest';
import { applyHomography, homography } from '../homography.ts';
import type { Quad, RgbaImage } from '../quad.ts';
import { warpPerspective } from '../warp.ts';
import { pageMap } from './index.ts';
import { warpAlong } from './meshWarp.ts';
import { sideAt } from './types.ts';

const UNIT: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const QUAD: Quad = [{ x: 30, y: 22 }, { x: 260, y: 40 }, { x: 240, y: 190 }, { x: 18, y: 170 }];
const FLAT = { curves: null, lines: null, columns: null };

/** A smooth colour ramp, so bilinear sampling differences stay tiny. */
function ramp(width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data.set([(x * 255) / width, (y * 255) / height, ((x + y) * 127) / (width + height), 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

describe('warpAlong', () => {
  it('matches warpPerspective when the map is the corners homography', () => {
    const src = ramp(300, 220);
    const width = 230;
    const height = 150;
    const a = warpPerspective(src, QUAD, width, height);
    const b = warpAlong(src, pageMap(QUAD, 0, FLAT), width, height);
    let worst = 0;
    for (let i = 0; i < a.data.length; i += 1) worst = Math.max(worst, Math.abs(a.data[i] - b.data[i]));
    expect(worst).toBeLessThanOrEqual(2);
  });

  it('paints outside the photo white', () => {
    const src = ramp(50, 50);
    const out = warpAlong(src, (x, y) => ({ x: x * 200 - 100, y: y * 50 }), 20, 10);
    expect([...out.data.slice(0, 4)]).toEqual([255, 255, 255, 255]);
  });
});

describe('pageMap', () => {
  const h = homography(UNIT, QUAD);

  it('puts the corners on the quad when nothing bends', () => {
    const map = pageMap(QUAD, 0, FLAT);
    UNIT.forEach((p, i) => {
      const q = map(p.x, p.y);
      expect(q.x).toBeCloseTo(QUAD[i].x, 6);
      expect(q.y).toBeCloseTo(QUAD[i].y, 6);
    });
  });

  it('follows a curved side and keeps the corners', () => {
    const top = { a: -0.08, b: 0.02 };
    const zero = { a: 0, b: 0 };
    const map = pageMap(QUAD, 0, { curves: { top, right: zero, bottom: zero, left: zero }, lines: null, columns: null });
    for (const t of [0.25, 0.5, 0.8]) {
      const want = applyHomography(h, { x: t, y: sideAt(top, t) });
      const got = map(t, 0);
      expect(got.x).toBeCloseTo(want.x, 6);
      expect(got.y).toBeCloseTo(want.y, 6);
    }
    expect(map(0, 0).x).toBeCloseTo(QUAD[0].x, 6);
    expect(map(1, 0).y).toBeCloseTo(QUAD[1].y, 6);
    // The bottom side is untouched by the top's curve.
    const bottom = map(0.5, 1);
    const straight = applyHomography(h, { x: 0.5, y: 1 });
    expect(bottom.y).toBeCloseTo(straight.y, 6);
  });

  it('crops `margin` off each side', () => {
    const map = pageMap(QUAD, 0.1, FLAT);
    const q = map(0, 0);
    const want = applyHomography(h, { x: 0.1, y: 0.1 });
    expect(q.x).toBeCloseTo(want.x, 6);
    expect(q.y).toBeCloseTo(want.y, 6);
  });
});
