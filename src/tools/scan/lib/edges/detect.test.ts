import { describe, expect, it } from 'vitest';
import { detectPage, CONFIDENT } from './detect.ts';
import { cornerError } from './kpi.ts';
import { addNoise, fillQuad, fillRect, norm, solid } from './testImages.ts';
import type { Quad } from '#lib/pageEnhance/quad.ts';

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

  it('fits the found outline to the paper, so a top edge stopped inside the page moves out to it', () => {
    // A white page under a strip of grayer table at the frame top; the edges alone stop at the text block.
    const W = 320;
    const H = 427;
    const img = solid(W, H, 60);
    for (let y = 0; y < 40; y += 1) fillRect(img, 0, y, W, 1, 175 + y * 0.5);
    fillRect(img, 40, 40, 240, 350, 225);
    for (let y = 60; y < 360; y += 12) fillRect(img, 80, y, 160, 4, 60);
    addNoise(img, 5, 9);
    const truth: Quad = [{ x: 40, y: 40 }, { x: 280, y: 40 }, { x: 280, y: 390 }, { x: 40, y: 390 }].map((p) => norm(p, W, H)) as Quad;
    const got = detectPage(img);
    expect(got.quad).not.toBeNull();
    expect(cornerError(got.quad!, truth)).toBeLessThan(0.03);
  });

  it('finds a page whose brightness guess runs to the frame top, by fitting the guess before scoring it', () => {
    // A page under a strip darker than the table, with no outline or faint outline to find: the brightness
    // guess takes strip and page together, its top side lies on the frame border and has no edge to score,
    // so unfitted it scores 0 and no page is found.
    const W = 320;
    const H = 427;
    const img = solid(W, H, 160);
    fillRect(img, 0, 0, W, 40, 150);
    fillRect(img, 10, 40, 300, 350, 200);
    for (let y = 60; y < 360; y += 12) fillRect(img, 80, y, 160, 4, 60);
    addNoise(img, 5, 9);
    const truth: Quad = [{ x: 10, y: 40 }, { x: 310, y: 40 }, { x: 310, y: 390 }, { x: 10, y: 390 }].map((p) => norm(p, W, H)) as Quad;
    const got = detectPage(img);
    expect(got.quad).not.toBeNull();
    expect(cornerError(got.quad!, truth)).toBeLessThan(0.05);
  });
});
