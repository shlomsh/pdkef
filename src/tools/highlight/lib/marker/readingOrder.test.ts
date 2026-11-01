import { describe, expect, it } from 'vitest';
import { marksInReadingOrder, type OrderedMark } from './readingOrder.ts';

const m = (id: string, pageIndex: number, left: number, top: number, width = 10, height = 2): OrderedMark => ({ id, pageIndex, left, top, width, height });
const ids = (marks: OrderedMark[], dir: 'ltr' | 'rtl' = 'ltr') => marksInReadingOrder(marks, () => dir).map((x) => x.id);

describe('marksInReadingOrder', () => {
  it('orders by page first', () => {
    expect(ids([m('b', 1, 0, 0), m('a', 0, 50, 90)])).toEqual(['a', 'b']);
  });

  it('orders by top within a page', () => {
    expect(ids([m('low', 0, 0, 50), m('high', 0, 80, 10)])).toEqual(['high', 'low']);
  });

  it('marks whose tops are within half a band height share a line and go left to right', () => {
    expect(ids([m('right', 0, 60, 10), m('left', 0, 5, 10.8)])).toEqual(['left', 'right']);
  });

  it('a tops gap over half a band height is a new line', () => {
    expect(ids([m('right', 0, 60, 10), m('left', 0, 5, 11.5)])).toEqual(['right', 'left']);
  });

  it('on a right-to-left page a line goes by right edge, descending', () => {
    expect(ids([m('left', 0, 5, 10), m('right', 0, 60, 10)], 'rtl')).toEqual(['right', 'left']);
  });

  it('asks the direction per page', () => {
    const out = marksInReadingOrder(
      [m('l1', 0, 5, 10), m('l2', 0, 60, 10), m('r1', 1, 5, 10), m('r2', 1, 60, 10)],
      (page) => (page === 1 ? 'rtl' : 'ltr'),
    );
    expect(out.map((x) => x.id)).toEqual(['l1', 'l2', 'r2', 'r1']);
  });

  it('does not mutate its input', () => {
    const input = [m('b', 1, 0, 0), m('a', 0, 0, 0)];
    ids(input);
    expect(input.map((x) => x.id)).toEqual(['b', 'a']);
  });
});
