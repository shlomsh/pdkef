import { describe, expect, it } from 'vitest';
import type { GrayImage } from '../quad.ts';
import { seededRandom } from '../edges/testImages.ts';
import { findLineBend } from './lineBend.ts';
import { bendAt, type LineBend } from './types.ts';

const W = 1000;
const H = 1300;

/** Ink columns of each text line: rows of words 3-8% long, gaps 1-2%, from 8% to 92% of the width. */
function wordColumns(lineCount: number, seed: number): Uint8Array[] {
  const rnd = seededRandom(seed);
  const lines: Uint8Array[] = [];
  for (let l = 0; l < lineCount; l += 1) {
    const cols = new Uint8Array(W);
    let x = 0.08;
    while (x < 0.92) {
      const len = Math.min(0.92 - x, 0.03 + rnd() * 0.05);
      for (let px = Math.round(x * W); px < Math.round((x + len) * W); px += 1) cols[px] = 1;
      x += len + 0.01 + rnd() * 0.01;
    }
    lines.push(cols);
  }
  return lines;
}

/** A page of `lineCount` lines from y=0.12 to 0.88, observed at straight y + bend(x, y). */
function page(lineCount: number, bend: (x: number, y: number) => number): GrayImage {
  const rnd = seededRandom(7);
  const cols = wordColumns(lineCount, 3);
  const pitch = lineCount > 1 ? 0.76 / (lineCount - 1) : 0;
  const data = new Uint8ClampedArray(W * H);
  for (let py = 0; py < H; py += 1) {
    const y = (py + 0.5) / H;
    for (let px = 0; px < W; px += 1) {
      const x = (px + 0.5) / W;
      const ys = y - bend(x, y);
      const l = pitch > 0 ? Math.round((ys - 0.12) / pitch) : 0;
      const inked = l >= 0 && l < lineCount && Math.abs(ys - (0.12 + l * pitch)) <= 0.007 && cols[l][px] === 1;
      const paper = 210 + 30 * x + (rnd() - 0.5) * 10;
      data[py * W + px] = inked ? 40 : paper;
    }
  }
  return { width: W, height: H, data };
}

const truth: LineBend = { c: [-0.08, 0.08, 0, 0.08, -0.08, 0, 0, 0, 0] };
const curved = (x: number, y: number): number => bendAt(truth, x, y);

describe('findLineBend', () => {
  it('returns null for straight lines', () => {
    expect(findLineBend(page(18, () => 0))).toBeNull();
  });

  it('recovers a book-page bend, stronger at the top', () => {
    const found = findLineBend(page(18, curved));
    expect(found).not.toBeNull();
    let worst = 0;
    for (let i = 0; i < 9; i += 1) {
      for (let j = 0; j < 9; j += 1) {
        const x = 0.1 + (0.8 * i) / 8;
        const y = 0.1 + (0.8 * j) / 8;
        worst = Math.max(worst, Math.abs(bendAt(found!, x, y) - bendAt(truth, x, y)));
      }
    }
    expect(worst).toBeLessThan(0.003);
  });

  it('leaves a uniform 0.5 degree tilt alone', () => {
    const tilt = Math.tan((0.5 * Math.PI) / 180) * (W / H);
    expect(findLineBend(page(18, (x) => tilt * (x - 0.5)))).toBeNull();
  });

  it('returns null with only two text lines', () => {
    expect(findLineBend(page(2, curved))).toBeNull();
  });

  it('returns null for a photo of random blobs', () => {
    const rnd = seededRandom(11);
    const data = new Uint8ClampedArray(W * H);
    for (let i = 0; i < data.length; i += 1) data[i] = 150 + (rnd() - 0.5) * 20;
    for (let b = 0; b < 80; b += 1) {
      const bx = Math.floor(rnd() * 0.9 * W);
      const by = Math.floor(rnd() * 0.9 * H);
      const bw = 10 + Math.floor(rnd() * 50);
      const bh = 10 + Math.floor(rnd() * 50);
      const v = 30 + rnd() * 60;
      for (let y = by; y < Math.min(H, by + bh); y += 1) for (let x = bx; x < Math.min(W, bx + bw); x += 1) data[y * W + x] = v;
    }
    expect(findLineBend({ width: W, height: H, data })).toBeNull();
  });
});
