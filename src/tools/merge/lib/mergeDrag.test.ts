import { describe, expect, it } from 'vitest';
import { cardInsertIndex, pointWithin, rowInsertIndex } from './mergeDrag.ts';

describe('pointWithin', () => {
  const rect = { left: 10, right: 20, top: 10, bottom: 20 };

  it('includes the edges and the slack around them', () => {
    expect(pointWithin(rect, 10, 20, 0)).toBe(true);
    expect(pointWithin(rect, 8, 22, 2)).toBe(true);
  });

  it('excludes points past the slack', () => {
    expect(pointWithin(rect, 7, 15, 2)).toBe(false);
    expect(pointWithin(rect, 15, 23, 2)).toBe(false);
  });
});

describe('rowInsertIndex', () => {
  const rows = [{ top: 0, bottom: 40 }, { top: 40, bottom: 80 }];

  it('picks the first row whose middle is below the pointer', () => {
    expect(rowInsertIndex(rows, 10)).toBe(0);
    expect(rowInsertIndex(rows, 30)).toBe(1);
  });

  it('is the row count past the last middle, and 0 for an empty list', () => {
    expect(rowInsertIndex(rows, 70)).toBe(2);
    expect(rowInsertIndex([], 5)).toBe(0);
  });
});

describe('cardInsertIndex', () => {
  const cards = [{ left: 0, right: 100 }, { left: 100, right: 200 }];

  it('reads left to right in a left-to-right grid', () => {
    expect(cardInsertIndex(cards, 20, false)).toBe(0);
    expect(cardInsertIndex(cards, 120, false)).toBe(1);
    expect(cardInsertIndex(cards, 190, false)).toBe(2);
  });

  it('mirrors in a right-to-left grid', () => {
    expect(cardInsertIndex(cards, 190, true)).toBe(0);
    expect(cardInsertIndex(cards, 60, true)).toBe(0);
    expect(cardInsertIndex(cards, 40, true)).toBe(2);
    expect(cardInsertIndex(cards, 20, true)).toBe(2);
  });
});
