import { describe, expect, it } from 'vitest';
import type { TextRow } from '#lib/pageLayout/textRows.ts';
import { inkTextBounds, medianBounds } from './inkBounds.ts';

const row = (left: number, right: number): TextRow => ({ top: 0, bottom: 10, left, right, gaps: [] });
const body = (n: number, left = 100, right = 700) => Array.from({ length: n }, () => row(left, right));

describe('inkTextBounds', () => {
  it('reads the body edges as fractions of the page width', () => {
    expect(inkTextBounds(body(10), 800)).toEqual({ left: 0.125, right: 0.875 });
  });
  it('ignores a page-number row and a stray short row', () => {
    const rows = [...body(10), row(380, 420), row(50, 110)];
    expect(inkTextBounds(rows, 800)).toEqual({ left: 0.125, right: 0.875 });
  });
  it('lets one outlier line at each edge fall outside the 10th and 90th percentiles', () => {
    const rows = [row(10, 700), ...body(8), row(100, 790)];
    expect(inkTextBounds(rows, 800)).toEqual({ left: 0.125, right: 0.875 });
  });
  it('is null with fewer than three rows', () => {
    expect(inkTextBounds(body(2), 800)).toBeNull();
    expect(inkTextBounds([], 800)).toBeNull();
  });
  it('is null when the span is under 30% of the width', () => {
    expect(inkTextBounds(body(10, 300, 500), 800)).toBeNull();
  });
});

describe('medianBounds', () => {
  it('takes the median left and right of the pages that had bounds', () => {
    expect(medianBounds([{ left: 0.1, right: 0.9 }, null, { left: 0.2, right: 0.8 }, { left: 0.3, right: 0.7 }]))
      .toEqual({ left: 0.2, right: 0.8 });
  });
  it('is null when no page had any', () => {
    expect(medianBounds([null, null])).toBeNull();
    expect(medianBounds([])).toBeNull();
  });
});
