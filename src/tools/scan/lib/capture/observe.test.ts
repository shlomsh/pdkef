import { describe, expect, it } from 'vitest';
import { observeFrame } from './observe.ts';
import { fillQuad, solid } from '../edges/testImages.ts';
import type { Quad } from '../quad.ts';

const PAGE: Quad = [{ x: 60, y: 50 }, { x: 250, y: 60 }, { x: 240, y: 360 }, { x: 55, y: 350 }];

describe('observeFrame', () => {
  it('reads a page: quad, confidence, area, hash and the time passed in', () => {
    const img = solid(320, 427, 70);
    fillQuad(img, PAGE, 220);
    const got = observeFrame(img, 1234);
    expect(got.t).toBe(1234);
    expect(got.quad).not.toBeNull();
    expect(got.confidence).toBeGreaterThan(0);
    expect(got.area).toBeGreaterThan(0);
    expect(got.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('reads an empty frame: no quad, zero confidence, sharpness and area, a whole-frame hash', () => {
    const got = observeFrame(solid(320, 427, 128), 5);
    expect(got.t).toBe(5);
    expect(got.quad).toBeNull();
    expect(got.confidence).toBe(0);
    expect(got.sharpness).toBe(0);
    expect(got.area).toBe(0);
    expect(got.hash).toMatch(/^[0-9a-f]{16}$/);
  });
});
