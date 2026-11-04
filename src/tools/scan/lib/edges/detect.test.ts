import { describe, expect, it } from 'vitest';
import { detectPage, CONFIDENT } from './detect.ts';
import { fillQuad, solid } from './testImages.ts';
import type { Quad } from '../quad.ts';

const PAGE: Quad = [{ x: 60, y: 50 }, { x: 250, y: 60 }, { x: 240, y: 360 }, { x: 55, y: 350 }];

function pageOnTable() {
  const img = solid(320, 427, 70);
  fillQuad(img, PAGE, 220);
  return img;
}

describe('detectPage', () => {
  it('finds a clear page with a confident score', () => {
    const got = detectPage(pageOnTable());
    expect(got.quad).not.toBeNull();
    expect(got.confidence).toBeGreaterThanOrEqual(CONFIDENT);
    expect(got.confidence).toBeLessThanOrEqual(1);
    got.quad!.forEach((p, i) => {
      expect(Math.abs(p.x - PAGE[i].x / 320)).toBeLessThan(0.04);
      expect(Math.abs(p.y - PAGE[i].y / 427)).toBeLessThan(0.04);
    });
  });

  it('returns no quad and zero confidence on an empty frame', () => {
    expect(detectPage(solid(320, 427, 128))).toEqual({ quad: null, confidence: 0, lowContrast: false });
  });
});
