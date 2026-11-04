import { describe, expect, it } from 'vitest';
import { gray, leaning } from '#lib/pageEnhance/leaning.test-helper.ts';
import { assess, type Assessment } from '#lib/pageEnhance/plan.ts';
import { imageCover, MIN_IMAGE_COVER, samplePages, scanVerdict } from './scanCheck.ts';

const OPS = { save: 10, restore: 11, transform: 12, paintImageXObject: 85, paintInlineImageXObject: 86, paintImageMaskXObject: 83, showText: 44 };

const sheet = (over: Partial<Assessment> = {}): Assessment => ({
  turn: 0, turnConfidence: 0, spine: null, leans: [0], bentPx: 0, crooked: false, ...over,
});
const SPINE = { top: 0.5, bottom: 0.5 } as unknown as Assessment['spine'];
const crooked = (over: Partial<Assessment> = {}) => sheet({ crooked: true, ...over });

describe('samplePages', () => {
  it('takes every page of a short file, first included', () => {
    expect(samplePages(1)).toEqual([1]);
    expect(samplePages(5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('skips the cover once there are more than five pages', () => {
    expect(samplePages(6)).toEqual([2, 3, 4, 5, 6]);
  });

  it('spreads five pages evenly over a long file, last page included', () => {
    expect(samplePages(200)).toEqual([2, 52, 101, 151, 200]);
    expect(samplePages(200)).toEqual(samplePages(200));
  });
});

describe('scanVerdict', () => {
  it('is straight for no sheets', () => {
    expect(scanVerdict([])).toBe('straight');
  });

  it('keeps one crooked sheet out of five as straight', () => {
    expect(scanVerdict([crooked({ spine: SPINE }), sheet(), sheet(), sheet(), sheet()])).toBe('straight');
  });

  it('flags at half the sheets, and names a spread before everything else', () => {
    const sheets = [crooked({ spine: SPINE, turn: 1 }), crooked({ spine: SPINE, turn: 1 }), sheet(), sheet()];
    expect(scanVerdict(sheets)).toBe('spread');
  });

  it('names sideways when the spines are too few', () => {
    expect(scanVerdict([crooked({ turn: 1, spine: SPINE }), crooked({ turn: 1, spine: SPINE }), crooked({ turn: 1 }), sheet(), sheet()])).toBe('sideways');
  });

  it('names lean past the bar, then bend', () => {
    expect(scanVerdict([crooked({ leans: [1.2] }), crooked({ leans: [-0.9] }), sheet()])).toBe('lean');
    expect(scanVerdict([crooked({ leans: [0.2], bentPx: 6 }), crooked({ bentPx: 5 }), sheet()])).toBe('bent');
  });
});

describe('a synthetic sheet through assess', () => {
  const W = 800;
  const H = 500;
  /** Two pages on one sheet leaning apart, with a spine between them. */
  function spread() {
    const left = leaning(W, H, -3.5, 0, 400);
    const right = leaning(W, H, 2.5, 400, W);
    const data = left.data.map((v, i) => Math.min(v, right.data[i]));
    for (let y = 0; y < H; y += 1) for (let x = 399; x < 402; x += 1) data.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 3);
    return gray({ width: W, height: H, data });
  }

  it('reads a spread', () => {
    const a = assess(spread());
    expect(scanVerdict([a, a, a])).toBe('spread');
  });

  it('reads a level page as straight', () => {
    const a = assess(gray(leaning(W, H, 0)));
    expect(scanVerdict([a, a, a])).toBe('straight');
  });
});

describe('imageCover', () => {
  const ops = (fnArray: number[], argsArray: unknown[][]) => ({ fnArray, argsArray });
  /** One image of `a` by `d` units placed at (`e`, `f`), inside save and restore. */
  const one = (a: number, d: number, e = 0, f = 0) => ops([OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore], [[], [a, 0, 0, d, e, f], ['img', 1, 1], []]);
  const W = 600;
  const H = 800;

  it('is 1 for one image over the whole page', () => {
    expect(imageCover(one(W, H), W, H, OPS)).toBe(1);
  });

  it('adds strips of one scan together', () => {
    const fn: number[] = [];
    const args: unknown[][] = [];
    for (let i = 0; i < 4; i += 1) {
      fn.push(OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore);
      args.push([], [W, 0, 0, H / 4, 0, (H / 4) * i], ['s', 1, 1], []);
    }
    expect(imageCover(ops(fn, args), W, H, OPS)).toBeCloseTo(1);
  });

  it('keeps a half-page figure under the bar', () => {
    const cover = imageCover(one(W, H / 2), W, H, OPS);
    expect(cover).toBeCloseTo(0.5);
    expect(cover).toBeLessThan(MIN_IMAGE_COVER);
  });

  it('follows a scale and translate nested inside save and restore', () => {
    const fn = [OPS.save, OPS.transform, OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore, OPS.restore, OPS.paintImageXObject];
    const args = [[], [W, 0, 0, H, 0, 0], [], [0.5, 0, 0, 0.5, 0.25, 0.25], ['img', 1, 1], [], [], ['out', 1, 1]];
    // The inner image covers a quarter; after both restores the last one is under the identity, one unit square of a 600x800 page.
    expect(imageCover(ops(fn, args), W, H, OPS)).toBeCloseTo(0.25 + 1 / (W * H));
  });

  it('is 0 for text operations only', () => {
    expect(imageCover(ops([OPS.save, OPS.showText, OPS.restore], [[], [], []]), W, H, OPS)).toBe(0);
  });

  it('still counts a full-page image with text on top', () => {
    const fn = [OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore, OPS.showText, OPS.showText];
    const args = [[], [W, 0, 0, H, 0, 0], ['img', 1, 1], [], [], []];
    expect(imageCover(ops(fn, args), W, H, OPS)).toBe(1);
  });

  it('clips an image that overhangs the page and reads a view box that starts away from zero', () => {
    const fn = [OPS.transform, OPS.paintImageXObject];
    expect(imageCover(ops(fn, [[2 * W, 0, 0, H, -1.5 * W, 0], ['i', 1, 1]]), W, H, OPS)).toBe(0.5);
    expect(imageCover(ops(fn, [[W, 0, 0, H, 100, 50], ['i', 1, 1]]), W, H, OPS, { x: 100, y: 50 })).toBe(1);
  });
});
