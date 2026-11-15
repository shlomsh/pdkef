import { describe, expect, it } from 'vitest';
import { type RgbaImage } from '#lib/pageEnhance/quad.ts';
import { evenMargins } from './evenMargins.ts';

const W = 600;
const H = 800;
const ROWS = 30;
const FIRST_Y = 60;
const PITCH = 22;
const BAR = 10;
type Rgb = [number, number, number];
const PAPER: Rgb = [232, 226, 210];

interface Shape {
  /** The text block's left and right ends, in pixels. */
  text: [number, number];
  /** Paper colour at row y. */
  paper?: (y: number) => Rgb;
  /** Pixels taken off row r's right end. */
  rightCut?: (r: number) => number;
  /** Rows end here on the right where they pass a figure (a column beside a picture). */
  figure?: [number, number];
  /** A dark gutter shadow this many pixels wide down the left edge. */
  shadow?: number;
  /** Row r's left end, in place of the block's own. */
  leftAt?: (r: number) => number;
  /** Row r's right end, in place of the block's own. */
  rightAt?: (r: number) => number;
  /** A dark line this many pixels wide down the very left edge: the page's own edge, seen past the curl. */
  edgeLine?: number;
}

/** A photographed book page, flattened: justified rows of word bars on tinted paper. */
function bookPage({ text: [left, right], paper = () => PAPER, rightCut = () => 0, figure, shadow = 0, leftAt = () => left, rightAt = () => right, edgeLine = 0 }: Shape): RgbaImage {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    const tone = paper(y);
    for (let x = 0; x < W; x += 1) {
      const dim = x < shadow ? 0.4 + 0.6 * (x / shadow) : 1;
      data.set([tone[0] * dim, tone[1] * dim, tone[2] * dim, 255], (y * W + x) * 4);
    }
  }
  const ink = (x0: number, x1: number, y0: number, y1: number) => {
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) data.set([25, 25, 25, 255], (y * W + x) * 4);
  };
  for (let r = 0; r < ROWS; r += 1) {
    const y0 = FIRST_Y + r * PITCH;
    const start = leftAt(r);
    const end = rightAt(r) - rightCut(r);
    const words = 8;
    const gap = 6;
    const word = (end - start - (words - 1) * gap) / words;
    for (let w = 0; w < words; w += 1) {
      const x0 = Math.round(start + w * (word + gap));
      ink(x0, Math.round(x0 + word), y0, y0 + BAR);
    }
  }
  if (figure) ink(figure[0], figure[1], 200, 520);
  if (edgeLine) ink(0, edgeLine, 0, H);
  return { width: W, height: H, data };
}

const rgb = (img: RgbaImage, x: number, y: number): Rgb => {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};
const near = (a: Rgb, b: Rgb, by: number) => a.every((v, k) => Math.abs(v - b[k]) <= by);

/** The leftmost and rightmost ink columns on row r's bar. */
function rowEnds(img: RgbaImage, r: number): [number, number] {
  const y = FIRST_Y + r * PITCH + BAR / 2;
  let lo = -1;
  let hi = -1;
  for (let x = 0; x < img.width; x += 1) {
    if (rgb(img, x, y)[0] < 100) { if (lo < 0) lo = x; hi = x; }
  }
  return [lo, hi];
}

describe('evenMargins', () => {
  it('pads a page squeezed on its left so the text sits centred, the rows untouched', () => {
    const src = bookPage({ text: [40, 490] });
    const out = evenMargins(src);
    expect(out.height).toBe(H);
    const pad = out.width - W;
    expect(pad).toBeGreaterThan(55);
    expect(pad).toBeLessThan(85);
    const [left, right] = rowEnds(out, 5);
    expect(Math.abs(left - (out.width - 1 - right))).toBeLessThanOrEqual(0.02 * out.width);
    // the page itself is moved across whole, not resampled
    for (let x = 0; x < W; x += 7) expect(rgb(out, x + pad, 100)).toEqual(rgb(src, x, 100));
  });

  it('pads the right side when the right margin is the thin one', () => {
    const src = bookPage({ text: [110, 560] });
    const out = evenMargins(src);
    const pad = out.width - W;
    expect(pad).toBeGreaterThan(55);
    for (let x = 0; x < W; x += 7) expect(rgb(out, x, 100)).toEqual(rgb(src, x, 100));
    const [left, right] = rowEnds(out, 5);
    expect(Math.abs(left - (out.width - 1 - right))).toBeLessThanOrEqual(0.02 * out.width);
  });

  it('fills the padding in the paper\'s own colour', () => {
    const out = evenMargins(bookPage({ text: [40, 490] }));
    expect(out.width).toBeGreaterThan(W);
    for (const y of [5, 300, 790]) expect(near(rgb(out, 0, y), PAPER, 3)).toBe(true);
  });

  it('follows the paper\'s tone down the page', () => {
    const paper = (y: number): Rgb => { const v = 245 - (60 * y) / H; return [v, v - 4, v - 14]; };
    const out = evenMargins(bookPage({ text: [40, 490], paper }));
    expect(out.width).toBeGreaterThan(W);
    for (const y of [20, 400, 780]) expect(near(rgb(out, 0, y), paper(y), 8)).toBe(true);
  });

  it('does not count a gutter shadow as text, and pads past it in paper, not shadow', () => {
    const src = bookPage({ text: [45, 490], shadow: 30 });
    const out = evenMargins(src);
    const pad = out.width - W;
    expect(pad).toBeGreaterThan(50);
    expect(near(rgb(out, 0, 400), PAPER, 6)).toBe(true);
  });

  it('centres a block whose spine-side edge leans', () => {
    const out = evenMargins(bookPage({ text: [45, 490], leftAt: (r) => 30 + r }));
    expect(out.width).toBeGreaterThan(W + 40);
    const [left, right] = rowEnds(out, 15);
    expect(Math.abs(left - (out.width - 1 - right))).toBeLessThanOrEqual(0.02 * out.width);
  });

  it('finds the block above rows that flow beside a figure', () => {
    const out = evenMargins(bookPage({ text: [40, 490], rightAt: (r) => (r < 20 ? 490 : 300), figure: [350, 480] }));
    expect(out.width).toBeGreaterThan(W + 55);
  });

  it('reads rows that run right up to the page\'s edge, where the line reader does not look', () => {
    const out = evenMargins(bookPage({ text: [2, 490] }));
    const [left, right] = rowEnds(out, 5);
    expect(Math.abs(left - (out.width - 1 - right))).toBeLessThanOrEqual(0.01 * out.width);
  });

  it('takes the page\'s own dark edge off the thin side, so it does not stand in the new margin', () => {
    const out = evenMargins(bookPage({ text: [50, 490], edgeLine: 3 }));
    const pad = out.width - W;
    expect(pad).toBeGreaterThan(40);
    for (let x = 0; x < pad + 10; x += 1) expect(rgb(out, x, 400)[0]).toBeGreaterThan(150);
  });

  it('returns a centred page as the very same image', () => {
    const src = bookPage({ text: [75, 525] });
    expect(evenMargins(src)).toBe(src);
  });

  it('leaves a page only a little uneven as it is', () => {
    const src = bookPage({ text: [70, 520] });
    expect(evenMargins(src)).toBe(src);
  });

  it('leaves a ragged page as it is: its rows hold no edge to centre on', () => {
    const cuts = [0, 140, 60, 200, 20, 110, 170, 40, 90, 230];
    const src = bookPage({ text: [40, 490], rightCut: (r) => cuts[r % cuts.length] });
    expect(evenMargins(src)).toBe(src);
  });

  it('leaves a narrow column beside a figure as it is', () => {
    const src = bookPage({ text: [60, 330], figure: [380, 560] });
    expect(evenMargins(src)).toBe(src);
  });

  it('leaves a page with no text as it is', () => {
    const blank: RgbaImage = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(230) };
    expect(evenMargins(blank)).toBe(blank);
  });
});
