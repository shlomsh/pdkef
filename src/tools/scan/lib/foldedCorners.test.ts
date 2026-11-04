import { describe, expect, it } from 'vitest';
import { type RgbaImage } from '#lib/pageEnhance/quad.ts';
import { fillFoldedCorners } from './foldedCorners.ts';

const W = 400;
const H = 300;
type Corner = 'tl' | 'tr' | 'bl' | 'br';

/** Paper of `paper(x)` grey, then `ink(x, y)` pixels set black. */
function page(paper: (x: number) => number, ink: (x: number, y: number) => boolean, w = W, h = H): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const v = ink(x, y) ? 0 : paper(x);
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data };
}

const flat = (v: number) => () => v;
const grey = (img: RgbaImage, x: number, y: number) => img.data[(y * img.width + x) * 4];

/** A right triangle of `leg` pixels in the given corner. */
function triangle(corner: Corner, leg: number) {
  return (x: number, y: number) => {
    const dx = corner[1] === 'l' ? x : W - 1 - x;
    const dy = corner[0] === 't' ? y : H - 1 - y;
    return dx + dy <= leg;
  };
}

describe('fillFoldedCorners', () => {
  it('paints a dark triangle at the top right in the paper colour and leaves the rest byte-identical', () => {
    const src = page(flat(230), triangle('tr', 60));
    const out = fillFoldedCorners(src);
    expect(grey(out, W - 1, 0)).toBe(230);
    expect(grey(out, W - 20, 10)).toBe(230);
    for (let y = 100; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) expect(grey(out, x, y)).toBe(grey(src, x, y));
    }
  });

  it.each(['tl', 'tr', 'bl', 'br'] as const)('clears the %s corner', (corner) => {
    const out = fillFoldedCorners(page(flat(230), triangle(corner, 60)));
    const x = corner[1] === 'l' ? 0 : W - 1;
    const y = corner[0] === 't' ? 0 : H - 1;
    expect(grey(out, x, y)).toBe(230);
  });

  it('carries a left-to-right paper gradient on through the painted corner', () => {
    const paper = (x: number) => 200 + Math.round((x / W) * 50);
    const out = fillFoldedCorners(page(paper, triangle('tr', 60)));
    for (const [x, y] of [[W - 1, 0], [W - 30, 10], [W - 55, 3]]) {
      expect(Math.abs(grey(out, x, y) - paper(x))).toBeLessThanOrEqual(4);
    }
  });

  it('is not pulled off the paper colour by a bright highlight along the fold', () => {
    const src = page(flat(200), triangle('tr', 60));
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const along = W - 1 - x + y;
        if (along === 64 || along === 65) src.data.set([250, 250, 250, 255], (y * W + x) * 4);
      }
    }
    const out = fillFoldedCorners(src);
    expect(grey(out, W - 1, 0)).toBeLessThan(210);
    expect(grey(out, W - 20, 10)).toBeLessThan(210);
  });

  it('keeps a large black rectangle in a corner', () => {
    const src = page(flat(230), (x, y) => x >= W - 60 && y < 50);
    expect(fillFoldedCorners(src)).toBe(src);
  });

  it('removes a tiny dark block in a corner', () => {
    const out = fillFoldedCorners(page(flat(230), (x, y) => x >= W - 6 && y < 6));
    expect(grey(out, W - 1, 0)).toBe(230);
  });

  it('keeps a thin rule that runs beside one edge without touching it', () => {
    const src = page(flat(230), (x, y) => y === 3 && x < 50);
    expect(fillFoldedCorners(src)).toBe(src);
  });

  it.each([
    ['left', (x: number, y: number) => x < 3 && y >= 100 && y < 200, 0, 150],
    ['right', (x: number, y: number) => x >= W - 3 && y >= 100 && y < 200, W - 1, 150],
    ['top', (x: number, y: number) => y < 3 && x >= 100 && x < 200, 150, 0],
    ['bottom', (x: number, y: number) => y >= H - 3 && x >= 100 && x < 200, 150, H - 1],
  ] as const)('paints a thin dark sliver along the %s edge', (_edge, ink, x, y) => {
    expect(grey(fillFoldedCorners(page(flat(230), ink)), x, y)).toBe(230);
  });

  it('keeps a square mark on an edge, as real print is', () => {
    const src = page(flat(230), (x, y) => x < 20 && y >= 100 && y < 120);
    expect(fillFoldedCorners(src)).toBe(src);
  });

  it('keeps a rule that runs into an edge', () => {
    const src = page(flat(230), (x, y) => x < 120 && y >= 150 && y < 152);
    expect(fillFoldedCorners(src)).toBe(src);
  });

  it('keeps a short tick on an edge', () => {
    const src = page(flat(230), (x, y) => x < 2 && y >= 100 && y < 104);
    expect(fillFoldedCorners(src)).toBe(src);
  });

  it('keeps a black triangle in the middle of the page and a black band along one edge', () => {
    const middle = page(flat(230), (x, y) => x >= 150 && y >= 100 && x - 150 + (y - 100) <= 60);
    expect(fillFoldedCorners(middle)).toBe(middle);
    const band = page(flat(230), (x) => x >= W - 40);
    expect(fillFoldedCorners(band)).toBe(band);
  });

  it('leaves text-like ink just outside a corner alone', () => {
    const src = page(flat(230), (x, y) => triangle('tr', 60)(x, y) || (y >= 75 && y < 79 && x >= W - 90 && x < W - 20));
    const out = fillFoldedCorners(src);
    expect(grey(out, W - 1, 0)).toBe(230);
    for (let x = W - 90; x < W - 20; x += 1) expect(grey(out, x, 77)).toBe(0);
  });

  it('returns a clean page as the same object and never mutates its input', () => {
    const clean = page(flat(230), () => false);
    expect(fillFoldedCorners(clean)).toBe(clean);
    const src = page(flat(230), triangle('tr', 60));
    const before = src.data.slice();
    const out = fillFoldedCorners(src);
    expect(out).not.toBe(src);
    expect(out.data).not.toBe(src.data);
    expect(src.data).toEqual(before);
  });
});
