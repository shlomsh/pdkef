import { describe, expect, it } from 'vitest';
import { observeFrame } from './observe.ts';
import { focusMeasure } from './sharpness.ts';
import { fillQuad, solid } from '../edges/testImages.ts';
import type { Quad } from '../quad.ts';

const PAGE: Quad = [{ x: 60, y: 50 }, { x: 250, y: 60 }, { x: 240, y: 360 }, { x: 55, y: 350 }];

describe('observeFrame', () => {
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
