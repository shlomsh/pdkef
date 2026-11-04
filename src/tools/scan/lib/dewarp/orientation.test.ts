import { describe, expect, it } from 'vitest';
import type { GrayImage } from '../quad.ts';
import { seededRandom } from '../edges/testImages.ts';
import { textTurn } from './orientation.ts';

const W = 800;
const H = 1040;

type Paint = (data: Uint8ClampedArray) => void;

/** A page of `rows` text rows across, from 12% to 88% of the height: letters 0.5-1% wide with a
 * hairline between them, words 2-9 letters apart by 1-2%, each row ending raggedly. */
function textRows(rows: number, seed: number, x0 = 0.1, x1 = 0.9): Paint {
  return (data) => {
    const rnd = seededRandom(seed);
    const pitch = rows > 1 ? 0.76 / (rows - 1) : 0;
    for (let r = 0; r < rows; r += 1) {
      const base = Math.round((0.12 + r * pitch) * H);
      const end = x1 - rnd() * 0.25 * (x1 - x0);
      let x = x0 * W;
      while (x < end * W) {
        const letters = 2 + Math.floor(rnd() * 8);
        for (let k = 0; k < letters && x < end * W; k += 1) {
          const lw = Math.round(W * (0.005 + rnd() * 0.005));
          const top = base - Math.round(H * (rnd() < 0.3 ? 0.016 : 0.011));
          // A letter is its outline, two strokes down and one across, not a solid block.
          for (let y = top; y < base; y += 1) {
            for (let px = Math.round(x); px < Math.round(x) + lw; px += 1) {
              const edge = px - Math.round(x) < 2 || Math.round(x) + lw - px <= 2 || base - y <= 2;
              if (edge) data[y * W + px] = 30;
            }
          }
          x += lw + 2;
        }
        x += W * (0.01 + rnd() * 0.01);
      }
    }
  };
}

/** A form's table: `across` rules the full width and `down` rules the full height of the box. */
function table(across: number, down: number, box = { x0: 0.06, x1: 0.94, y0: 0.08, y1: 0.92 }): Paint {
  return (data) => {
    for (let k = 0; k < across; k += 1) {
      const y = Math.round((box.y0 + ((box.y1 - box.y0) * k) / Math.max(1, across - 1)) * H);
      for (let x = Math.round(box.x0 * W); x <= Math.round(box.x1 * W); x += 1) data[y * W + x] = 30;
    }
    for (let k = 0; k < down; k += 1) {
      const x = Math.round((box.x0 + ((box.x1 - box.x0) * k) / Math.max(1, down - 1)) * W);
      for (let y = Math.round(box.y0 * H); y <= Math.round(box.y1 * H); y += 1) data[y * W + x] = 30;
    }
  };
}

/** A phone photo of paper: lit unevenly, with sensor noise. */
function photo(...paint: Paint[]): GrayImage {
  const rnd = seededRandom(5);
  const data = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) data[y * W + x] = 190 + 40 * (x / W) - 20 * (y / H) + (rnd() - 0.5) * 12;
  const ink = new Uint8ClampedArray(W * H).fill(255);
  paint.forEach((p) => p(ink));
  for (let i = 0; i < data.length; i += 1) if (ink[i] < 255) data[i] = Math.min(data[i], ink[i] + (rnd() - 0.5) * 20);
  return { width: W, height: H, data };
}

/** A one-bit photocopy: black or white, with a speckle of toner. */
function photocopy(...paint: Paint[]): GrayImage {
  const rnd = seededRandom(9);
  const data = new Uint8ClampedArray(W * H).fill(255);
  paint.forEach((p) => p(data));
  for (let i = 0; i < data.length; i += 1) data[i] = data[i] < 128 || rnd() < 0.002 ? 0 : 255;
  return { width: W, height: H, data };
}

/** The page a quarter turn clockwise (`back` false) or anticlockwise. */
function quarter({ width: w, height: h, data }: GrayImage, back = false): GrayImage {
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) out[back ? (w - 1 - x) * h + y : x * h + (h - 1 - y)] = data[y * w + x];
  }
  return { width: h, height: w, data: out };
}

describe('textTurn', () => {
  it('reads rows across an upright page as no turn, photographed or photocopied', () => {
    for (const page of [photo(textRows(30, 1)), photocopy(textRows(30, 1))]) {
      const found = textTurn(page);
      expect(found?.turn).toBe(0);
      expect(found!.confidence).toBeGreaterThan(0.8);
    }
  });

  it('reads rows down a page lying on its side as a quarter turn, either way round', () => {
    for (const page of [photo(textRows(30, 2)), photocopy(textRows(30, 2))]) {
      for (const back of [false, true]) {
        const found = textTurn(quarter(page, back));
        expect(found?.turn).toBe(1);
        expect(found!.confidence).toBeGreaterThan(0.8);
      }
    }
  });

  it('follows a form\'s text, not its rules, when the rules run mostly the other way', () => {
    // Twelve rules down and three across, each far longer than any row of text: counted as rows, the
    // rules down alone would outweigh the text.
    const form = photo(table(3, 12), textRows(14, 3, 0.1, 0.5));
    expect(textTurn(form)?.turn).toBe(0);
    expect(textTurn(quarter(form))?.turn).toBe(1);
    const copy = photocopy(table(16, 3), textRows(14, 4, 0.1, 0.5));
    expect(textTurn(copy)?.turn).toBe(0);
    expect(textTurn(quarter(copy))?.turn).toBe(1);
  });

  it('says nothing about a blank page, a ruled grid alone, or two lines of text', () => {
    expect(textTurn(photo())).toBeNull();
    expect(textTurn(photocopy())).toBeNull();
    expect(textTurn(photo(table(20, 0)))).toBeNull();
    expect(textTurn(photocopy(table(0, 14)))).toBeNull();
    expect(textTurn(photo(textRows(2, 6)))).toBeNull();
  });

  it('says nothing about a photo of random blobs', () => {
    const rnd = seededRandom(11);
    const data = new Uint8ClampedArray(W * H);
    for (let i = 0; i < data.length; i += 1) data[i] = 150 + (rnd() - 0.5) * 20;
    for (let b = 0; b < 120; b += 1) {
      const bx = Math.floor(rnd() * 0.9 * W);
      const by = Math.floor(rnd() * 0.9 * H);
      const bw = 5 + Math.floor(rnd() * 60);
      const bh = 5 + Math.floor(rnd() * 60);
      const v = 30 + rnd() * 60;
      for (let y = by; y < Math.min(H, by + bh); y += 1) for (let x = bx; x < Math.min(W, bx + bw); x += 1) data[y * W + x] = v;
    }
    expect(textTurn({ width: W, height: H, data })).toBeNull();
    expect(textTurn(quarter({ width: W, height: H, data }))).toBeNull();
  });
});
