import { describe, expect, it } from 'vitest';
import { createPageGeometry } from '../../../editor/geometry/coords.ts';
import { buildPageText } from './pageText.ts';
import { matchBoxes } from './matchBoxes.ts';
import type { PageText, PlacedItem, TextItemLike } from './types.ts';

const geometry = createPageGeometry({ cropBox: { x: 0, y: 0, width: 600, height: 800 }, rotation: 0, userUnit: 1 });

function pageOf(items: PlacedItem[], text: string): PageText {
  return { pageIndex: 0, text, items };
}

describe('matchBoxes', () => {
  it('gives a box proportionally inside an LTR item for a mid-item match', () => {
    const item: PlacedItem = {
      start: 0, end: 5, transform: [1, 0, 0, 1, 100, 700], width: 50, height: 12, rtl: false,
    };
    const page = pageOf([item], 'Hello');
    const [box] = matchBoxes(page, { start: 2, end: 5 }, geometry);
    expect(box.left).toBeCloseTo(19.8333, 3);
    expect(box.top).toBeCloseTo(10.875, 3);
    expect(box.width).toBeCloseTo(5.3333, 3);
    expect(box.height).toBeCloseTo(2.125, 3);
  });

  it('measures a mid-item RTL match from the right', () => {
    const item: PlacedItem = {
      start: 0, end: 5, transform: [1, 0, 0, 1, 100, 700], width: 50, height: 12, rtl: true,
    };
    const page = pageOf([item], 'שלום2');
    const [box] = matchBoxes(page, { start: 2, end: 5 }, geometry);
    expect(box.left).toBeCloseTo(16.5, 3);
    expect(box.top).toBeCloseTo(10.875, 3);
    expect(box.width).toBeCloseTo(5.3333, 3);
    expect(box.height).toBeCloseTo(2.125, 3);
  });

  function item(str: string, transform: number[], width: number, height = 12): TextItemLike {
    return { str, transform, width, height };
  }

  it('merges a match spanning two items on one line into one box', () => {
    const page = buildPageText(0, [
      item('Hello', [1, 0, 0, 1, 0, 700], 30, 12),
      item('World', [1, 0, 0, 1, 40, 700], 30, 12),
    ]);
    // "Hello World": items at [0,5) and [6,11).
    const boxes = matchBoxes(page, { start: 3, end: 9 }, geometry);
    expect(boxes).toHaveLength(1);
  });

  it('gives two boxes for a match spanning a line break', () => {
    const page = buildPageText(0, [
      item('First', [1, 0, 0, 1, 0, 700], 30, 12),
      item('Second', [1, 0, 0, 1, 0, 680], 30, 12),
    ]);
    // "First\nSecond": items at [0,5) and [6,12).
    const boxes = matchBoxes(page, { start: 3, end: 9 }, geometry);
    expect(boxes).toHaveLength(2);
  });

  it('keeps a box inside 0..100 on a /Rotate 90 page', () => {
    const rotatedGeometry = createPageGeometry({
      cropBox: { x: 0, y: 0, width: 600, height: 800 },
      rotation: 90,
      userUnit: 1,
    });
    const rotatedItem: PlacedItem = {
      start: 0, end: 5, transform: [1, 0, 0, 1, 100, 700], width: 50, height: 12, rtl: false,
    };
    const page = pageOf([rotatedItem], 'Hello');
    const [box] = matchBoxes(page, { start: 0, end: 5 }, rotatedGeometry);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.left).toBeLessThanOrEqual(100);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeLessThanOrEqual(100);
    expect(box.left + box.width).toBeLessThanOrEqual(100);
    expect(box.top + box.height).toBeLessThanOrEqual(100);
  });

  it('returns no boxes when nothing overlaps the range', () => {
    const item: PlacedItem = {
      start: 0, end: 5, transform: [1, 0, 0, 1, 100, 700], width: 50, height: 12, rtl: false,
    };
    const page = pageOf([item], 'Hello');
    expect(matchBoxes(page, { start: 10, end: 15 }, geometry)).toEqual([]);
  });
});
