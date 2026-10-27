import { describe, expect, it } from 'vitest';
import type { GrayImage, Point, Quad } from '../quad.ts';
import { guessByBrightRegion } from './brightRegion.ts';
import { addGradient, addNoise, fillQuad, fillRect, norm, solid } from './testImages.ts';

const W = 320;
const H = 240;

function scene(page: Quad, opts: { noise?: number; gradient?: number } = {}): GrayImage {
  const img = solid(W, H, 50);
  fillQuad(img, page, 200);
  if (opts.gradient) addGradient(img, opts.gradient);
  if (opts.noise) addNoise(img, opts.noise, 7);
  return img;
}

function expectNear(got: Quad | null, truth: Quad, tol = 0.03) {
  expect(got).not.toBeNull();
  truth.forEach((t, i) => {
    const e = norm(t, W, H);
    expect(Math.abs(got![i].x - e.x)).toBeLessThan(tol);
    expect(Math.abs(got![i].y - e.y)).toBeLessThan(tol);
  });
}

function rotated(cx: number, cy: number, hw: number, hh: number, deg: number): Quad {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const pts: Point[] = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => ({ x: cx + x * c - y * s, y: cy + x * s + y * c }));
  return pts as Quad;
}

describe('guessByBrightRegion', () => {
  it('finds a page tilted 10 degrees with noise and a lighting gradient', () => {
    const page = rotated(160, 120, 90, 70, 10);
    const got = guessByBrightRegion(scene(page, { noise: 12, gradient: 40 }));
    expectNear(got, page);
    expect(got![0].x + got![0].y).toBeLessThan(got![2].x + got![2].y); // ordered: index 0 is the top-left
    expect(got![1].x).toBeGreaterThan(got![0].x);
    expect(got![3].y).toBeGreaterThan(got![0].y);
  });

  it('finds a page with perspective', () => {
    const page: Quad = [{ x: 90, y: 40 }, { x: 240, y: 40 }, { x: 290, y: 210 }, { x: 50, y: 210 }];
    expectNear(guessByBrightRegion(scene(page, { noise: 10 })), page);
  });

  it('is not broken by dark text bars inside the page', () => {
    const page = rotated(160, 120, 95, 75, -6);
    const img = scene(page, { noise: 8 });
    for (let i = 0; i < 8; i += 1) fillRect(img, 100, 70 + i * 12, 120, 4, 40);
    expectNear(guessByBrightRegion(img), page);
  });

  it('returns null for a uniform image', () => {
    expect(guessByBrightRegion(solid(W, H, 128))).toBeNull();
  });

  it('returns null for pure noise', () => {
    const img = solid(W, H, 128);
    addNoise(img, 100, 3);
    expect(guessByBrightRegion(img)).toBeNull();
  });

  it('returns null for a page that is only 5% of the frame', () => {
    const page: Quad = [{ x: 140, y: 105 }, { x: 180, y: 105 }, { x: 180, y: 140 }, { x: 140, y: 140 }];
    expect(guessByBrightRegion(scene(page, { noise: 5 }))).toBeNull();
  });

  it('returns null when the page fills the whole frame', () => {
    const img = solid(W, H, 200);
    fillRect(img, 0, 0, W, 3, 50); // a sliver of table so Otsu has two classes
    expect(guessByBrightRegion(img)).toBeNull();
  });
});
