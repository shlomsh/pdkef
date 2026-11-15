import { describe, expect, it } from 'vitest';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import { cutAtFold } from './fold.ts';
import { addNoise, fillRect, griddedSheet, norm, ruledSheet, solid, TWO_PAGES_CREASE, twoPages } from './testImages.ts';

const W = 320;
const H = 427;
const CREASE = TWO_PAGES_CREASE;
const guessOf = (x0: number, x1: number): Quad => [{ x: x0, y: 40 }, { x: x1, y: 40 }, { x: x1, y: 390 }, { x: x0, y: 390 }].map((p) => norm(p, W, H)) as Quad;
const RULED_TRUTH: Quad = [{ x: 16, y: 20 }, { x: 304, y: 20 }, { x: 304, y: 380 }, { x: 16, y: 380 }].map((p) => norm(p, 320, 400)) as Quad;

describe('cutAtFold', () => {
  it('does not cut a single sheet at its printed box rule', () => {
    const guess = RULED_TRUTH.map((p) => ({ x: p.x, y: p.y })) as Quad;
    expect(cutAtFold(ruledSheet(), guess).folds).toEqual([]);
  });

  it('does not cut a single sheet at a printed vertical rule with text on both sides', () => {
    expect(cutAtFold(griddedSheet(), RULED_TRUTH).folds).toEqual([]);
  });

  it('moves a side that ran onto the facing page in to a thin crease', () => {
    const cut = cutAtFold(twoPages((img) => fillRect(img, CREASE - 1, 40, 2, 350, 120)), guessOf(30, W - 1));
    const got = cut.quad;
    expect(cut.folds).toEqual([1]);
    expect(Math.abs(got[1].x - CREASE / W)).toBeLessThan(0.01);
    expect(Math.abs(got[2].x - CREASE / W)).toBeLessThan(0.01);
    expect(got[0]).toEqual(guessOf(30, W - 1)[0]);
  });

  it('moves it in to a wide shadow valley, at its darkest', () => {
    const cut = cutAtFold(twoPages((img) => { for (let i = -6; i < 6; i += 1) fillRect(img, CREASE + i, 40, 1, 350, 140 + Math.abs(i + 0.5) * 10); }), guessOf(30, W - 1));
    const got = cut.quad;
    expect(cut.folds).toEqual([1]);
    expect(Math.abs(got[1].x - CREASE / W)).toBeLessThan(0.02);
    expect(Math.abs(got[2].x - CREASE / W)).toBeLessThan(0.02);
  });

  it('leaves a page of dense text lines with no fold unchanged', () => {
    const img = solid(W, H, 200);
    for (let y = 20; y < 410; y += 8) for (let x = 10; x < W - 10; x += 7) fillRect(img, x, y, 5, 3, 50);
    addNoise(img, 4, 5);
    const guess = guessOf(2, W - 2);
    expect(cutAtFold(img, guess)).toEqual({ quad: guess, folds: [] });
  });

  it('leaves a guess with no side near its frame edge unchanged', () => {
    const img = twoPages();
    const guess = guessOf(70, 240);
    expect(cutAtFold(img, guess)).toEqual({ quad: guess, folds: [] });
  });
});
