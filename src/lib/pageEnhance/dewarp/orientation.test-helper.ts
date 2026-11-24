import type { GrayImage } from '../quad.ts';
import { seededRandom } from '../seededRandom.test-helper.ts';

/** @testSeam The measures of the default test picture, in pixels. */
export const W = 800;
/** @testSeam */
export const H = 1040;

/** @testSeam Ink laid on a white sheet of `w` by `h` (the default picture's size when left out). */
export type Paint = (data: Uint8ClampedArray, w?: number, h?: number) => void;

/** A letter is its outline, two strokes down and one across its top, not a solid block: printed letters, Hebrew and
 * Latin alike, carry more ink in the top half of their row. */
function letter(data: Uint8ClampedArray, w: number, left: number, top: number, width: number, base: number) {
  for (let y = top; y < base; y += 1) {
    for (let px = left; px < left + width; px += 1) {
      const edge = px - left < 2 || left + width - px <= 2 || y - top < 2;
      if (edge) data[y * w + px] = 30;
    }
  }
}

/** @testSeam A page of `rows` text rows across, from 12% to 88% of the height: letters 0.5-1% wide with a
 * hairline between them, words 2-9 letters apart by 1-2%, each row ending raggedly. */
export function textRows(rows: number, seed: number, x0 = 0.1, x1 = 0.9): Paint {
  return (data, w = W, h = H) => {
    const rnd = seededRandom(seed);
    const pitch = rows > 1 ? 0.76 / (rows - 1) : 0;
    for (let r = 0; r < rows; r += 1) {
      const base = Math.round((0.12 + r * pitch) * h);
      const end = x1 - rnd() * 0.25 * (x1 - x0);
      let x = x0 * w;
      while (x < end * w) {
        const letters = 2 + Math.floor(rnd() * 8);
        for (let k = 0; k < letters && x < end * w; k += 1) {
          const lw = Math.round(w * (0.005 + rnd() * 0.005));
          const top = base - Math.round(h * (rnd() < 0.3 ? 0.016 : 0.011));
          letter(data, w, Math.round(x), top, lw, base);
          x += lw + 2;
        }
        x += w * (0.01 + rnd() * 0.01);
      }
    }
  };
}

/** @testSeam A phone photo of paper the default size: lit unevenly, with sensor noise. */
export function photo(...paint: Paint[]): GrayImage {
  return photoOn(W, H, ...paint);
}

/** @testSeam A phone photo of paper `w` by `h`: lit unevenly, with sensor noise. */
export function photoOn(w: number, h: number, ...paint: Paint[]): GrayImage {
  const rnd = seededRandom(5);
  const data = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) data[y * w + x] = 190 + 40 * (x / w) - 20 * (y / h) + (rnd() - 0.5) * 12;
  const ink = new Uint8ClampedArray(w * h).fill(255);
  paint.forEach((p) => p(ink, w, h));
  for (let i = 0; i < data.length; i += 1) if (ink[i] < 255) data[i] = Math.min(data[i], ink[i] + (rnd() - 0.5) * 20);
  return { width: w, height: h, data };
}

/** @testSeam The page a quarter turn clockwise (`back` false) or anticlockwise. */
export function quarter({ width: w, height: h, data }: GrayImage, back = false): GrayImage {
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) out[back ? (w - 1 - x) * h + y : x * h + (h - 1 - y)] = data[y * w + x];
  }
  return { width: h, height: w, data: out };
}
