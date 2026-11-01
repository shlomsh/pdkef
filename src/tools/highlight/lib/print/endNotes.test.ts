import { describe, expect, it } from 'vitest';
import { endNotesPages, END_NOTES_GAP, END_NOTES_MARGIN } from './endNotes.ts';

const e = (id: string) => ({ id });
const heights: Record<string, number> = { a: 100, b: 100, c: 100, tall: 5000 };
const measure = (n: { id: string }) => heights[n.id];

describe('endNotesPages', () => {
  it('has no sheet when there is no note', () => {
    expect(endNotesPages([], 800, measure)).toEqual([]);
  });

  it('keeps every note on one sheet when they fit, in the order given', () => {
    expect(endNotesPages([e('a'), e('b')], 800, measure)).toEqual([[e('a'), e('b')]]);
  });

  it('continues onto the next sheet when a note no longer fits, counting the gap and both margins', () => {
    const room = 100 + END_NOTES_GAP + 100 + 2 * END_NOTES_MARGIN;
    expect(endNotesPages([e('a'), e('b'), e('c')], room, measure)).toEqual([[e('a'), e('b')], [e('c')]]);
    expect(endNotesPages([e('a'), e('b'), e('c')], room - 1, measure)).toEqual([[e('a')], [e('b')], [e('c')]]);
  });

  it('reserves room for the heading on the first sheet only', () => {
    const room = 100 + END_NOTES_GAP + 100 + 2 * END_NOTES_MARGIN;
    expect(endNotesPages([e('a'), e('b'), e('c')], room, measure, 30)).toEqual([[e('a')], [e('b'), e('c')]]);
  });

  it('gives a note taller than a sheet a sheet of its own rather than dropping it', () => {
    expect(endNotesPages([e('a'), e('tall'), e('b')], 800, measure)).toEqual([[e('a')], [e('tall')], [e('b')]]);
  });
});
