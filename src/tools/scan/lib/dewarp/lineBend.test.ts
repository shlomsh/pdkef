import { describe, expect, it } from 'vitest';
import type { GrayImage } from '../quad.ts';
import { seededRandom } from '../edges/testImages.ts';
import { findLineBend, finishBend, fitBend, type Sample } from './lineBend.ts';
import { bendAt } from './types.ts';

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

/** A book page: lines bow most at the top, zero mean across each line. */
const curved = (x: number, y: number): number => 0.08 * (1 - y) * (x * x - x + 1 / 6);

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
        worst = Math.max(worst, Math.abs(bendAt(found!, x, y) - curved(x, y)));
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

  it('leaves a flat form alone, every row a label joined to its underline', () => {
    // The review's case: a 14px label block, then a 2px rule on its baseline, on twelve rows.
    const data = new Uint8ClampedArray(W * H).fill(230);
    for (let r = 0; r < 12; r += 1) {
      const base = 150 + r * 85;
      for (let y = base - 14; y < base; y += 1) for (let x = 100; x < 320; x += 1) data[y * W + x] = 40;
      for (let y = base - 2; y < base; y += 1) for (let x = 330; x < 750; x += 1) data[y * W + x] = 40;
    }
    expect(findLineBend({ width: W, height: H, data })).toBeNull();
  });

  it('keeps the tilt with the corners when the lines both bend and lean', () => {
    const lean = Math.tan((1 * Math.PI) / 180) * (W / H);
    const found = findLineBend(page(18, (x, y) => curved(x, y) + lean * (x - 0.5)));
    expect(found).not.toBeNull();
    // What is applied is the bend alone: the 1 degree lean is not taken out of the page.
    for (const y of [0.2, 0.5, 0.8]) {
      const slope = bendAt(found!, 0.9, y) - bendAt(found!, 0.1, y);
      const want = curved(0.9, y) - curved(0.1, y);
      expect(Math.abs(slope - want)).toBeLessThan(0.002);
    }
  });

  it('holds the bend at the lines\' edge, not extrapolated into a blank margin', () => {
    // Text only in the middle: lines from y = 0.35 to 0.65.
    const middle = (x: number, y: number) => curved(x, y);
    const img = page(8, middle);
    const found = findLineBend({ ...img, data: img.data.map((v, i) => {
      const y = Math.floor(i / W) / H;
      return y < 0.3 || y > 0.7 ? 230 : v;
    }) });
    expect(found).not.toBeNull();
    expect(found!.box!.y0).toBeGreaterThan(0.25);
    expect(bendAt(found!, 0.2, 0.02)).toBeCloseTo(bendAt(found!, 0.2, found!.box!.y0), 9);
  });

  it('settles the lean where the lines are, not across a page they only partly cover', () => {
    // The review's case: six lines over x 0.1..0.5 sharing a bow 0.05 (x - 0.3)^2 and a lean of 0.002.
    const lines: Sample[][] = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7].map((o) =>
      Array.from({ length: 30 }, (_, k) => {
        const x = 0.1 + (0.4 * k) / 29;
        return { line: 0, x, y: o + 0.05 * (x - 0.3) ** 2 + 0.002 * (x - 0.3) };
      }));
    const fitted = fitBend(lines, 4);
    expect(fitted!.lean).toBeCloseTo(0.002, 3);
    const bend = finishBend(fitted, false);
    expect(bend).not.toBeNull();
    // What is applied has no slope left at the middle of the lines.
    const slope = (bendAt(bend!, 0.31, 0.45) - bendAt(bend!, 0.29, 0.45)) / 0.02;
    expect(Math.abs(slope)).toBeLessThan(0.0005);
  });

  it('follows a crease: lines lifted to a sharp peak where the page was folded', () => {
    // A fold down the middle of the page: each line rises to a kink at x = 0.5, 1% of the height.
    const tent = (x: number) => 0.01 * Math.max(0, 1 - Math.abs(x - 0.5) / 0.15);
    const found = findLineBend(page(18, (x) => tent(x)));
    expect(found).not.toBeNull();
    // Compared as shapes: the per-line heights absorb any constant, so each row's mean is set aside.
    let worst = 0;
    for (const y of [0.2, 0.5, 0.8]) {
      const xs = Array.from({ length: 33 }, (_, k) => 0.1 + (0.8 * k) / 32);
      const got = xs.map((x) => bendAt(found!, x, y));
      const want = xs.map(tent);
      const shift = got.reduce((t, v, k) => t + v - want[k], 0) / xs.length;
      got.forEach((v, k) => { worst = Math.max(worst, Math.abs(v - shift - want[k])); });
    }
    expect(worst).toBeLessThan(0.0025);
  });
});
