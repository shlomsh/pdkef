import { describe, expect, it } from 'vitest';
import { borderContrast, keystone, lightFloor } from './pageSignals.ts';
import { addNoise, fillQuad, solid } from '../edges/testImages.ts';
import type { Quad } from '../quad.ts';

const W = 320;
const H = 427;
const PX: Quad = [{ x: 60, y: 50 }, { x: 260, y: 55 }, { x: 255, y: 370 }, { x: 58, y: 365 }];
const norm = (q: Quad): Quad => q.map((p) => ({ x: p.x / W, y: p.y / H })) as Quad;

/** A white page (225) with a few lines of print, on a surface of `bg`, with sensor-like noise. */
function scene(bg: number, quad: Quad = PX) {
  const img = solid(W, H, bg);
  fillQuad(img, quad, 225);
  for (let y = quad[0].y + 30; y < quad[2].y - 30; y += 14) {
    fillQuad(img, [{ x: quad[0].x + 20, y }, { x: quad[1].x - 30, y }, { x: quad[1].x - 30, y: y + 4 }, { x: quad[0].x + 20, y: y + 4 }], 60);
  }
  addNoise(img, 6, 1);
  return img;
}

describe('borderContrast', () => {
  it('reads the step from page to surface, over 255', () => {
    expect(borderContrast(scene(40), norm(PX))).toBeCloseTo(185 / 255, 1);
    expect(borderContrast(scene(140), norm(PX))).toBeCloseTo(85 / 255, 1);
    expect(borderContrast(scene(200), norm(PX))!).toBeLessThan(0.15);
  });

  it('falls as the surface lightens', () => {
    const steps = [40, 100, 140, 170, 200].map((bg) => borderContrast(scene(bg), norm(PX))!);
    for (let i = 1; i < steps.length; i += 1) expect(steps[i]).toBeLessThan(steps[i - 1]);
  });

  it('is the same for a dark page on a light surface', () => {
    const img = solid(W, H, 225);
    fillQuad(img, PX, 40);
    expect(borderContrast(img, norm(PX))).toBeCloseTo(185 / 255, 2);
  });

  it('skips sides with no view past them, and is null when no side has one', () => {
    const img = solid(W, H, 40);
    const right: Quad = [{ x: 60, y: 50 }, { x: W, y: 50 }, { x: W, y: 370 }, { x: 60, y: 370 }];
    fillQuad(img, right, 225);
    expect(borderContrast(img, norm(right))).toBeCloseTo(185 / 255, 2);
    expect(borderContrast(solid(W, H, 225), [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])).toBeNull();
  });
});

describe('keystone', () => {
  it('is 1 for a page seen straight on, in the frame\'s own pixels', () => {
    expect(keystone(norm(PX), W, H)).toBeGreaterThan(0.95);
    // A square in pixels is a rectangle in normalized units: the ratio is of pixel lengths.
    expect(keystone([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }], W, H)).toBeCloseTo(1, 5);
  });

  it('is the far side over the near side for a phone tipped back', () => {
    const tipped: Quad = [{ x: 0.3, y: 0.15 }, { x: 0.7, y: 0.15 }, { x: 0.9, y: 0.85 }, { x: 0.1, y: 0.85 }];
    expect(keystone(tipped, W, H)).toBeCloseTo(0.5, 5);
  });

  it('takes the steeper of the two pairs', () => {
    const sideways: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.3 }, { x: 0.9, y: 0.7 }, { x: 0.1, y: 0.9 }];
    expect(keystone(sideways, W, H)).toBeCloseTo(0.5, 5);
  });
});

describe('lightFloor', () => {
  it('stays low with a dark surface in view, page or not', () => {
    expect(lightFloor(scene(40))).toBeLessThan(0.25);
    expect(lightFloor(solid(W, H, 40))).toBeCloseTo(40 / 255, 5);
  });

  it('is high on a light surface, with or without a page on it', () => {
    expect(lightFloor(scene(200))).toBeGreaterThan(0.7);
    const table = solid(W, H, 200);
    addNoise(table, 6, 3);
    expect(lightFloor(table)).toBeGreaterThan(0.7);
  });

  it('is the darkest fifth: a page on three quarters of a dark desk still reads the desk, one on nine tenths does not', () => {
    const img = solid(W, H, 40);
    fillQuad(img, [{ x: 22, y: 29 }, { x: 298, y: 29 }, { x: 298, y: 398 }, { x: 22, y: 398 }], 225);
    expect(lightFloor(img)).toBeCloseTo(40 / 255, 5);
    fillQuad(img, [{ x: 8, y: 11 }, { x: 312, y: 11 }, { x: 312, y: 416 }, { x: 8, y: 416 }], 225);
    expect(lightFloor(img)).toBeCloseTo(225 / 255, 5);
  });
});
