import { describe, expect, it } from 'vitest';
import { shortLineCounts } from './lineEnds.ts';
import type { GrayImage } from '#lib/pageEnhance/quad.ts';

const W = 1000;
const H = 700;

/** A page of full lines between `left` and `right`, with every fourth line short and pushed to `side`. */
function page(img: GrayImage, left: number, right: number, side: 'left' | 'right'): void {
  for (let row = 0, y = 40; y < H - 40; row += 1, y += 14) {
    const short = row % 4 === 3;
    const from = short && side === 'right' ? right - (right - left) * 0.4 : left;
    const to = short && side === 'left' ? left + (right - left) * 0.4 : right;
    for (let dy = 0; dy < 7; dy += 1) img.data.fill(0, (y + dy) * W + Math.round(from), (y + dy) * W + Math.round(to));
  }
}

const sheet = (): GrayImage => ({ width: W, height: H, data: new Uint8ClampedArray(W * H).fill(255) });

describe('shortLineCounts', () => {
  it('counts short lines against the right, where Hebrew paragraphs end at the left', () => {
    const img = sheet();
    page(img, 60, 440, 'right');
    page(img, 560, 940, 'right');
    const { left, right } = shortLineCounts(img, 0.5);
    expect(right).toBeGreaterThan(8);
    expect(left).toBe(0);
  });

  it('counts short lines against the left on a Latin page', () => {
    const img = sheet();
    page(img, 60, 440, 'left');
    page(img, 560, 940, 'left');
    const { left, right } = shortLineCounts(img, 0.5);
    expect(left).toBeGreaterThan(8);
    expect(right).toBe(0);
  });

  it('reads past a solid spine, which touches every row', () => {
    const img = sheet();
    page(img, 60, 440, 'right');
    page(img, 560, 940, 'right');
    for (let y = 0; y < H; y += 1) img.data.fill(0, y * W + 499, y * W + 502);
    expect(shortLineCounts(img, 0.5).right).toBeGreaterThan(8);
  });

  it('counts nothing on an empty sheet', () => {
    expect(shortLineCounts(sheet(), 0.5)).toEqual({ left: 0, right: 0 });
  });
});
