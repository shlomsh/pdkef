import { describe, expect, it } from 'vitest';
import { findTextRows } from '../pageLayout/textRows.ts';
import { FLAT_PAGE } from './dewarp/index.ts';
import { applyPiece } from './piece.ts';
import type { GrayImage, Quad, RgbaImage } from './quad.ts';
import { rgbaOf, textBlockCorners } from './textBlock.ts';
import { warpSizeFor } from './warp.ts';

const W = 600;
const H = 800;
const FIRST_Y = 60;
const PITCH = 22;
const BAR = 10;
const ROWS = 30;
const LEFT0 = 70;
const RIGHT0 = 470;
/** The block is this many pixels wider at the bottom, split across both edges. */
const GROWTH = 20;
const SLOPE = GROWTH / 2 / ((ROWS - 1) * PITCH);
const SHORT_LAST = [9, 19];
const INDENTED = [0, 12];

/** Justified rows as dark bars of words, the block a trapezoid; short last lines and indents break the edges. */
function page(rows = ROWS, margin = false): GrayImage {
  const data = new Uint8ClampedArray(W * H).fill(255);
  for (let r = 0; r < rows; r += 1) {
    const y0 = FIRST_Y + r * PITCH;
    const drift = (r * PITCH) * SLOPE;
    const left = LEFT0 - drift + (INDENTED.includes(r) ? 40 : 0);
    const right = RIGHT0 + drift - (SHORT_LAST.includes(r) ? 160 : 0);
    const words = 8;
    const gap = 6;
    const word = (right - left - (words - 1) * gap) / words;
    for (let w = 0; w < words; w += 1) {
      const x0 = Math.round(left + w * (word + gap));
      const x1 = Math.round(x0 + word);
      for (let y = y0; y < y0 + BAR; y += 1) data.fill(20, y * W + x0, y * W + x1);
    }
  }
  if (margin) for (let y = 40; y < H - 40; y += 1) data.fill(20, y * W + 20, y * W + 28);
  return { width: W, height: H, data };
}

const px = (c: Quad[number]) => ({ x: c.x * W, y: c.y * H });

describe('textBlockCorners', () => {
  // The margins fan out along the vanishing point, so the outer lines slope a little more than the text's own edge.
  it('follows the edges of the justified rows, trapezoid and all', () => {
    const c = textBlockCorners(page())!;
    expect(c).not.toBeNull();
    const [tl, tr, br, bl] = c.map(px);
    const leftSlope = (bl.x - tl.x) / (bl.y - tl.y);
    const rightSlope = (br.x - tr.x) / (br.y - tr.y);
    expect(-leftSlope).toBeGreaterThan(0.8 * SLOPE);
    expect(-leftSlope).toBeLessThan(2 * SLOPE);
    expect(rightSlope).toBeGreaterThan(0.8 * SLOPE);
    expect(rightSlope).toBeLessThan(2 * SLOPE);
  });

  it('squares the rows: after the warp their left and right ends line up', () => {
    const g = page();
    const corners = textBlockCorners(g)!;
    const sheet = rgbaOf(g);
    const size = warpSizeFor(corners.map(px) as Quad, 800, null);
    const out: RgbaImage = applyPiece(sheet, { quad: corners, inset: 0, ...size, bend: FLAT_PAGE, mesh: null });
    const full = findTextRows(out).filter((row, _, all) => row.right - row.left > 0.95 * Math.max(...all.map((r) => r.right - r.left)));
    expect(full.length).toBeGreaterThan(15);
    const lefts = full.map((row) => row.left);
    const rights = full.map((row) => row.right);
    expect(Math.max(...lefts) - Math.min(...lefts)).toBeLessThan(0.01 * out.width);
    expect(Math.max(...rights) - Math.min(...rights)).toBeLessThan(0.01 * out.width);
  });

  it('is not moved by a streak broken into several marks beside the rows', () => {
    const plain = textBlockCorners(page())!;
    const streaked = page();
    for (const x of [505, 540, 570]) for (let y = 40; y < H - 40; y += 1) streaked.data.fill(20, y * W + x, y * W + x + 6);
    textBlockCorners(streaked)!.forEach((p, i) => {
      expect(Math.abs(p.x - plain[i].x)).toBeLessThan(0.003);
    });
  });

  it('reaches out to the page\'s own margins on all four sides', () => {
    const c = textBlockCorners(page())!;
    expect(Math.abs(c[0].y)).toBeLessThan(0.02);
    expect(Math.abs(c[3].y - 1)).toBeLessThan(0.02);
    expect(Math.abs((c[0].x + c[3].x) / 2)).toBeLessThan(0.02);
    expect(Math.abs((c[1].x + c[2].x) / 2 - 1)).toBeLessThan(0.02);
  });

  it('stops just past the text on the spine side: the gutter is no part of the page', () => {
    const c = textBlockCorners(page(), 'right')!;
    const textRight = RIGHT0 + GROWTH / 4;
    expect((c[1].x + c[2].x) / 2 * W).toBeLessThan(textRight + 0.06 * (RIGHT0 - LEFT0));
    expect(Math.abs((c[0].x + c[3].x) / 2)).toBeLessThan(0.02);
  });

  it('is not moved by a tall mark in the margin', () => {
    const plain = textBlockCorners(page())!;
    const marked = textBlockCorners(page(ROWS, true))!;
    marked.forEach((p, i) => {
      expect(Math.abs(p.x - plain[i].x)).toBeLessThan(0.003);
      expect(Math.abs(p.y - plain[i].y)).toBeLessThan(0.003);
    });
  });

  it('has nothing to fit with fewer than 6 rows', () => {
    expect(textBlockCorners(page(5))).toBeNull();
  });

  // A phone photo of a book page (SCAN-69): the sheet's edge is the table, so the page stops at margins of its own.
  it('on a photo, stops at book margins around the text instead of the table at the sheet\'s edge', () => {
    const photo = page();
    // The table shows down both sides of the photo.
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) if (x < 20 || x >= W - 20) photo.data[y * W + x] = 70;
    const [tl, tr, br, bl] = textBlockCorners(photo)!.map(px);
    const textWidth = RIGHT0 - LEFT0;
    for (const c of [tl, bl]) {
      expect(c.x).toBeGreaterThan(LEFT0 - GROWTH - 0.15 * textWidth);
      expect(c.x).toBeLessThan(LEFT0 - GROWTH / 2);
    }
    for (const c of [tr, br]) {
      expect(c.x).toBeLessThan(RIGHT0 + GROWTH + 0.15 * textWidth);
      expect(c.x).toBeGreaterThan(RIGHT0 + GROWTH / 2);
    }
    // Top and bottom leave room for a running head and a page number, not the photo's full height.
    expect(tl.y).toBeGreaterThan(FIRST_Y - 0.2 * textWidth);
    expect(bl.y).toBeLessThan(FIRST_Y + (ROWS - 1) * PITCH + BAR + 0.2 * textWidth);
    expect(bl.y).toBeLessThan(H - 0.02 * H);
  });

  it('on a clean scan with paper to its edges, still reaches out to the sheet\'s edges', () => {
    const [tl, tr] = textBlockCorners(page())!.map(px);
    expect(tl.x).toBeLessThan(0.02 * W);
    expect(tr.x).toBeGreaterThan(0.98 * W);
  });
});
