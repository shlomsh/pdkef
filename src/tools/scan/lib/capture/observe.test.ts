import { describe, expect, it } from 'vitest';
import { observeFrame } from './observe.ts';
import { focusMeasure } from './sharpness.ts';
import { addNoise, fillQuad, fillRect, solid } from '../edges/testImages.ts';
import type { Quad } from '#lib/pageEnhance/quad.ts';

const PAGE: Quad = [{ x: 60, y: 50 }, { x: 250, y: 60 }, { x: 240, y: 360 }, { x: 55, y: 350 }];

// A white page on a white table, as in edges/faint.test.ts: found only through the faint-outline pass.
const FAINT_PAGE: Quad = [{ x: 40, y: 58 }, { x: 196, y: 56 }, { x: 222, y: 240 }, { x: 22, y: 244 }];
function whiteOnWhite() {
  const img = solid(240, 320, 216);
  fillRect(img, 0, 0, 240, 46, 25);
  fillRect(img, 0, 296, 240, 24, 30);
  fillQuad(img, FAINT_PAGE, 211);
  fillQuad(img, [{ x: 21, y: 244 }, { x: 222, y: 240 }, { x: 222, y: 242 }, { x: 21, y: 246 }], 200);
  fillQuad(img, [{ x: 39, y: 58 }, { x: 41, y: 58 }, { x: 23, y: 244 }, { x: 21, y: 244 }], 202);
  fillQuad(img, [{ x: 62, y: 100 }, { x: 180, y: 98 }, { x: 190, y: 205 }, { x: 56, y: 208 }], 40);
  fillQuad(img, [{ x: 64, y: 102 }, { x: 178, y: 100 }, { x: 188, y: 203 }, { x: 58, y: 206 }], 211);
  for (let r = 0; r < 9; r += 1) fillRect(img, 70 + (r % 3) * 6, 108 + r * 11, 90 - (r % 4) * 12, 3, 60);
  for (let r = 0; r < 3; r += 1) fillRect(img, 75, 70 + r * 8, 100, 2, 70);
  addNoise(img, 2, 1);
  return img;
}

describe('observeFrame', () => {
  it('reads a page found only by its faint edges as zero contrast, a plain dark-desk page by its measure', () => {
    const faint = observeFrame(whiteOnWhite(), 0, null);
    expect(faint.quad).not.toBeNull();
    expect(faint.contrast).toBe(0);
    const desk = solid(320, 427, 70);
    fillQuad(desk, PAGE, 220);
    expect(observeFrame(desk, 0, null).contrast).toBeGreaterThan(0);
  });

  it('reads a page: quad, confidence, area, hash and the time passed in', () => {
    const img = solid(320, 427, 70);
    fillQuad(img, PAGE, 220);
    const got = observeFrame(img, 1234, null);
    expect(got.t).toBe(1234);
    expect(got.quad).not.toBeNull();
    expect(got.confidence).toBeGreaterThan(0);
    expect(got.area).toBeGreaterThan(0);
    expect(got.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('reads the guidance signals: contrast and keystone of the page found, the light floor of the frame', () => {
    const img = solid(320, 427, 70);
    fillQuad(img, PAGE, 220);
    const got = observeFrame(img, 0, null);
    expect(got.contrast).toBeCloseTo(150 / 255, 1);
    expect(got.keystone).toBeGreaterThan(0.9);
    expect(got.light).toBeCloseTo(70 / 255, 5);
    const empty = observeFrame(solid(320, 427, 200), 0, null);
    expect(empty.contrast).toBeUndefined();
    expect(empty.keystone).toBeUndefined();
    expect(empty.light).toBeCloseTo(200 / 255, 5);
  });

  it('reads an empty frame: no quad, zero confidence, sharpness and area, a whole-frame hash', () => {
    const got = observeFrame(solid(320, 427, 128), 5, null);
    expect(got.t).toBe(5);
    expect(got.quad).toBeNull();
    expect(got.confidence).toBe(0);
    expect(got.sharpness).toBe(0);
    expect(got.area).toBe(0);
    expect(got.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('measures focus on the patch, and is 0 without one', () => {
    const patch = solid(64, 64, 0);
    for (let y = 0; y < 64; y += 1) for (let x = 0; x < 64; x += 1) patch.data[y * 64 + x] = (x >> 2) % 2 ? 255 : 0;
    expect(observeFrame(solid(320, 427, 128), 5, patch).focus).toBe(focusMeasure(patch));
    expect(observeFrame(solid(320, 427, 128), 5, patch).focus).toBeGreaterThan(0);
    expect(observeFrame(solid(320, 427, 128), 5, null).focus).toBe(0);
  });
});
