import { describe, expect, it } from 'vitest';
import { printPlan, type PrintNote } from './printPlan.ts';

const page = { width: 600, height: 800 };
const note = (id: string, p: number, anchorTop: number, height: number): PrintNote => ({ id, page: p, anchorTop, height });

describe('printPlan', () => {
  it('plain print draws the page whole with no notes', () => {
    const [p] = printPlan([page], null);
    expect(p).toEqual({ sheet: page, pageScale: 1, pageBox: { x: 0, y: 0, width: 600, height: 800 }, notesBox: null, cards: [] });
  });

  it('a notes print without ink bounds treats the whole width as ink and scales to fit the column', () => {
    const [p] = printPlan([page], [note('a', 0, 100, 40)]);
    const s = (600 - 48 - 12 - 132) / 600;
    expect(p.sheet).toEqual(page);
    expect(p.pageScale).toBeCloseTo(s);
    expect(p.pageBox.x).toBeCloseTo(24);
    expect(p.pageBox.width).toBeCloseTo(600 * s);
    expect(p.notesBox).toEqual({ x: 24 + 600 * s + 12, y: 0, width: 132, height: 800 });
    expect(p.cards[0].top).toBeCloseTo(100 * s);
  });

  it('puts the notes column right of the ink, 12 pt away, and inside the sheet', () => {
    const a4 = { width: 595, height: 842, inkLeft: 72, inkRight: 523 };
    const [p] = printPlan([a4], [note('a', 0, 100, 40)]);
    const s = Math.min(1, (595 - 48 - 12 - 0.22 * 595) / 451);
    expect(p.pageScale).toBeCloseTo(s);
    expect(p.pageBox.x).toBeCloseTo(24 - 72 * s);
    expect(p.pageBox.width).toBeCloseTo(595 * s);
    expect(p.notesBox!.x).toBeCloseTo(24 + 451 * s + 12);
    expect(p.notesBox!.x - (p.pageBox.x + 523 * s)).toBeCloseTo(12);
    expect(p.notesBox!.x + p.notesBox!.width).toBeLessThanOrEqual(595 - 24 + 1e-6);
  });

  it('full-width ink scales down so the column still fits', () => {
    const [p] = printPlan([{ width: 595, height: 842, inkLeft: 0, inkRight: 595 }], [note('a', 0, 0, 10)]);
    expect(p.pageScale).toBeLessThan(1);
    expect(p.notesBox!.x + p.notesBox!.width).toBeCloseTo(595 - 24);
  });

  it('stacks a crowded pair below each other, not at their anchors', () => {
    const [p] = printPlan([page], [note('a', 0, 100, 40), note('b', 0, 110, 40)]);
    const s = p.pageScale;
    expect(p.cards[0].top).toBeCloseTo(100 * s);
    expect(p.cards[1].top).toBeCloseTo(100 * s + 46);
    expect(p.overflow).toBeUndefined();
  });

  it('pushes the stack up from the bottom to end at the sheet height', () => {
    const [p] = printPlan([page], [note('a', 0, 2000, 40), note('b', 0, 2000, 40)]);
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
    const s = (612 - 48 - 12 - 0.22 * 612) / 612;
    const at = (id: string, want: number) => note(id, 0, want / s, 40);
    const [p] = printPlan([letter], [at('a', 10), at('b', 740), at('c', 760)]);
    expect(p.cards.map((c) => Math.round(c.top))).toEqual([10, 706, 752]);
    expect(p.overflow).toBeUndefined();
  });
});
