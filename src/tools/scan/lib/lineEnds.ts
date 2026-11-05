// Which way a sheet's text runs when its PDF has no text to ask (SCAN-67): a paragraph's last line is
// short, and it sits against the side the line began on. Pure.
import type { GrayImage } from '#lib/pageEnhance/quad.ts';

/** Pixels darker than this are print. */
const PRINT_BELOW = 128;
/** A text row's height, in pixels at about 1000 px on the long edge: less is a speck, more is a picture or rows run together. */
const ROW_PX: [number, number] = [4, 40];
/** A row with fewer columns of print than this share of the page is not a line. */
const MIN_ROW = 0.05;
/** The fewest lines that show a text block. */
const MIN_ROWS = 8;
/** A line shorter than this share of the block is a short line. */
const SHORT = 0.85;
/** How close to the block's edge a short line sits, as a share of the block. */
const FLUSH = 0.04;

/** Columns left out either side of the spine, in pixels: the line itself would run every row into one. */
const GUTTER_PX = 20;

interface Span { from: number; to: number }

/** The short lines of the sheet's pages, counted by the side they sit against. `spineX` (0 to 1) is where its pages meet. */
export function shortLineCounts(gray: GrayImage, spineX: number): { left: number; right: number } {
  const split = Math.round(gray.width * spineX);
  const [a, b] = [flushCounts(gray, 0, split - GUTTER_PX), flushCounts(gray, split + GUTTER_PX, gray.width)];
  return { left: a.left + b.left, right: a.right + b.right };
}

/** One page's short lines, counted by the edge of its text block they sit against. */
function flushCounts(gray: GrayImage, x0: number, x1: number): { left: number; right: number } {
  const lines = textLines(gray, x0, x1);
  if (lines.length < MIN_ROWS) return { left: 0, right: 0 };
  const edgeLeft = nth(lines.map((l) => l.from), 0.2);
  const edgeRight = nth(lines.map((l) => l.to), 0.8);
  const block = edgeRight - edgeLeft;
  const short = lines.filter((l) => l.to - l.from < block * SHORT);
  return {
    left: short.filter((l) => Math.abs(l.from - edgeLeft) < block * FLUSH).length,
    right: short.filter((l) => Math.abs(l.to - edgeRight) < block * FLUSH).length,
  };
}

/** Each text row between columns x0 and x1, from its first column of print to its last. */
function textLines(gray: GrayImage, x0: number, x1: number): Span[] {
  const inked = (y: number, x: number) => gray.data[y * gray.width + x] < PRINT_BELOW;
  const rowHasPrint = (y: number) => { for (let x = x0; x < x1; x += 1) if (inked(y, x)) return true; return false; };
  const lines: Span[] = [];
  for (let y = 0; y < gray.height; y += 1) {
    if (!rowHasPrint(y)) continue;
    const top = y;
    while (y < gray.height && rowHasPrint(y)) y += 1;
    if (y - top < ROW_PX[0] || y - top > ROW_PX[1]) continue;
    const columns: number[] = [];
    for (let x = x0; x < x1; x += 1) {
      for (let r = top; r < y; r += 1) if (inked(r, x)) { columns.push(x); break; }
    }
    if (columns.length >= (x1 - x0) * MIN_ROW) lines.push({ from: nth(columns, 0.01), to: nth(columns, 0.99) });
  }
  return lines;
}

/** The value `share` of the way up `values`. */
function nth(values: number[], share: number): number {
  const sorted = [...values].sort((p, q) => p - q);
  return sorted[Math.floor((sorted.length - 1) * share)];
}
