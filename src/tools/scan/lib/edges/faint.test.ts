import { describe, expect, it } from 'vitest';
import type { GrayImage, Quad } from '../quad.ts';
import { detectPage } from './detect.ts';
import { guessCorners } from './index.ts';
import { buildEdgeMap, faintOutline, outlineFromMap } from './outline.ts';
import { guessByScoredRegions } from './scoredRegions.ts';
import { addNoise, fillQuad, fillRect, solid } from './testImages.ts';

// A white form on a white table (SCAN-33), built like Shlomi's iPhone photo of one: the page is five gray
// levels darker than the table, with a thin shadow along two sides, a dark wall behind the table and a
// dark floor in front, and a printed box and text whose black ink sets the edge floor far above the
// page's own sides.
const W = 240;
const H = 320;
const PAGE: Quad = [{ x: 40, y: 58 }, { x: 196, y: 56 }, { x: 222, y: 240 }, { x: 22, y: 244 }];
const truth = PAGE.map((p) => ({ x: p.x / W, y: p.y / H })) as Quad;
const err = (q: Quad | null) => (q ? Math.max(...q.map((p, i) => Math.max(Math.abs(p.x - truth[i].x), Math.abs(p.y - truth[i].y)))) : Infinity);

function table(): GrayImage {
  const img = solid(W, H, 216);
  fillRect(img, 0, 0, W, 46, 25);
  fillRect(img, 0, 296, W, 24, 30);
  return img;
}

function whiteOnWhite(): GrayImage {
  const img = table();
  fillQuad(img, PAGE, 211);
  fillQuad(img, [{ x: 21, y: 244 }, { x: 222, y: 240 }, { x: 222, y: 242 }, { x: 21, y: 246 }], 200);
  fillQuad(img, [{ x: 39, y: 58 }, { x: 41, y: 58 }, { x: 23, y: 244 }, { x: 21, y: 244 }], 202);
  fillQuad(img, [{ x: 62, y: 100 }, { x: 180, y: 98 }, { x: 190, y: 205 }, { x: 56, y: 208 }], 40);
  fillQuad(img, [{ x: 64, y: 102 }, { x: 178, y: 100 }, { x: 188, y: 203 }, { x: 58, y: 206 }], 211);
  for (let r = 0; r < 9; r += 1) fillRect(img, 70 + (r % 3) * 6, 108 + r * 11, 90 - (r % 4) * 12, 3, 60);
  for (let r = 0; r < 3; r += 1) fillRect(img, 75, 70 + r * 8, 100, 2, 70);
  addNoise(img, 2, 1);
  return img;
}

describe('a white page on a white table', () => {
  const image = whiteOnWhite();

  it('is a case the outline and brightness both miss', () => {
    expect(outlineFromMap(buildEdgeMap(image))).toBeNull();
    expect(err(guessByScoredRegions(image))).toBeGreaterThan(0.08);
  });

  it('is found by its faint sides', () => {
    expect(faintOutline(buildEdgeMap(image))).not.toBeNull();
    expect(err(guessCorners(image))).toBeLessThan(0.02);
  });

  it('is found on the live camera too, flagged as low contrast', () => {
    const got = detectPage(image);
    expect(err(got.quad)).toBeLessThan(0.02);
    expect(got.confidence).toBeGreaterThan(0);
    expect(got.lowContrast).toBe(true);
  });

  it('with no page on the table, the camera finds none rather than outlining the table', () => {
    const empty = table();
    addNoise(empty, 2, 1);
    expect(detectPage(empty)).toEqual({ quad: null, confidence: 0, lowContrast: false });
  });
});
