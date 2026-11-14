import { describe, expect, it } from 'vitest';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import { cornerError } from './kpi.ts';
import { guessCorners } from './index.ts';
import { addNoise, fillQuad, fillRect, norm, solid } from './testImages.ts';

const W = 320;
const H = 427;
const truthOf = (q: Quad): Quad => q.map((p) => norm(p, W, H)) as Quad;
const PAGE: Quad = [{ x: 60, y: 40 }, { x: 260, y: 44 }, { x: 262, y: 390 }, { x: 58, y: 386 }];

/** A page whose text block has a gap and a dark figure across its middle, on a dark table. */
function pageWithFigure() {
  const img = solid(W, H, 120);
  fillQuad(img, PAGE, 225);
  // Text lines in the upper and lower halves, a wide empty band with a dark rule between them,
  // and the lower page shading off toward the bottom as a photographed page does.
  for (let y = 60; y < 360; y += 12) if (y < 190 || y > 230) fillRect(img, 80, y, 160, 4, 40);
  for (let y = 230; y < 390; y += 1) for (let x = 60; x < 260; x += 1) if (img.data[y * W + x] === 225) img.data[y * W + x] = 225 - (y - 230) * 0.5;
  fillRect(img, 62, 205, 196, 14, 70);
  addNoise(img, 5, 7);
  return img;
}

describe('a page cut by a wide blank band and a dark figure', () => {
  it('is found whole, not as its top or bottom half', () => {
    const guess = guessCorners(pageWithFigure());
    expect(guess).not.toBeNull();
    expect(cornerError(guess!, truthOf(PAGE))).toBeLessThan(0.05);
  });
});

/** A page spread across the frame (the facing page as white as the page, no table at its sides) under
 * a strip of grayer table that runs along the top, as a book on a desk does. */
describe('a page under a strip of grayer table that reaches the frame top', () => {
  it('has its top edge at the page, not on the frame border', () => {
    const img = solid(W, H, 60);
    for (let y = 0; y < 40; y += 1) fillRect(img, 0, y, W, 1, 175 + y * 0.5 + (y > 34 ? (y - 34) * 3 : 0));
    fillRect(img, 0, 40, W, 350, 225);
    fillRect(img, 56, 40, 4, 350, 150); // the gutter between the two pages
    for (let y = 60; y < 360; y += 12) fillRect(img, 80, y, 160, 4, 60);
    addNoise(img, 5, 9);
    const truth: Quad = [{ x: 0, y: 40 }, { x: W, y: 40 }, { x: W, y: 390 }, { x: 0, y: 390 }].map((p) => norm(p, W, H)) as Quad;
    const guess = guessCorners(img);
    expect(guess).not.toBeNull();
    expect(cornerError(guess!, truth)).toBeLessThan(0.05);
  });
});
