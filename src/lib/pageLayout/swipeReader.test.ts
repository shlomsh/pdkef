import { describe, it, expect, vi } from 'vitest';
import { createSwipeReader } from './swipeReader.ts';

// Synthetic 300x400 page: words on two lines, rows y 100-114 and 140-154.
const W = 300;
const H = 400;
const rects: Array<[number, number, number, number]> = [];
for (const y of [100, 140]) for (const x of [20, 90]) rects.push([x, y, 40, 14]);

function imageOf(rects: Array<[number, number, number, number]>) {
  return (sx: number, sy: number, w: number, h: number) => {
    const data = new Uint8ClampedArray(w * h * 4).fill(255);
    for (const [x, y, rw, rh] of rects) {
      for (let j = y; j < y + rh; j += 1) {
        for (let i = x; i < x + rw; i += 1) {
          const px = i - sx;
          const py = j - sy;
          if (px >= 0 && px < w && py >= 0 && py < h) data.fill(0, (py * w + px) * 4, (py * w + px) * 4 + 3);
        }
      }
    }
    return { data, width: w, height: h };
  };
}
const fakeImage = imageOf(rects);

const canvasWith = (getImageData: unknown) =>
  ({ width: W, height: H, getContext: () => ({ getImageData }) }) as unknown as HTMLCanvasElement;

// Percent of the page for a canvas pixel.
const px = (x: number, y: number) => ({ x: (x / W) * 100, y: (y / H) * 100 });

describe('createSwipeReader', () => {
  it('returns one band bracketing the line under a swipe along it', () => {
    const reader = createSwipeReader(canvasWith(fakeImage), 400)!;
    const bands = reader.bandsBetween(px(30, 107), px(120, 107));
    expect(bands).toHaveLength(1);
    const top = (100 / H) * 100;
    const bottom = (114 / H) * 100;
    expect(bands[0].top).toBeLessThanOrEqual(top + 0.5);
    expect(bands[0].top + bands[0].height).toBeGreaterThanOrEqual(bottom - 0.5);
    expect(bands[0].height).toBeLessThan(((140 - 100) / H) * 100);
  });

  it('returns two bands for a swipe down to the second line', () => {
    const reader = createSwipeReader(canvasWith(fakeImage), 400)!;
    const bands = reader.bandsBetween(px(30, 107), px(120, 147));
    expect(bands).toHaveLength(2);
    expect(bands[1].top).toBeGreaterThan(bands[0].top);
  });

  it('tells a press on a line of text from one on blank page', () => {
    const reader = createSwipeReader(canvasWith(fakeImage), 400)!;
    expect(reader.onText(px(30, 107))).toBe(true);
    expect(reader.onText(px(30, 127))).toBe(false);
  });

  it('returns null without a 2d context and [] when pixels cannot be read', () => {
    const noCtx = { width: W, height: H, getContext: () => null } as unknown as HTMLCanvasElement;
    expect(createSwipeReader(noCtx, 400)).toBeNull();
    const throwing = canvasWith(() => { throw new Error('tainted'); });
    expect(createSwipeReader(throwing, 400)!.bandsBetween(px(30, 107), px(120, 107))).toEqual([]);
  });

  it('does not re-read the canvas while the swipe stays inside the cached window', () => {
    const getImageData = vi.fn(fakeImage);
    const reader = createSwipeReader(canvasWith(getImageData), 400)!;
    reader.bandsBetween(px(30, 107), px(60, 107));
    expect(getImageData).toHaveBeenCalledTimes(1);
    reader.bandsBetween(px(30, 107), px(100, 108));
    reader.bandsBetween(px(30, 107), px(120, 107));
    expect(getImageData).toHaveBeenCalledTimes(1);
  });

  it('keeps the bands inside the column the swipe started in', () => {
    // Two columns (x 10-138 and 170-298, gutter between); right lines sit 8px lower and overlap the left ones.
    const cols: Array<[number, number, number, number]> = [];
    for (const [x0, dy] of [[10, 0], [170, 8]]) {
      for (const y of [100, 140]) for (const dx of [0, 44, 88]) cols.push([x0 + dx, y + dy, 40, 14]);
    }
    const reader = createSwipeReader(canvasWith(imageOf(cols)), 400)!;
    const bands = reader.bandsBetween(px(200, 115), px(280, 155));
    expect(bands).toHaveLength(2);
    for (const band of bands) {
      expect(band.left).toBeGreaterThanOrEqual((165 / W) * 100);
      expect(band.left + band.width).toBeLessThanOrEqual(((298 + 4) / W) * 100);
      expect(band.height).toBeLessThan((24 / H) * 100);
    }
  });

  it('passes the reading direction to the bands', () => {
    const ltr = createSwipeReader(canvasWith(fakeImage), 400)!.bandsBetween(px(120, 107), px(30, 147));
    const rtl = createSwipeReader(canvasWith(fakeImage), 400, 'rtl')!.bandsBetween(px(120, 107), px(30, 147));
    expect(rtl).not.toEqual(ltr);
  });
});
