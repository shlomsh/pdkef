import { describe, expect, it } from 'vitest';
import {
  elementIsOnField,
  elementOnField,
  fieldPosition,
  orderTypableFields,
  type TypableField,
} from './fieldOrder.ts';
import type { CombRegion, FieldRegion } from './combPlacement.ts';

// A4 page percentages throughout. Two rows of two fields each on page 0, one
// field on page 1 - enough to tell "rows top to bottom" from "within a row by
// direction" from "page by page", and to make the wrong order visible.
const comb = (pageIndex: number, left: number, top: number, width = 15, cells = 9): CombRegion => (
  { pageIndex, left, top, width, height: 0.84, cells }
);
const cell = (pageIndex: number, left: number, top: number, width = 20): FieldRegion => (
  { pageIndex, left, top, width, height: 1.6 }
);

const rowOneRight = comb(0, 70, 27.3);   // identity number
const rowOneLeft = comb(0, 20, 27.5);    // a date, same printed line
const rowTwoRight = cell(0, 55, 33.2);   // a name cell on the next line
const rowTwoLeft = comb(0, 10, 33.0);
const pageTwo = comb(1, 40, 10);

const rtl = () => 'rtl' as const;
const ltr = () => 'ltr' as const;
const regionsOf = (fields: TypableField[]) => fields.map((field) => field.region);

describe('orderTypableFields', () => {
  it('walks a right-to-left page rows top to bottom, each row right to left', () => {
    const order = orderTypableFields(
      [pageTwo, rowOneLeft, rowTwoLeft, rowOneRight],
      [rowTwoRight],
      rtl,
    );
    expect(regionsOf(order)).toEqual([rowOneRight, rowOneLeft, rowTwoRight, rowTwoLeft, pageTwo]);
  });

  it('walks a left-to-right page rows top to bottom, each row left to right', () => {
    const order = orderTypableFields(
      [pageTwo, rowOneLeft, rowTwoLeft, rowOneRight],
      [rowTwoRight],
      ltr,
    );
    expect(regionsOf(order)).toEqual([rowOneLeft, rowOneRight, rowTwoLeft, rowTwoRight, pageTwo]);
  });

  it('asks the direction per page, so a mixed document reads each page its own way', () => {
    const order = orderTypableFields(
      [rowOneLeft, rowOneRight, comb(1, 60, 10), comb(1, 20, 10.2)],
      [],
      (pageIndex) => (pageIndex === 0 ? 'rtl' : 'ltr'),
    );
    expect(regionsOf(order).map((r) => [r.pageIndex, r.left])).toEqual([[0, 70], [0, 20], [1, 20], [1, 60]]);
  });

  it('keeps a comb and a taller cell on the same printed line in one row', () => {
    // The comb's teeth (27.3-28.14) hang inside the band the cell spans
    // (26.6-28.2): one baseline, two ink heights.
    const shortComb = comb(0, 60, 27.3);
    const tallCell = cell(0, 20, 26.6);
    const order = orderTypableFields([shortComb], [tallCell], rtl);
    expect(regionsOf(order)).toEqual([shortComb, tallCell]);
  });

  it('splits rows a line of text apart, even when the upper row is the leftmost', () => {
    const upperLeft = comb(0, 10, 20);
    const lowerRight = comb(0, 70, 21.5);
    expect(regionsOf(orderTypableFields([lowerRight, upperLeft], [], rtl))).toEqual([upperLeft, lowerRight]);
  });

  it('tags each field with the detector it came from', () => {
    const order = orderTypableFields([rowOneRight], [rowTwoRight], rtl);
    expect(order.map((field) => field.kind)).toEqual(['comb', 'cell']);
  });

  it('is empty for a page with nothing detected', () => {
    expect(orderTypableFields([], [], rtl)).toEqual([]);
  });
});

describe('elementIsOnField', () => {
  const field: TypableField = { kind: 'comb', region: rowOneRight };
  const text = (left: number, top: number, pageIndex = 0, type = 'text') => ({ id: 'x', type, pageIndex, left, top });

  it('matches a box placed on the run by placeCombOnRegion (left edge, lifted above the rule)', () => {
    expect(elementIsOnField(text(70, 26.1), field)).toBe(true);
  });

  it('rejects a box merely sitting at the field\'s right edge - every placement anchors left now, so this is only ever a coincidence', () => {
    expect(elementIsOnField(text(85, 27), field)).toBe(false);
  });

  it('does not also claim its left-hand neighbour\'s box when two fields sit edge to edge, sharing one boundary', () => {
    // leftNeighbour's right edge (55 + 15 = 70) lands exactly on rowOneRight's
    // own left edge - the false hit this test guards against (MOBI-06 field
    // navigation, live QA on health-declaration-page1-geometry.pdf: two
    // adjacent form cells did exactly this).
    const leftNeighbour: TypableField = { kind: 'comb', region: comb(0, 55, 27.3) };
    expect(elementIsOnField(text(70, 26.1), leftNeighbour)).toBe(false);
  });

  it('a box placed just below a field it does not belong to can still satisfy that field in isolation - see elementOnField below', () => {
    // upper's bottom edge (27.3 + 0.84 = 28.14) is lower's own top. A box a
    // little above lower's own top (28.05, e.g. a boxed comb whose baseline
    // centring lands slightly above region.top - see ON_FIELD_ABOVE's own
    // doc) still falls inside upper's band too: the allowance only ever
    // extends a field's LOWER bound upward past its own top, never its upper
    // bound past top + height, but upper's fixed upper bound (28.14) still
    // reaches past lower's own top (28.12... here 28.14) into lower's
    // territory. elementIsOnField alone cannot tell these apart - it looks at
    // one field at a time - which is exactly why fieldPosition/elementOnField
    // resolve through the whole order instead of trusting a single field's
    // own verdict (MOBI-06 live QA: Next from the last field in a row looped
    // back into that row instead of reaching the row below, before that fix).
    const upper: TypableField = { kind: 'comb', region: { ...comb(0, 70, 27.3), boxed: true } };
    const lower: TypableField = { kind: 'comb', region: { ...comb(0, 70, 28.14), boxed: true } };
    expect(elementIsOnField(text(70, 28.05), upper)).toBe(true);
    expect(elementIsOnField(text(70, 28.05), lower)).toBe(true);
  });

  it('rejects a box beside, below, on another page, or of another type', () => {
    expect(elementIsOnField(text(60, 27), field)).toBe(false);
    expect(elementIsOnField(text(70, 29), field)).toBe(false);
    expect(elementIsOnField(text(70, 27, 1), field)).toBe(false);
    expect(elementIsOnField(text(70, 27, 0, 'signature'), field)).toBe(false);
  });
});

describe('elementOnField', () => {
  const field: TypableField = { kind: 'comb', region: rowOneRight };
  const text = (left: number, top: number, pageIndex = 0, type = 'text') => ({ id: 'x', type, pageIndex, left, top });

  it('returns the element sitting on the field, or null', () => {
    const on = text(70, 26.5);
    expect(elementOnField([text(5, 5), on], [field], field)).toBe(on);
    expect(elementOnField([text(5, 5)], [field], field)).toBeNull();
  });

  it('does not return a box that really belongs to the field above it, even though it technically satisfies this one too', () => {
    // Same no-gap pair as the elementIsOnField test above: `onLower` is
    // centred on `lower`, not `upper`, but its own top still falls inside
    // `upper`'s generously-toleranced band. Checking `upper` alone (the old
    // elementOnField(elements, field) signature) found it anyway and
    // reopened it instead of creating a new box on `upper` - resolving
    // through the whole order, the way fieldPosition already had to, is what
    // fixes it (MOBI-06 live QA, health-declaration-page1-geometry.pdf).
    const upper: TypableField = { kind: 'comb', region: { ...comb(0, 70, 27.3), boxed: true } };
    const lower: TypableField = { kind: 'comb', region: { ...comb(0, 70, 28.14), boxed: true } };
    const order = [upper, lower];
    const onLower = text(70, 28.05);
    expect(elementOnField([onLower], order, upper)).toBeNull();
    expect(elementOnField([onLower], order, lower)).toBe(onLower);
  });
});

describe('fieldPosition', () => {
  const order = orderTypableFields([rowOneRight, rowOneLeft, rowTwoLeft, pageTwo], [rowTwoRight], rtl);
  // order: rowOneRight(0) rowOneLeft(1) rowTwoRight(2) rowTwoLeft(3) pageTwo(4)

  it('starts at the first field with nothing selected, and Previous starts at the last', () => {
    expect(fieldPosition(order, null)).toEqual({ index: null, next: 0, previous: 4 });
  });

  it('reports a field\'s own index and its two neighbours', () => {
    const onRowOneLeft = { id: 'a', type: 'text', pageIndex: 0, left: 20, top: 26.2 };
    expect(fieldPosition(order, onRowOneLeft)).toEqual({ index: 1, next: 2, previous: 0 });
  });

  it('has no Next on the last field and no Previous on the first', () => {
    expect(fieldPosition(order, { id: 'a', type: 'text', pageIndex: 1, left: 40, top: 9 }).next).toBeNull();
    expect(fieldPosition(order, { id: 'a', type: 'text', pageIndex: 0, left: 70, top: 26.2 }).previous).toBeNull();
  });

  it('walks forward from a hand-placed box between two rows instead of restarting', () => {
    const between = { id: 'a', type: 'text', pageIndex: 0, left: 45, top: 30 };
    expect(fieldPosition(order, between)).toEqual({ index: null, next: 2, previous: 1 });
  });

  it('continues onto the next page from a box below every field on this one', () => {
    const foot = { id: 'a', type: 'text', pageIndex: 0, left: 45, top: 90 };
    expect(fieldPosition(order, foot)).toEqual({ index: null, next: 4, previous: 3 });
  });

  it('has nowhere to go with no fields at all', () => {
    expect(fieldPosition([], null)).toEqual({ index: null, next: null, previous: null });
  });
});

describe('fieldPosition – adjacent rows in the same column, no gap between them', () => {
  // A tiled grid with a row pitch (0.84) under the old, unconditional
  // ON_FIELD_ABOVE (2.5): two boxed comb rows, same left, stacked with no gap
  // - row1's bottom edge is exactly row2's top. Reproduces the live-QA bug
  // (health-declaration-page1-geometry.pdf) where Next from the last field of
  // a row landed back in that same row instead of reaching the row below.
  const row1 = { ...comb(0, 6, 27.28), boxed: true };
  const row2 = { ...comb(0, 6, 28.12), boxed: true }; // 27.28 + 0.84
  const order = orderTypableFields([row1, row2], [], ltr);

  it('resolves an element centred on the lower field to that field, not the one above it', () => {
    // Centred within row2's own box (placeCombOnRegion's boxed branch keeps a
    // placed box within [top, top+height]), not merely at its top edge.
    const onRow2 = { id: 'a', type: 'text', pageIndex: 0, left: 6, top: 28.4 };
    expect(fieldPosition(order, onRow2)).toEqual({ index: 1, next: null, previous: 0 });
  });

  it('so Next from the last field of row1 reaches row2, and does not loop back to row1', () => {
    const onRow1 = { id: 'a', type: 'text', pageIndex: 0, left: 6, top: 27.6 };
    const { next } = fieldPosition(order, onRow1);
    expect(next).toBe(1);
    expect(order[next!].region).toBe(row2);
  });
});
