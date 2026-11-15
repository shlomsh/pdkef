// Test-only fixtures for the edge guessers: gray images built in code. Not imported by app code.
import { seededRandom } from '#lib/pageEnhance/seededRandom.test-helper.ts';
import type { GrayImage, Point, Quad } from '#lib/pageEnhance/quad.ts';

export function solid(width: number, height: number, value: number): GrayImage {
  return { width, height, data: new Uint8ClampedArray(width * height).fill(value) };
}

function inside(q: Quad, x: number, y: number): boolean {
  let pos = false;
  let neg = false;
  for (let i = 0; i < 4; i += 1) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (c > 0) pos = true;
    else if (c < 0) neg = true;
  }
  return !(pos && neg);
}

/** Fill a convex pixel-space quad with `value`. */
export function fillQuad(image: GrayImage, quad: Quad, value: number): void {
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(image.width - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(image.height - 1, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (inside(quad, x + 0.5, y + 0.5)) image.data[y * image.width + x] = value;
    }
  }
}

export function fillRect(image: GrayImage, x: number, y: number, w: number, h: number, value: number): void {
  fillQuad(image, [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], value);
}

export function addNoise(image: GrayImage, amplitude: number, seed: number): void {
  const rnd = seededRandom(seed);
  for (let i = 0; i < image.data.length; i += 1) image.data[i] += (rnd() - 0.5) * 2 * amplitude;
}

/** Add a left-to-right brightness ramp of `strength` levels across the width. */
export function addGradient(image: GrayImage, strength: number): void {
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) image.data[y * image.width + x] += (x / image.width - 0.5) * strength;
  }
}

/** Normalized (x+0.5)/w style truth for pixel-space corners given as raw edge positions. */
export const norm = (p: Point, w: number, h: number): Point => ({ x: p.x / w, y: p.y / h });

/** @testSeam An open book turned 5 degrees on a dark table: our page (200) to the right of a crease, a strip of the
 * facing page (195) to its left reaching the frame's left side, both carrying text. `truth` is our page. */
export function tiltedSpread(width = 320, height = 427): { image: GrayImage; truth: Quad } {
  const c = { x: width / 2, y: height / 2 };
  const a = (5 * Math.PI) / 180;
  const turn = (p: Point): Point => ({ x: c.x + (p.x - c.x) * Math.cos(a) - (p.y - c.y) * Math.sin(a), y: c.y + (p.x - c.x) * Math.sin(a) + (p.y - c.y) * Math.cos(a) });
  const box = (x0: number, y0: number, x1: number, y1: number): Quad => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }].map(turn) as Quad;
  const image = solid(width, height, 60);
  fillQuad(image, box(-70, 40, 112, 400), 195);
  fillQuad(image, box(112, 60, 296, 380), 200);
  fillQuad(image, box(111, 60, 113, 380), 120);
  for (let y = 80; y < 370; y += 12) {
    fillQuad(image, box(26, y, 98, y + 3), 50);
    for (let x = 130; x < 280; x += 10) fillQuad(image, box(x, y, x + 6, y + 3), 50);
  }
  addNoise(image, 4, 11);
  return { image, truth: box(112, 60, 296, 380).map((p) => norm(p, width, height)) as Quad };
}

/** @testSeam A single sheet (page 225 on a table of 60) with a printed rule box inside it and rows of text. */
export function ruledSheet(): GrayImage {
  const img = solid(320, 400, 60);
  fillRect(img, 16, 20, 288, 360, 225);
  const x0 = 16 + 12; const x1 = 304 - 12 - 2; const y0 = 20 + 12; const y1 = 380 - 12 - 2;
  fillRect(img, x0, y0, x1 - x0 + 2, 2, 70); fillRect(img, x0, y1, x1 - x0 + 2, 2, 70);
  fillRect(img, x0, y0, 2, y1 - y0 + 2, 70); fillRect(img, x1, y0, 2, y1 - y0 + 2, 70);
  for (let y = y0 + 16; y < y1 - 10; y += 12) for (let x = x0 + 14; x < x1 - 20; x += 10) fillRect(img, x, y, 6, 3, 50);
  addNoise(img, 4, 7);
  return img;
}

/** @testSeam A single sheet with a full-height printed rule (a form gridline) at x 100 and text on both sides of it. */
export function griddedSheet(): GrayImage {
  const img = solid(320, 400, 60);
  fillRect(img, 16, 20, 288, 360, 225);
  fillRect(img, 100, 30, 2, 340, 70);
  for (let y = 46; y < 360; y += 12) {
    for (let x = 30; x < 90; x += 10) fillRect(img, x, y, 6, 3, 50);
    for (let x = 116; x < 290; x += 10) fillRect(img, x, y, 6, 3, 50);
  }
  addNoise(img, 4, 7);
  return img;
}

/** @testSeam The x of the crease in twoPages(). */
export const TWO_PAGES_CREASE = Math.round(0.62 * 320);

/** @testSeam Two facing pages (200 and 195) on a table of 60, 320x427, with text on both; `fold` paints the gap
 * between them (a thin crease by default). */
export function twoPages(fold: (img: GrayImage) => void = (img) => fillRect(img, TWO_PAGES_CREASE - 1, 40, 2, 350, 120)): GrayImage {
  const W = 320; const H = 427; const crease = TWO_PAGES_CREASE;
  const img = solid(W, H, 60);
  fillRect(img, 30, 40, W - 30, 350, 200);
  fillRect(img, crease, 40, W - crease, 350, 195);
  fold(img);
  for (let y = 60; y < 370; y += 12) {
    for (let x = 45; x < crease - 20; x += 10) fillRect(img, x, y, 6, 3, 50);
    for (let x = crease + 20; x < W - 15; x += 10) fillRect(img, x, y, 6, 3, 50);
  }
  addNoise(img, 4, 11);
  return img;
}
