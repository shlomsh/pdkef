import { describe, expect, it } from 'vitest';
import type { Point, Quad, RgbaImage } from '../quad.ts';
import { seededRandom } from '../edges/testImages.ts';
import { columnFit } from './columnBend.ts';
import { isFlat, measureBend, pageMap } from './index.ts';
import { pageMasks } from './ink.ts';
import { warpAlong } from './meshWarp.ts';

const W = 900;
const H = 1200;
const FULL: Quad = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
const UNIT: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const RULES_X = [0.12, 0.35, 0.6, 0.88];
const ROWS_Y = [0.15, 0.23, 0.31, 0.39, 0.47, 0.55, 0.63, 0.71, 0.79, 0.87];

/** A form's table, photographed: `toStraight` takes a point of the photo (pixels) to where it sits on
 * the straight form (normalized), so any distortion is drawn by its inverse. */
function form(toStraight: (x: number, y: number) => Point, rowsY = ROWS_Y): RgbaImage {
  const rnd = seededRandom(5);
  const data = new Uint8ClampedArray(W * H * 4);
  const half = 1.2;
  for (let py = 0; py < H; py += 1) {
    for (let px = 0; px < W; px += 1) {
      const { x, y } = toStraight(px + 0.5, py + 0.5);
      const inTable = x >= 0.12 - 0.002 && x <= 0.88 + 0.002 && y >= 0.15 - 0.002 && y <= 0.87 + 0.002;
      const ink = inTable && (RULES_X.some((r) => Math.abs(x - r) * W <= half) || rowsY.some((r) => Math.abs(y - r) * H <= half));
      const v = (ink ? 40 : 228) + (rnd() - 0.5) * 8;
      data.set([v, v, v, 255], (py * W + px) * 4);
    }
  }
  return { width: W, height: H, data };
}

const straight = (x: number, y: number): Point => ({ x: x / W, y: y / H });

/** The form turned `deg` degrees about its centre. */
const turned = (deg: number) => (x: number, y: number): Point => {
  const a = (deg * Math.PI) / 180;
  const dx = x - W / 2;
  const dy = y - H / 2;
  return { x: (W / 2 + dx * Math.cos(a) + dy * Math.sin(a)) / W, y: (H / 2 - dx * Math.sin(a) + dy * Math.cos(a)) / H };
};

/** Each rule's lean (pixels across per pixel down), traced in the image itself: the dark centroid near
 * the rule in bands down the table, then a straight line through them. */
function leans(image: RgbaImage): { lean: number; spread: number } {
  const per = RULES_X.map((r) => {
    let x = r * W;
    const ys: number[] = [];
    const xs: number[] = [];
    for (let y0 = Math.round(0.2 * H); y0 < 0.82 * H; y0 += 20) {
      let sum = 0;
      let weight = 0;
      for (let y = y0; y < y0 + 20; y += 1) {
        for (let xx = Math.round(x) - 10; xx <= Math.round(x) + 10; xx += 1) {
          const dark = Math.max(0, 200 - image.data[(y * W + xx) * 4]);
          sum += xx * dark;
          weight += dark;
        }
      }
      if (weight === 0) continue;
      x = sum / weight;
      ys.push(y0 + 10);
      xs.push(x);
    }
    const my = ys.reduce((t, v) => t + v, 0) / ys.length;
    const mx = xs.reduce((t, v) => t + v, 0) / xs.length;
    let num = 0;
    let den = 0;
    ys.forEach((y, i) => { num += (y - my) * (xs[i] - mx); den += (y - my) ** 2; });
    return num / den;
  });
  return { lean: per.reduce((t, v) => t + v, 0) / per.length, spread: Math.max(...per) - Math.min(...per) };
}

/** The middle row's tilt (pixels down per pixel across), traced like the rules but sideways. */
function rowLean(image: RgbaImage): number {
  let y = ROWS_Y[4] * H;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let x0 = Math.round(0.15 * W); x0 < 0.85 * W; x0 += 20) {
    let sum = 0;
    let weight = 0;
    for (let x = x0; x < x0 + 20; x += 1) {
      for (let yy = Math.round(y) - 10; yy <= Math.round(y) + 10; yy += 1) {
        const dark = Math.max(0, 200 - image.data[(yy * W + x) * 4]);
        sum += yy * dark;
        weight += dark;
      }
    }
    if (weight === 0) continue;
    y = sum / weight;
    xs.push(x0 + 10);
    ys.push(y);
  }
  const mx = xs.reduce((t, v) => t + v, 0) / xs.length;
  const my = ys.reduce((t, v) => t + v, 0) / ys.length;
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
  return num / den;
}

const flatten = (src: RgbaImage) => warpAlong(src, pageMap(FULL, 0, measureBend(src, UNIT, 0, W, H)), W, H);

describe('vertical rules', () => {
  it('leave a straight table alone', () => {
    expect(isFlat(measureBend(form(straight), UNIT, 0, W, H))).toBe(true);
  });

  it('straighten rules that fan apart down the page', () => {
    // A corner a little off: the table is 1.5% of the width wider at the bottom than at the top.
    const src = form((x, y) => {
      const v = y / H;
      return { x: 0.5 + (x / W - 0.5) / (1 + 0.03 * (v - 0.5)), y: v };
    });
    expect(leans(src).spread).toBeGreaterThan(0.008);
    const bend = measureBend(src, UNIT, 0, W, H);
    expect(bend.columns).not.toBeNull();
    expect(leans(flatten(src)).spread).toBeLessThan(0.003);
  });

  it('straighten rules that all lean while the rows stay level (a shear)', () => {
    const src = form((x, y) => ({ x: (x - 0.01 * (y - H / 2)) / W, y: y / H }));
    expect(Math.abs(leans(src).lean)).toBeGreaterThan(0.008);
    expect(measureBend(src, UNIT, 0, W, H).columns).not.toBeNull();
    expect(Math.abs(leans(flatten(src)).lean)).toBeLessThan(0.002);
  });

  it('square a form turned half a degree: rows level, rules plumb', () => {
    const src = form(turned(0.5));
    expect(Math.abs(leans(src).lean)).toBeGreaterThan(0.007);
    expect(Math.abs(rowLean(src))).toBeGreaterThan(0.007);
    const flat = flatten(src);
    expect(Math.abs(leans(flat).lean)).toBeLessThan(0.002);
    expect(Math.abs(rowLean(flat))).toBeLessThan(0.002);
  });

  it('leave a turned form with too few rows to read its rotation by', () => {
    // Only the top and bottom rules: no rows to tell a rotation from a shear, so the lean stays.
    const src = form(turned(1), [0.15, 0.87]);
    const before = leans(src).lean;
    expect(Math.abs(leans(flatten(src)).lean - before)).toBeLessThan(0.002);
  });

  it('find no rules on a page of text', () => {
    const data = new Uint8ClampedArray(W * H).fill(230);
    for (let row = 0; row < 30; row += 1) {
      const y0 = 100 + row * 33;
      for (let x = 80; x < 820; x += 1) if ((x * 7 + row * 13) % 50 < 38) for (let y = y0; y < y0 + 12; y += 1) data[y * W + x] = 40;
    }
    expect(columnFit(pageMasks({ width: W, height: H, data }))).toBeNull();
  });
});
