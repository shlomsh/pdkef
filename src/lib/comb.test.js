import { describe, expect, it } from 'vitest';
import { combCellCenterFraction, combCellCount, combCharacters, combLayout, isComb } from './comb.js';

describe('comb layout', () => {
  it('is off unless a text element opts in', () => {
    expect(isComb({ type: 'text', text: '123' })).toBe(false);
    expect(isComb({ type: 'text', text: '123', comb: true })).toBe(true);
    expect(isComb({ type: 'rectangle', comb: true })).toBe(false);
  });

  it('follows the text when no cell count is set', () => {
    expect(combCellCount({ type: 'text', comb: true, text: '327698221' })).toBe(9);
    expect(combCellCount({ type: 'text', comb: true, text: '01072026' })).toBe(8);
  });

  it('honours an explicit cell count, which is what a field with blank boxes needs', () => {
    expect(combCellCount({ type: 'text', comb: true, text: '27', combCells: 8 })).toBe(8);
  });

  it('never reports fewer than one cell, so an empty comb still has a box', () => {
    expect(combCellCount({ type: 'text', comb: true, text: '' })).toBe(1);
  });

  it('collapses newlines, because a comb is a single row of boxes', () => {
    expect(combCharacters({ text: '27\n05' })).toEqual(['2', '7', '0', '5']);
  });

  it('targets cell centres rather than the outer edges', () => {
    // The distinction that makes a comb work: with 8 cells the first glyph sits
    // at 1/16 of the width, not at 0, so it lands inside its box rather than on
    // the field's left rule.
    expect(combCellCenterFraction(0, 8)).toBeCloseTo(0.0625);
    expect(combCellCenterFraction(7, 8)).toBeCloseTo(0.9375);
  });

  it('spaces the cells evenly and leaves unreached cells empty', () => {
    const layout = combLayout({ type: 'text', comb: true, text: '27', combCells: 4 });
    expect(layout.map((cell) => cell.char)).toEqual(['2', '7', '', '']);
    expect(layout.map((cell) => cell.centerFraction)).toEqual([0.125, 0.375, 0.625, 0.875]);
  });

  it('drops characters past the last cell rather than crowding the field', () => {
    expect(combLayout({ type: 'text', comb: true, text: '12345', combCells: 3 }).map((c) => c.char))
      .toEqual(['1', '2', '3']);
  });
});
