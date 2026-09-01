import { describe, expect, it } from 'vitest';
import { combCellCenterFraction, combCellCount, combCharacters, combLayout, isComb } from './comb.js';

describe('comb layout', () => {
  it('is derived from having an explicit width, not a separate flag', () => {
    // Dragging a side handle is the only thing that ever sets `width` on a
    // text element, and clearing it is the only thing that ever unsets it
    // (see useElementResize.js/ElementToolbar.tsx), so the two can't drift.
    expect(isComb({ type: 'text', text: '123' })).toBe(false);
    expect(isComb({ type: 'text', text: '123', width: 10 })).toBe(true);
    expect(isComb({ type: 'text', text: '123', width: 0 })).toBe(false);
    expect(isComb({ type: 'rectangle', width: 10 })).toBe(false);
  });

  it('follows the text when no cell count is set', () => {
    expect(combCellCount({ type: 'text', width: 10, text: '327698221' })).toBe(9);
    expect(combCellCount({ type: 'text', width: 10, text: '01072026' })).toBe(8);
  });

  it('honours an explicit cell count, which is what a field with blank boxes needs', () => {
    expect(combCellCount({ type: 'text', width: 10, text: '27', combCells: 8 })).toBe(8);
  });

  it('never reports fewer than one cell, so an empty comb still has a box', () => {
    expect(combCellCount({ type: 'text', width: 10, text: '' })).toBe(1);
  });

  it('collapses newlines, because a comb is a single row of boxes', () => {
    expect(combCharacters({ text: '27\n05' })).toEqual(['2', '7', '0', '5']);
  });

  it('splits on grapheme clusters, not code points, so a nikud mark stays in its base letter\'s cell', () => {
    // "שָׁלוֹם" (shalom, pointed) is 7 code points but 4 letters - a kamatz
    // and shin dot both combine onto the shin, and a holam combines onto the
    // vav. Splitting on code points would strand the marks in cells of their
    // own; docs/hebrew-text-shaping-export.md.
    expect(combCharacters({ text: 'שָׁלוֹם' })).toEqual(['שָׁ', 'ל', 'וֹ', 'ם']);
    expect(combCellCount({ type: 'text', width: 10, text: 'שָׁלוֹם' })).toBe(4);
  });

  it('keeps a leading orphan mark as its own cluster instead of dropping it (small defect #3)', () => {
    // A kamatz with no preceding base character - e.g. a comb field that
    // starts mid-word on a pointed nikud. `\P{M}\p{M}*` alone requires a base
    // before any mark, so it matches nothing at position 0 and the regex
    // engine skips straight to "ש", silently losing the kamatz - character
    // loss, not just misplacement. See docs/hebrew-text-shaping-export.md.
    expect(combCharacters({ text: 'ָשלום' })).toEqual(['ָ', 'ש', 'ל', 'ו', 'ם']);
  });

  it('targets cell centres rather than the outer edges', () => {
    // The distinction that makes a comb work: with 8 cells the first glyph sits
    // at 1/16 of the width, not at 0, so it lands inside its box rather than on
    // the field's left rule.
    expect(combCellCenterFraction(0, 8)).toBeCloseTo(0.0625);
    expect(combCellCenterFraction(7, 8)).toBeCloseTo(0.9375);
  });

  it('spaces the cells evenly and leaves unreached cells empty', () => {
    const layout = combLayout({ type: 'text', width: 10, text: '27', combCells: 4 });
    expect(layout.map((cell) => cell.char)).toEqual(['2', '7', '', '']);
    expect(layout.map((cell) => cell.centerFraction)).toEqual([0.125, 0.375, 0.625, 0.875]);
  });

  it('drops characters past the last cell rather than crowding the field', () => {
    expect(combLayout({ type: 'text', width: 10, text: '12345', combCells: 3 }).map((c) => c.char))
      .toEqual(['1', '2', '3']);
  });

  describe('RTL: reading order mirrors, not just the box position', () => {
    it('mirrors the fraction, so the same cell index sits opposite where it does in LTR', () => {
      // Not a coincidence that these equal the LTR pair reversed: mirroring
      // around the centre is exactly what "same layout, opposite direction"
      // means.
      expect(combCellCenterFraction(0, 8, true)).toBeCloseTo(0.9375);
      expect(combCellCenterFraction(7, 8, true)).toBeCloseTo(0.0625);
    });

    it('places character 0 at the highest (rightmost) fraction, so it renders nearest the fixed right edge', () => {
      // Plain RTL text in this editor anchors its fixed edge on the right and
      // grows leftward, so the first character typed always stays at that
      // fixed edge (see usesRtlAnchoring). A comb's span is fixed rather than
      // growing, but the reading order still has to agree: the array order
      // (and so which character is "0") is unchanged - what mirrors is only
      // *where on the page* each index is drawn.
      const layout = combLayout({ type: 'text', width: 10, text: '27', combCells: 4 }, true);
      expect(layout.map((cell) => cell.char)).toEqual(['2', '7', '', '']);
      expect(layout.map((cell) => cell.centerFraction)).toEqual([0.875, 0.625, 0.375, 0.125]);
    });

    it('defaults to LTR when direction is omitted, so every existing call site is unaffected', () => {
      expect(combCellCenterFraction(0, 8)).toBeCloseTo(combCellCenterFraction(0, 8, false));
      expect(combLayout({ type: 'text', width: 10, text: '27' }))
        .toEqual(combLayout({ type: 'text', width: 10, text: '27' }, false));
    });
  });
});
