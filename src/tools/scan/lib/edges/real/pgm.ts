// Binary PGM (P5, 8-bit): the dependency-free file format for the real page-detection corpus.
import type { GrayImage } from '../../quad.ts';

const isSpace = (b: number) => b === 32 || (b >= 9 && b <= 13);

/** @testSeam */
export function parsePgm(bytes: Uint8Array): GrayImage {
  let pos = 0;
  const token = (): string => {
    for (;;) {
      while (pos < bytes.length && isSpace(bytes[pos])) pos += 1;
      if (bytes[pos] !== 35) break;
      while (pos < bytes.length && bytes[pos] !== 10) pos += 1;
    }
    const start = pos;
    while (pos < bytes.length && !isSpace(bytes[pos]) && bytes[pos] !== 35) pos += 1;
    return String.fromCharCode(...bytes.subarray(start, pos));
  };
  if (token() !== 'P5') throw new Error('Not a binary PGM (P5)');
  const width = Number(token());
  const height = Number(token());
  const maxval = Number(token());
  if (!(width > 0) || !(height > 0)) throw new Error('Bad PGM size');
  if (maxval !== 255) throw new Error('Only 8-bit PGM (maxval 255) is supported');
  pos += 1; // exactly one whitespace byte separates the header from the pixels
  const data = bytes.slice(pos, pos + width * height);
  if (data.length !== width * height) throw new Error('PGM pixel data is short');
  return { width, height, data: new Uint8ClampedArray(data) };
}

/** @testSeam */
export function encodePgm(image: GrayImage): Uint8Array {
  const head = new TextEncoder().encode(`P5\n${image.width} ${image.height}\n255\n`);
  const out = new Uint8Array(head.length + image.data.length);
  out.set(head, 0);
  out.set(image.data, head.length);
  return out;
}
