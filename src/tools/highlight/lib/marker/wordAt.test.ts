import { describe, expect, it } from 'vitest';
import { lineAt, wordAt } from './wordAt.ts';
import type { TextRow } from '#lib/pageLayout/textRows.ts';

const rows: TextRow[] = [
  { top: 10, bottom: 24, left: 10, right: 90, gaps: [[30, 32], [60, 63]] },
  { top: 40, bottom: 54, left: 10, right: 90, gaps: [] },
];

describe('wordAt', () => {
  it('spans the gaps either side of the point', () => {
    expect(wordAt(rows, { x: 45, y: 17 })).toEqual({ left: 32, right: 60, top: 10, bottom: 24 });
  });
  it('runs to the row edge when there is no gap on that side', () => {
    expect(wordAt(rows, { x: 15, y: 17 })).toEqual({ left: 10, right: 30, top: 10, bottom: 24 });
    expect(wordAt(rows, { x: 75, y: 17 })).toEqual({ left: 63, right: 90, top: 10, bottom: 24 });
  });
  it('is null inside a word gap', () => {
    expect(wordAt(rows, { x: 31, y: 17 })).toBeNull();
  });
  it('is null between rows and outside the row', () => {
    expect(wordAt(rows, { x: 45, y: 30 })).toBeNull();
    expect(wordAt(rows, { x: 5, y: 17 })).toBeNull();
    expect(wordAt(rows, { x: 95, y: 17 })).toBeNull();
  });
  it('takes the whole row when it has no gaps', () => {
    expect(wordAt(rows, { x: 50, y: 45 })).toEqual({ left: 10, right: 90, top: 40, bottom: 54 });
  });
});

describe('lineAt', () => {
  it('gives the row left and right', () => {
    expect(lineAt(rows, { x: 45, y: 17 })).toEqual({ left: 10, right: 90, top: 10, bottom: 24 });
  });
  it('gives the line from inside a word gap', () => {
    expect(lineAt(rows, { x: 31, y: 17 })).toEqual({ left: 10, right: 90, top: 10, bottom: 24 });
  });
  it('is null between rows', () => {
    expect(lineAt(rows, { x: 45, y: 30 })).toBeNull();
  });
});
