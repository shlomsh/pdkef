import { describe, expect, it } from 'vitest';
import { enterKeyHint, fillOrder } from './fillOrder.ts';
import type { FillItem } from './fillTypes.ts';
import type { PercentBox } from '../../../editor/text/combPlacement.ts';

// A4 page percentages throughout, the same fixture shape as
// src/editor/text/fieldOrder.test.ts: enough to tell "rows top to bottom"
// from "within a row by direction" from "page by page" apart, mixing slot
// and text items so kind never leaks into the order.
function slot(key: string, pageIndex: number, left: number, top: number, width = 15, height = 0.84): FillItem {
  return {
    kind: 'slot',
    key,
    slot: {
      key,
      pageIndex,
      field: null,
      placement: { box: { left, top, width, height }, fontSize: 11, fontFamily: 'Arimo' },
    },
  };
}

function text(key: string, pageIndex: number, left: number, top: number): FillItem {
  return { kind: 'text', key, element: { id: key, type: 'text', pageIndex, left, top, text: 'x' } };
}

// A placed text element has no stored width/height (TextElement.tsx sizes it
// intrinsically); a fixed nominal box is enough to exercise row clustering
// and the start edge, the same way a caller building a fill layer would pick
// some measured rect for it.
function boxOf(item: FillItem): PercentBox & { pageIndex: number } {
  if (item.kind === 'slot') return { ...item.slot.placement.box, pageIndex: item.slot.pageIndex };
  return { left: item.element.left, top: item.element.top, width: 10, height: 1.6, pageIndex: item.element.pageIndex };
}

describe('fillOrder', () => {
  it('orders page, then row, then the start edge, right to left on an RTL page, slots and text interleaved', () => {
    const rowOneSlot = slot('identity', 0, 70, 27.3);
    const rowOneText = text('note', 0, 20, 27.5);
    const rowTwoText = text('name', 0, 55, 33.2);
    const rowTwoSlot = slot('date', 0, 10, 33.0);
    const pageTwoSlot = slot('page-two', 1, 40, 10);

    const ordered = fillOrder(
      [pageTwoSlot, rowOneText, rowTwoSlot, rowOneSlot, rowTwoText],
      boxOf,
      () => 'rtl',
    );

    expect(ordered.map((item) => item.key)).toEqual(['identity', 'note', 'name', 'date', 'page-two']);
  });

  it('reads a row left to right on an LTR page', () => {
    const left = slot('left', 0, 10, 10);
    const right = text('right', 0, 40, 10.1);
    expect(fillOrder([right, left], boxOf, () => 'ltr').map((item) => item.key)).toEqual(['left', 'right']);
  });

  it('asks the direction per page, so a mixed document reads each page its own way', () => {
    const rtlRight = slot('p0-right', 0, 70, 10);
    const rtlLeft = text('p0-left', 0, 20, 10.1);
    const ltrLeft = slot('p1-left', 1, 20, 10);
    const ltrRight = text('p1-right', 1, 60, 10.1);

    const order = fillOrder(
      [ltrRight, rtlLeft, ltrLeft, rtlRight],
      boxOf,
      (pageIndex) => (pageIndex === 0 ? 'rtl' : 'ltr'),
    );

    expect(order.map((item) => item.key)).toEqual(['p0-right', 'p0-left', 'p1-left', 'p1-right']);
  });

  it('keeps items with an equal start edge in their original order (a stable sort)', () => {
    const a = slot('a', 0, 20, 10);
    const b = text('b', 0, 20, 10); // same left, same row as a: nothing to break the tie but input order
    expect(fillOrder([a, b], boxOf, () => 'ltr').map((item) => item.key)).toEqual(['a', 'b']);
    expect(fillOrder([b, a], boxOf, () => 'ltr').map((item) => item.key)).toEqual(['b', 'a']);
  });

  it('is empty for no items', () => {
    expect(fillOrder([], boxOf, () => 'ltr')).toEqual([]);
  });
});

describe('enterKeyHint', () => {
  it('is "next" for every index before the last', () => {
    expect(enterKeyHint(0, 3)).toBe('next');
    expect(enterKeyHint(1, 3)).toBe('next');
  });

  it('is "done" on the last index', () => {
    expect(enterKeyHint(2, 3)).toBe('done');
  });

  it('is "done" for the only field in a one-field form', () => {
    expect(enterKeyHint(0, 1)).toBe('done');
  });
});
