import { describe, expect, it } from 'vitest';
import { slideIndexAt, slideWindow } from './pageSlides.ts';

describe('slideIndexAt', () => {
  it('rounds to the nearest slide', () => {
    expect(slideIndexAt(0, 400, 5)).toBe(0);
    expect(slideIndexAt(190, 400, 5)).toBe(0);
    expect(slideIndexAt(210, 400, 5)).toBe(1);
    expect(slideIndexAt(800, 400, 5)).toBe(2);
  });
  it('reads RTL negative scrollLeft by its absolute value', () => {
    expect(slideIndexAt(-800, 400, 5)).toBe(2);
    expect(slideIndexAt(-0, 400, 5)).toBe(0);
  });
  it('clamps at both ends', () => {
    expect(slideIndexAt(99999, 400, 5)).toBe(4);
    expect(slideIndexAt(-99999, 400, 5)).toBe(4);
  });
  it('is 0 with no width, no pages or one page', () => {
    expect(slideIndexAt(500, 0, 5)).toBe(0);
    expect(slideIndexAt(500, 400, 0)).toBe(0);
    expect(slideIndexAt(500, 400, 1)).toBe(0);
  });
});

describe('slideWindow', () => {
  it('is the index and its two neighbours', () => {
    expect(slideWindow(3, 8)).toEqual({ from: 2, to: 4 });
  });
  it('clamps at the ends', () => {
    expect(slideWindow(0, 8)).toEqual({ from: 0, to: 1 });
    expect(slideWindow(7, 8)).toEqual({ from: 6, to: 7 });
  });
  it('covers a single page', () => {
    expect(slideWindow(0, 1)).toEqual({ from: 0, to: 0 });
  });
});
