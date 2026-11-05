import { describe, expect, it } from 'vitest';
import type { GrayImage } from './quad';
import { seededRandom } from './seededRandom.test-helper';
import { readSpine, spineInBorder, spreadHalves } from './spine';

const W = 800;
const H = 600;

function blank(width = W, height = H): GrayImage {
  return { width, height, data: new Uint8ClampedArray(width * height).fill(255) };
}

function fillRect(img: GrayImage, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = Math.max(0, y0); y < Math.min(img.height, y1); y += 1) {
    for (let x = Math.max(0, x0); x < Math.min(img.width, x1); x += 1) img.data[y * img.width + x] = 0;
  }
}

/** Lines of random "words" between x0 and x1. */
function text(img: GrayImage, x0: number, x1: number, seed: number): void {
  const rnd = seededRandom(seed);
  for (let y = 40; y < img.height - 40; y += 16) {
    let x = x0;
    while (x < x1) {
      const len = 12 + Math.floor(rnd() * 40);
      if (rnd() < 0.8) fillRect(img, x, y, Math.min(x + len, x1), y + 7);
      x += len + 6;
    }
  }
}

/** A 3 px dark line whose x at the middle row is `mid` (0..1) and that leans `deg` degrees. */
function line(img: GrayImage, mid: number, deg: number): void {
  const t = Math.tan((deg * Math.PI) / 180);
  for (let y = 0; y < img.height; y += 1) {
    const x = Math.round(mid * img.width + (y - img.height / 2) * t);
    fillRect(img, x - 1, y, x + 2, y + 1);
  }
}

/** The sheet slid row by row, so everything on it leans `deg` degrees about the middle row. */
function leaned(img: GrayImage, deg: number): GrayImage {
  const t = Math.tan((deg * Math.PI) / 180);
  const out = blank(img.width, img.height);
  for (let y = 0; y < img.height; y += 1) {
    const shift = Math.round((y - img.height / 2) * t);
    for (let x = 0; x < img.width; x += 1) {
      const from = x - shift;
      if (from >= 0 && from < img.width) out.data[y * img.width + x] = img.data[y * img.width + from];
    }
  }
  return out;
}

function truth(mid: number, deg: number): { top: number; bottom: number } {
  const t = Math.tan((deg * Math.PI) / 180);
  return { top: mid - (H / 2) * t / W, bottom: mid + (H / 2) * t / W };
}

describe('readSpine', () => {
  for (const deg of [1.2, -1.2, 3.1, -3.1, 8, -8]) {
    it(`finds a spine line tilted ${deg} degrees`, () => {
      const img = blank();
      text(img, 40, 360, 1);
      text(img, 440, 760, 2);
      line(img, 0.5, 0);
      const read = readSpine(leaned(img, deg));
      const want = truth(0.5, deg);
      expect(read?.sure).toBe(true);
      expect(Math.abs(read!.spine.top - want.top)).toBeLessThan(0.01);
      expect(Math.abs(read!.spine.bottom - want.bottom)).toBeLessThan(0.01);
    });
  }

  it('says nothing for one page of text with no line', () => {
    const img = blank();
    text(img, 60, 740, 3);
    expect(readSpine(img)).toBeNull();
  });

  it('says nothing for one page with a narrow column gap and no line', () => {
    const img = blank();
    text(img, 60, 390, 4);
    text(img, 410, 740, 5);
    expect(readSpine(img)).toBeNull();
  });

  it('says nothing for a table rule off centre at 0.2', () => {
    const img = blank();
    text(img, 60, 740, 6);
    line(img, 0.2, 0);
    expect(readSpine(img)).toBeNull();
  });

  it('says nothing for an upright page of two columns with a rule between them', () => {
    const img = blank(600, 800);
    text(img, 40, 285, 7);
    text(img, 315, 560, 8);
    line(img, 0.5, 0);
    expect(readSpine(img)).toBeNull();
  });

  it('is sure of a thin grey line in clean paper, which a small copy has made faint', () => {
    const img = blank();
    text(img, 40, 360, 9);
    text(img, 440, 760, 10);
    for (let y = 0; y < H; y += 1) img.data[y * W + W / 2] = 170;
    expect(readSpine(img)?.sure).toBe(true);
  });

  it('is not sure of a line with print beside it: a crease or a table rule', () => {
    const img = blank();
    text(img, 60, 740, 11);
    line(img, 0.5, 0);
    const read = readSpine(img);
    expect(read?.sure).toBe(false);
    expect(read!.spine.top).toBeCloseTo(0.5, 2);
  });

  it('is not sure of a clear gap between two blocks of text with no line, and places the line in it', () => {
    const img = blank();
    text(img, 40, 350, 12);
    text(img, 430, 760, 13);
    const read = readSpine(img);
    expect(read?.sure).toBe(false);
    expect((read!.spine.top + read!.spine.bottom) / 2).toBeCloseTo(390 / W, 1);
  });

  it('follows a gap that leans', () => {
    const img = blank();
    text(img, 40, 340, 14);
    text(img, 440, 760, 15);
    const read = readSpine(leaned(img, 4));
    expect(read?.sure).toBe(false);
    expect(read!.spine.bottom - read!.spine.top).toBeCloseTo((H * Math.tan((4 * Math.PI) / 180)) / W, 1);
  });

  it('says nothing for a gap with print on one side only', () => {
    const img = blank();
    text(img, 430, 760, 16);
    expect(readSpine(img)).toBeNull();
  });
});

describe('spineInBorder', () => {
  it('gives the line in the bordered picture, carried out to its top and bottom', () => {
    const inside = spineInBorder({ top: 0.4, bottom: 0.6 }, { left: 0.1, top: 0.1, right: 0.1, bottom: 0.1 });
    expect(inside.top).toBeCloseTo((0.38 + 0.1) / 1.2, 5);
    expect(inside.bottom).toBeCloseTo((0.62 + 0.1) / 1.2, 5);
  });
});

describe('spreadHalves', () => {
  it('shares the spine edge and covers the sheet', () => {
    const [left, right] = spreadHalves({ top: 0.48, bottom: 0.53 });
    expect(left[1]).toEqual(right[0]);
    expect(left[2]).toEqual(right[3]);
    expect(left[0]).toEqual({ x: 0, y: 0 });
    expect(left[3]).toEqual({ x: 0, y: 1 });
    expect(right[1]).toEqual({ x: 1, y: 0 });
    expect(right[2]).toEqual({ x: 1, y: 1 });
    const area = (q: typeof left) =>
      Math.abs(q.reduce((s, p, i) => s + p.x * q[(i + 1) % 4].y - q[(i + 1) % 4].x * p.y, 0)) / 2;
    expect(area(left) + area(right)).toBeCloseTo(1, 9);
  });
});
