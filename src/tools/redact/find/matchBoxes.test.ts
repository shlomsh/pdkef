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
    // The cut edge (between "e" and "l") widens by 0.35em = 4.2pt = 0.7%;
    // the item's own end is not a cut and gets only the 1pt pad.
    expect(box.left).toBeCloseTo(19.8333 - 0.7, 3);
    expect(box.top).toBeCloseTo(10.875, 3);
    expect(box.width).toBeCloseTo(5.3333 + 0.7, 3);
    expect(box.height).toBeCloseTo(2.125, 3);
  });

  it('measures a mid-item RTL match from the right', () => {
    const item: PlacedItem = {
      start: 0, end: 5, transform: [1, 0, 0, 1, 100, 700], width: 50, height: 12, rtl: true,
    };
    const page = pageOf([item], 'שלום2');
    const [box] = matchBoxes(page, { start: 2, end: 5 }, geometry);
    // Measured from the right: the cut is on the box's right edge.
    expect(box.left).toBeCloseTo(16.5, 3);
    expect(box.top).toBeCloseTo(10.875, 3);
    expect(box.width).toBeCloseTo(5.3333 + 0.7, 3);
    expect(box.height).toBeCloseTo(2.125, 3);
  });

  it('covers the real glyphs of a proportional font when given a measure', () => {
    // "iiiiWW": four narrow letters (1 unit) then two wide ones (4 units), 120pt
    // in all, so "WW" really starts 40pt in. An equal share per letter would
    // put it at 80pt and leave the first W uncovered.
    const item: PlacedItem = {
      start: 0, end: 6, transform: [1, 0, 0, 1, 100, 700], width: 120, height: 12, rtl: false,
    };
    const page = pageOf([item], 'iiiiWW');
    const measure = (text: string) => [...text].reduce((sum, ch) => sum + (ch === 'W' ? 4 : 1), 0);
    const [measured] = matchBoxes(page, { start: 4, end: 6 }, geometry, measure);
    const [counted] = matchBoxes(page, { start: 4, end: 6 }, geometry);
    const leftPt = (box: { left: number }) => (box.left / 100) * 600;
    expect(leftPt(measured)).toBeLessThanOrEqual(140);
    expect(leftPt(counted)).toBeGreaterThan(140);
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
