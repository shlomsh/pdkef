import { describe, expect, it } from 'vitest';
import { printPlan, type PrintNote } from './printPlan.ts';

const page = { width: 600, height: 800 };
const note = (id: string, p: number, anchorTop: number, height: number): PrintNote => ({ id, page: p, anchorTop, height });

describe('printPlan', () => {
  it('plain print draws the page whole with no notes', () => {
    const [p] = printPlan([page], null);
    expect(p).toEqual({ sheet: page, pageScale: 1, pageBox: { x: 0, y: 0, width: 600, height: 800 }, notesBox: null, cards: [] });
  });

  it('a notes print shrinks the page and opens a column to the right', () => {
    const [p] = printPlan([page], [note('a', 0, 100, 40)]);
    expect(p.sheet).toEqual(page);
    expect(p.pageScale).toBe(0.72);
    expect(p.pageBox).toEqual({ x: 0, y: 0, width: 432, height: 576 });
    expect(p.notesBox).toEqual({ x: 444, y: 0, width: 156, height: 800 });
    expect(p.cards).toEqual([{ id: 'a', top: 72 }]);
  });

  it('stacks a crowded pair below each other, not at their anchors', () => {
    const [p] = printPlan([page], [note('a', 0, 100, 40), note('b', 0, 110, 40)]);
    expect(p.cards.map((c) => c.top)).toEqual([72, 118]);
    expect(p.overflow).toBeUndefined();
  });

  it('pushes the stack up from the bottom to end at the sheet height', () => {
    const [p] = printPlan([page], [note('a', 0, 1000, 40), note('b', 0, 1000, 40)]);
    expect(p.cards).toEqual([{ id: 'a', top: 800 - 86 }, { id: 'b', top: 800 - 40 }]);
    expect(p.overflow).toBeUndefined();
  });

  it('flags overflow when the cards cannot fit, listing them all', () => {
    const [p] = printPlan([page], [note('a', 0, 0, 500), note('b', 0, 0, 400)]);
    expect(p.cards.map((c) => c.id)).toEqual(['a', 'b']);
    expect(p.overflow).toBe(true);
  });

  it('a page without notes in a notes print has the same layout and no cards', () => {
    const [one, two] = printPlan([page, page], [note('a', 0, 100, 40)]);
    expect(two).toEqual({ ...one, cards: [] });
  });

  it('pushes up only the cards that need it', () => {
    const letter = { width: 612, height: 792 };
    const at = (id: string, want: number) => note(id, 0, want / 0.72, 40);
    const [p] = printPlan([letter], [at('a', 10), at('b', 740), at('c', 760)]);
    expect(p.cards.map((c) => c.top)).toEqual([10, 706, 752]);
    expect(p.overflow).toBeUndefined();
  });
});
