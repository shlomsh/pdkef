import type { GrayImage } from './quad.ts';

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

/** @testSeam The test page's measures, in pixels: the sheet, the first row and the pitch, the block's top corners. */
export const PAGE = { W, H, FIRST_Y, PITCH, BAR, ROWS, LEFT0, RIGHT0, GROWTH, SLOPE };
const SHORT_LAST = [9, 19];
const INDENTED = [0, 12];

/** How a test page's rows run: how many, a mark in the margin, a column of its own, and rows cut short on the right. */
interface TextPageShape {
  rows?: number;
  margin?: boolean;
  /** The block's left and right at the top, in place of LEFT0 and RIGHT0. */
  column?: [number, number];
  /** Pixels taken off row `r`'s right end. */
  rightCut?: (r: number) => number;
}

/** @testSeam Justified rows as dark bars of words, the block a trapezoid; short last lines and indents break the edges. */
export function textPage({ rows = ROWS, margin = false, column = [LEFT0, RIGHT0], rightCut = () => 0 }: TextPageShape = {}): GrayImage {
  const data = new Uint8ClampedArray(W * H).fill(255);
  for (let r = 0; r < rows; r += 1) {
    const y0 = FIRST_Y + r * PITCH;
    const drift = (r * PITCH) * SLOPE;
    const left = column[0] - drift + (INDENTED.includes(r) ? 40 : 0);
    const right = column[1] + drift - (SHORT_LAST.includes(r) ? 0.4 * (column[1] - column[0]) : 0) - rightCut(r);
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

/** @testSeam The page photographed on a table: the table shows down both sides of the sheet. */
export function onTable(page: GrayImage): GrayImage {
  const data = new Uint8ClampedArray(page.data);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) if (x < 20 || x >= W - 20) data[y * W + x] = 70;
  return { ...page, data };
}
