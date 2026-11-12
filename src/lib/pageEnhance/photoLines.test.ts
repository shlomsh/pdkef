import { describe, expect, it } from 'vitest';
import type { GrayImage } from './quad.ts';
import { traceLines } from './photoLines.ts';

const W = 750;
const H = 1000;
const PITCH = 22;
const BAR = 7;
const FIRST_Y = 60;
const ROWS = 20;
const LEFT = 60;
const RIGHT = 690;
const BOW = 12;

interface Row { left: number; right: number; y: number; bow?: number }

function blank(): GrayImage {
  return { width: W, height: H, data: new Uint8ClampedArray(W * H).fill(255) };
}

/** One row of eight word bars; with a bow, every column is lifted by a parabola that is `bow` px high mid-row. */
function drawRow(img: GrayImage, { left, right, y, bow = 0 }: Row, words = 8): void {
  const gap = 6;
  const word = (right - left - (words - 1) * gap) / words;
  const mid = (left + right) / 2;
  const half = (right - left) / 2;
  for (let k = 0; k < words; k += 1) {
    const x0 = Math.round(left + k * (word + gap));
    const x1 = k === words - 1 ? right : Math.round(x0 + word);
    for (let x = x0; x < x1; x += 1) {
      const t = (x - mid) / half;
      const top = Math.round(y - bow * (1 - t * t));
      for (let yy = top; yy < top + BAR; yy += 1) img.data[yy * W + x] = 20;
    }
  }
}

const rowY = (r: number) => FIRST_Y + r * PITCH;
/** The centre height the tracer should report for a row drawn at y, lifted by the bow at x. */
const centre = (row: Row, x: number) => {
  const mid = (row.left + row.right) / 2;
  const half = (row.right - row.left) / 2;
  const t = (x - mid) / half;
  return row.y + (BAR - 1) / 2 - (row.bow ?? 0) * (1 - t * t);
};

function rows(bow = 0): Row[] {
  return Array.from({ length: ROWS }, (_, r) => ({ left: LEFT, right: RIGHT, y: rowY(r) + BOW, bow }));
}

describe('traceLines', () => {
  it('finds each straight justified row, ends where drawn, top to bottom', () => {
    const img = blank();
    const drawn = rows();
    drawn.forEach((r) => drawRow(img, r));
    const lines = traceLines(img);
    expect(lines).toHaveLength(ROWS);
    lines.forEach((line, i) => {
      expect(Math.abs(line.left.x - LEFT)).toBeLessThanOrEqual(2);
      expect(Math.abs(line.right.x - RIGHT)).toBeLessThanOrEqual(2);
      expect(Math.abs(line.at(400) - centre(drawn[i], 400))).toBeLessThan(2);
    });
  });

  it('follows bowed rows along their own curve', () => {
    const img = blank();
    const drawn = rows(BOW);
    drawn.forEach((r) => drawRow(img, r));
    const lines = traceLines(img);
    expect(lines).toHaveLength(ROWS);
    lines.forEach((line, i) => {
      for (const x of [LEFT + 2, (LEFT + RIGHT) / 2, RIGHT - 2]) {
        expect(Math.abs(line.at(x) - centre(drawn[i], x))).toBeLessThan(2);
      }
      expect(line.left.y).toBeCloseTo(line.at(line.left.x), 6);
    });
  });

  it('adds no line for a large filled drawing among the rows', () => {
    const img = blank();
    rows().forEach((r, i) => { if (i < 8) drawRow(img, r); });
    for (let y = rowY(8) + BOW; y < rowY(8) + BOW + 150; y += 1) img.data.fill(20, y * W + 300, y * W + 450);
    expect(traceLines(img)).toHaveLength(8);
  });

  it('drops a lone label out in blank space, keeps a short last line right under the rows', () => {
    const lastY = rowY(ROWS - 1) + BOW;
    const label = blank();
    rows().forEach((r) => drawRow(label, r));
    drawRow(label, { left: 300, right: 400, y: lastY + 3 * PITCH }, 2);
    expect(traceLines(label)).toHaveLength(ROWS);

    const last = blank();
    rows().forEach((r) => drawRow(last, r));
    drawRow(last, { left: LEFT, right: LEFT + 130, y: lastY + PITCH }, 3);
    const lines = traceLines(last);
    expect(lines).toHaveLength(ROWS + 1);
    expect(lines[ROWS].right.x).toBeLessThan(LEFT + 140);
  });

  it('finds nothing on an empty sheet', () => {
    expect(traceLines(blank())).toEqual([]);
  });
});
