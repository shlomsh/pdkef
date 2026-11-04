import { describe, expect, it } from 'vitest';
import { gray, leaning } from './leaning.test-helper.ts';
import { pageLean } from './lean.ts';
import { applyPiece } from './piece.ts';
import { spreadHalves } from './spine.ts';
import { levelQuad } from './lean.ts';
import { assess, planPage } from './plan.ts';
import type { RgbaImage } from './quad.ts';

const W = 800;
const H = 500;
const MARKER = { x0: 50, y0: 50, size: 8 };

/** Two pages drawn on one sheet, leaning apart, with a spine between them and a red marker on the left page. */
function spread(): RgbaImage {
  const left = leaning(W, H, -3.5, 0, 400);
  const right = leaning(W, H, 2.5, 400, W);
  const data = left.data.map((v, i) => Math.min(v, right.data[i]));
  for (let y = 0; y < H; y += 1) for (let x = 399; x < 402; x += 1) data.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 3);
  for (let y = MARKER.y0; y < MARKER.y0 + MARKER.size; y += 1) {
    for (let x = MARKER.x0; x < MARKER.x0 + MARKER.size; x += 1) data.set([255, 0, 0, 255], (y * W + x) * 4);
  }
  return { width: W, height: H, data };
}

/** The sheet turned a quarter counter-clockwise, as a phone held sideways would shoot it. */
function turnedCcw(src: RgbaImage): RgbaImage {
  const out = new Uint8ClampedArray(src.data.length);
  for (let y = 0; y < src.height; y += 1) {
    for (let x = 0; x < src.width; x += 1) out.set(src.data.subarray((y * src.width + x) * 4, (y * src.width + x) * 4 + 4), ((src.width - 1 - x) * src.height + y) * 4);
  }
  return { width: src.height, height: src.width, data: out };
}

const plan = (sheet: RgbaImage) => {
  const g = gray(sheet);
  const a = assess(g);
  const { pieces } = planPage(g, a, sheet);
  return { a, pages: pieces.map((piece) => applyPiece(sheet, piece)), pieces };
};

/** Where the marker's red pixels are in `out`, as the centre of mass, or null. */
function markerAt(out: RgbaImage): { x: number; y: number } | null {
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < out.width * out.height; i += 1) {
    if (out.data[i * 4] > 200 && out.data[i * 4 + 1] < 60) { n += 1; sx += i % out.width; sy += Math.floor(i / out.width); }
  }
  return n ? { x: sx / n, y: sy / n } : null;
}

describe('a spread with two leans', () => {
  for (const [name, make, turn] of [['upright', (s: RgbaImage) => s, 0], ['turned a quarter counter-clockwise', turnedCcw, 1]] as const) {
    it(`${name}: reads each page's own lean and levels each`, () => {
      const sheet = make(spread());
      const { a, pages } = plan(sheet);
      expect(a.turn).toBe(turn);
      expect(a.crooked).toBe(true);
      expect(a.leans).toHaveLength(2);
      expect(Math.abs(a.leans[0] - -3.5)).toBeLessThan(0.3);
      expect(Math.abs(a.leans[1] - 2.5)).toBeLessThan(0.3);
      expect(pages).toHaveLength(2);
      for (const page of pages) expect(Math.abs(pageLean(gray(page)))).toBeLessThan(0.3);
      const at = markerAt(pages[0]);
      expect(at).not.toBeNull();
      expect(at!.x).toBeLessThan(pages[0].width / 4);
      expect(at!.y).toBeLessThan(pages[0].height / 4);
      expect(markerAt(pages[1])).toBeNull();
    });
  }
});

describe('one page', () => {
  it('an upright level page needs nothing: one piece, the whole source', () => {
    const sheet = leaning(600, 800, 0);
    const { a, pieces } = plan(sheet);
    expect(a.crooked).toBe(false);
    expect(pieces).toHaveLength(1);
    expect(pieces[0].quad).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]);
    expect([pieces[0].width, pieces[0].height]).toEqual([600, 800]);
  });

  it('two columns with a rule between them are still one page', () => {
    const a = leaning(600, 800, 0, 40, 285);
    const b = leaning(600, 800, 0, 315, 560);
    const data = a.data.map((v, i) => Math.min(v, b.data[i]));
    for (let y = 0; y < 800; y += 1) data.fill(0, (y * 600 + 300) * 4, (y * 600 + 300) * 4 + 3);
    const { a: assessed, pieces } = plan({ width: 600, height: 800, data });
    expect(assessed.spine).toBeNull();
    expect(pieces).toHaveLength(1);
  });

  it('a page leaning 3 degrees is crooked and comes out level', () => {
    const { a, pages, pieces } = plan(leaning(600, 800, 3));
    expect(a.crooked).toBe(true);
    expect(pieces).toHaveLength(1);
    expect(Math.abs(pageLean(gray(pages[0])))).toBeLessThan(0.3);
  });

  it('sizes its pieces for the source, not for the small copy it was read from', () => {
    const small = leaning(600, 800, 3);
    const g = gray(small);
    const a = assess(g);
    const one = planPage(g, a, small).pieces[0];
    const big = planPage(g, a, { width: 1800, height: 2400 }).pieces[0];
    expect(big.width / one.width).toBeGreaterThan(2.9);
    expect(big.width / one.width).toBeLessThan(3.1);
    expect(big.height / one.height).toBeGreaterThan(2.9);
    expect(big.height / one.height).toBeLessThan(3.1);
  });
});

/** Justified rows from `left` to `right` (the block widening by `drift` at the bottom) and a 3 px spine line down the middle. */
function bookSheet(rowsLeft: number, rowsRight: number): RgbaImage {
  const w = 1000;
  const h = 600;
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  const bar = (x0: number, x1: number, y0: number) => {
    for (let y = y0; y < y0 + 11; y += 1) for (let x = x0; x < x1; x += 1) data.fill(20, (y * w + x) * 4, (y * w + x) * 4 + 3);
  };
  const rows = (count: number, left: number, right: number, drift: number) => {
    for (let r = 0; r < count; r += 1) {
      const d = (drift * r) / 17;
      for (let k = 0; k < 8; k += 1) {
        const l = left - d;
        const span = right + d - l;
        const x0 = Math.round(l + (k * span) / 8);
        bar(x0, Math.round(x0 + span / 8 - 6), 50 + r * 28);
      }
    }
  };
  rows(rowsLeft, 70, 440, 12);
  rows(rowsRight, 560, 930, 0);
  for (let y = 0; y < h; y += 1) data.fill(0, (y * w + 499) * 4, (y * w + 499) * 4 + 3), data.fill(0, (y * w + 501) * 4, (y * w + 501) * 4 + 3);
  return { width: w, height: h, data };
}

/** A two-page sheet whose justified rows lean by `degrees`, far enough that neighbouring rows overlap when read straight across. */
function leaningSpread(degrees: number): RgbaImage {
  const width = 1000;
  const height = 700;
  const half = leaning(width / 2, height, degrees, 40, width / 2 - 40);
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 0; y < height; y += 1) {
    for (const start of [0, width / 2]) data.set(half.data.subarray(y * half.width * 4, (y + 1) * half.width * 4), (y * width + start) * 4);
    for (let x = width / 2 - 2; x < width / 2 + 2; x += 1) data.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
  }
  return { width, height, data };
}

describe('found corners', () => {
  it('are read after the page is levelled, so rows that lean past each other still count', () => {
    const a = assess(gray(leaningSpread(3.5)));
    expect(a.spine).not.toBeNull();
    expect(a.corners.every(Boolean)).toBe(true);
  });

  it('square a half with a text block and leave a half with too few rows level', () => {
    const sheet = bookSheet(18, 4);
    const g = gray(sheet);
    const a = assess(g);
    expect(a.spine).not.toBeNull();
    expect(a.corners[0]).not.toBeNull();
    expect(a.corners[1]).toBeNull();
    const { pieces } = planPage(g, a, sheet);
    expect(pieces[0].quad).toEqual(a.corners[0]);
    const half = spreadHalves(a.spine!)[1];
    const level = levelQuad(half, a.leans[1], sheet.width, sheet.height);
    // The level rectangle, with the gutter cut off its spine side only.
    expect(pieces[1].quad[0].x).toBeGreaterThan(level[0].x);
    expect(pieces[1].quad[1].x).toBeCloseTo(level[1].x, 6);
  });

  it('leave the gutter out of both pages', () => {
    const sheet = leaningSpread(3.5);
    const g = gray(sheet);
    const a = assess(g);
    const spineX = (a.spine!.top + a.spine!.bottom) / 2;
    const [left, right] = planPage(g, a, sheet).pieces.map((p) => p.quad);
    expect((left[1].x + left[2].x) / 2).toBeLessThan(spineX - 0.01);
    expect((right[0].x + right[3].x) / 2).toBeGreaterThan(spineX + 0.01);
  });
});
