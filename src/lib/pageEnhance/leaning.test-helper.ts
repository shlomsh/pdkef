import type { GrayImage, RgbaImage } from './quad.ts';

/** @testSeam Text-like rows (short dashes, gaps between words) leaning by `degrees`, y down, as RGBA. */
export function leaning(width: number, height: number, degrees: number, left = 0, right = width): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const t = Math.tan((degrees * Math.PI) / 180);
  for (let y = 0; y < height; y += 1) {
    for (let x = left; x < right; x += 1) {
      const level = y - (x - width / 2) * t;
      const row = ((level % 24) + 24) % 24;
      const word = (((x - left) % 40) + 40) % 40;
      if (row >= 8 && row < 15 && word < 31) {
        const i = (y * width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 20;
      }
    }
  }
  return { width, height, data };
}

/** @testSeam The image's red channel as a gray image. */
export const gray = ({ width, height, data }: RgbaImage): GrayImage => {
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0; i < out.length; i += 1) out[i] = data[i * 4];
  return { width, height, data: out };
};
