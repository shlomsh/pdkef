import { describe, expect, it } from 'vitest';
import { tokenize } from './contentStream.js';
import { collectInkFromTokens } from './pageInk.js';

const ink = (stream) => collectInkFromTokens(tokenize(new TextEncoder().encode(stream)));

describe('collectInkFromTokens', () => {
  it('reports a stroked vertical segment in page coordinates', () => {
    const { verticals, horizontals } = ink('100 200 m 100 210 l S');
    expect(verticals).toEqual([{ x: 100, y0: 200, y1: 210 }]);
    expect(horizontals).toEqual([]);
  });

  it('reports a horizontal segment separately from a vertical one', () => {
    const { verticals, horizontals } = ink('10 20 m 90 20 l S 10 20 m 10 60 l S');
    expect(horizontals).toEqual([{ y: 20, x0: 10, x1: 90 }]);
    expect(verticals).toEqual([{ x: 10, y0: 20, y1: 60 }]);
  });

  it('ignores a path that is constructed but never painted', () => {
    expect(ink('100 200 m 100 210 l n').verticals).toEqual([]);
  });

  it('does not report a clipping rectangle as ink', () => {
    // `re W* n` is how the health declaration issues 1,027 of its 1,635 `re`
    // operators. Counting them as boxes invents 76 phantom checkboxes.
    expect(ink('10 10 30 30 re W* n').rects).toEqual([]);
  });

  it('records whether a painted rectangle was stroked, filled, or both', () => {
    expect(ink('0 0 10 10 re f').rects[0]).toMatchObject({ filled: true, stroked: false });
    expect(ink('0 0 10 10 re S').rects[0]).toMatchObject({ filled: false, stroked: true });
    expect(ink('0 0 10 10 re B').rects[0]).toMatchObject({ filled: true, stroked: true });
  });

  it('closes a subpath with `h` so the closing edge is ink too', () => {
    const open = '10 10 m 30 10 l 30 40 l 10 40 l';
    expect(ink(`${open} S`).verticals.map((edge) => edge.x)).toEqual([30]);
    expect(ink(`${open} h S`).verticals.map((edge) => edge.x).sort((a, b) => a - b))
      .toEqual([10, 30]);
  });

  it('advances the pen through a curve without inventing a segment', () => {
    // The control points are not axis-aligned ink, but dropping the endpoint
    // would attach the following `l` to a stale position.
    const { verticals } = ink('10 10 m 20 20 30 20 40 10 c 40 60 l S');
    expect(verticals).toEqual([{ x: 40, y0: 10, y1: 60 }]);
  });
});

describe('the current transformation matrix', () => {
  it('places a segment where `cm` puts it, not where its operands say', () => {
    const { verticals } = ink('q 1 0 0 1 300 500 cm 0 0 m 0 10 l S Q');
    expect(verticals).toEqual([{ x: 300, y0: 500, y1: 510 }]);
  });

  it('composes nested `cm` operators', () => {
    const { verticals } = ink('q 1 0 0 1 100 100 cm q 1 0 0 1 50 20 cm 0 0 m 0 10 l S Q Q');
    expect(verticals).toEqual([{ x: 150, y0: 120, y1: 130 }]);
  });

  it('restores the matrix at `Q`, so a later path is not dragged along', () => {
    const { verticals } = ink('q 1 0 0 1 300 500 cm 0 0 m 0 10 l S Q 7 0 m 7 10 l S');
    expect(verticals).toEqual([
      { x: 300, y0: 500, y1: 510 },
      { x: 7, y0: 0, y1: 10 },
    ]);
  });

  it('applies scale, so a unit-square rectangle lands at its drawn size', () => {
    const { rects } = ink('q 4 0 0 2 10 20 cm 0 0 1 1 re f Q');
    expect(rects[0]).toMatchObject({ x: 10, y: 20, width: 4, height: 2 });
  });

  it('keeps a rotated rectangle axis-aligned by its bounding box', () => {
    const { rects } = ink('q 0 1 -1 0 0 0 cm 0 0 10 4 re f Q');
    expect(rects[0]).toMatchObject({ x: -4, y: 0, width: 4, height: 10 });
  });
});
