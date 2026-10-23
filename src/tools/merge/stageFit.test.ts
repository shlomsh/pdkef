import { describe, expect, it } from 'vitest';
import { fitCellWidth, rasterWidthFor, type StageFitInput } from './stageFit.ts';

const base: StageFitInput = {
  units: 7, width: 836, height: 656, gap: 12, labelHeight: 22, ratio: 104 / 138, min: 104, max: 240,
};

describe('fitCellWidth', () => {
  it.each([
    [7, 200],
    [14, 129],
    [20, 109],
    [30, 104],
    [2, 240],
  ])('%i units fit a %ipx cell', (units, expected) => {
    expect(fitCellWidth({ ...base, units })).toBe(expected);
  });

  it('falls back to the minimum with no measured space', () => {
    expect(fitCellWidth({ ...base, width: 0 })).toBe(104);
    expect(fitCellWidth({ ...base, height: 0 })).toBe(104);
  });
});

describe('rasterWidthFor', () => {
  it.each([
    [104, 2, 240],
    [104, 1, 150],
    [200, 2, 400],
    [240, 2, 480],
    [200, 1, 240],
  ])('a %ipx cell at %ix is rasterised at %ipx', (cell, dpr, expected) => {
    expect(rasterWidthFor(cell, dpr)).toBe(expected);
  });
});
