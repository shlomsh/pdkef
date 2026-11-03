import { describe, expect, it } from 'vitest';
import type { TextRow } from '#lib/pageLayout/textRows.ts';
import { inkExtent, inkTextBounds, medianBounds } from './inkBounds.ts';

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
  it('reads the bounds from exactly three rows', () => {
    expect(inkTextBounds(body(3), 800)).toEqual({ left: 0.125, right: 0.875 });
  });
  it('trims the rounded-down tenth of the rows at each edge, so eleven rows drop one a side', () => {
    const rows = [row(10, 700), row(20, 700), ...body(7), row(100, 780), row(100, 790)];
    expect(inkTextBounds(rows, 800)).toEqual({ left: 20 / 800, right: 780 / 800 });
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

describe('inkExtent', () => {
  it('contains every row, including one longer than the rest and a short one', () => {
    const rows = [
      ...Array.from({ length: 9 }, () => ({ top: 0, bottom: 10, left: 100, right: 500 })),
      { top: 20, bottom: 30, left: 60, right: 700 },
      { top: 40, bottom: 50, left: 300, right: 330 },
    ];
    expect(inkExtent(rows as never, 800)).toEqual({ left: 0.075, right: 0.875 });
  });

  it('is null with no rows', () => {
    expect(inkExtent([], 800)).toBeNull();
  });
});
