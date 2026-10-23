import { describe, expect, it } from 'vitest';
import { fitCellWidth, fitSettled, rasterWidthFor, rowsFor, type FitItem, type StageFitInput } from './stageFit.ts';

const singles = (n: number): FitItem[] => Array.from({ length: n }, () => ({ span: 1, breakBefore: false }));

const base: StageFitInput = {
  items: singles(7), width: 836, height: 656, gap: 12, labelHeight: 22, ratio: 104 / 138, min: 104, max: 240,
};

describe('fitCellWidth', () => {
  it.each([
    [7, 200],
    [14, 129],
    [20, 109],
    [30, 104],
    [2, 240],
  ])('%i single-column items fit a %ipx cell', (count, expected) => {
    expect(fitCellWidth({ ...base, items: singles(count) })).toBe(expected);
  });

  it('falls back to the minimum with no measured space', () => {
    expect(fitCellWidth({ ...base, width: 0 })).toBe(104);
    expect(fitCellWidth({ ...base, height: 0 })).toBe(104);
  });
});

describe('rowsFor', () => {
  const run = (count: number): FitItem[] => singles(count).map((item, i) => ({ ...item, breakBefore: i === 0 }));

  it('packs single items in plain flow', () => {
    expect(rowsFor(singles(7), 3)).toBe(3);
    expect(rowsFor([], 3)).toBe(0);
  });

  it('starts a captioned run on a fresh row (three files of 5 pages, 3 columns)', () => {
    expect(rowsFor([...run(5), ...run(5), ...run(5)], 3)).toBe(6);
  });

  it('wraps a landscape cell that does not fit the rest of a row (3 landscape, 3 columns)', () => {
    const landscape: FitItem[] = Array.from({ length: 3 }, () => ({ span: 2, breakBefore: false }));
    expect(rowsFor(landscape, 3)).toBe(3);
  });

  it('puts a span-2 item on one row in a 1-column grid', () => {
    expect(rowsFor([{ span: 2, breakBefore: false }, ...singles(1)], 1)).toBe(2);
  });
});

describe('rasterWidthFor', () => {
  it.each([
    [104, 2, 150],
    [104, 1, 150],
    [105, 2, 240],
    [200, 2, 400],
    [240, 2, 480],
    [200, 1, 240],
  ])('a %ipx cell at %ix is rasterised at %ipx', (cell, dpr, expected) => {
    expect(rasterWidthFor(cell, dpr)).toBe(expected);
  });
});

/* MERGE-24 (2026-10-23): a restore painted at the largest size, then twice more
   as the aspects arrived. The grid stays hidden until this says the fit holds. */
describe('fitSettled', () => {
  const ready = { known: 2, total: 2, elapsed: 50, measured: true };

  it('settles once every aspect is known and the cell is measured', () => {
    expect(fitSettled(ready)).toBe(true);
  });

  it('waits while an aspect is unknown or the cell is unmeasured', () => {
    expect(fitSettled({ ...ready, known: 1 })).toBe(false);
    expect(fitSettled({ ...ready, measured: false })).toBe(false);
  });

  it('settles after the 400ms patience whatever is still unknown', () => {
    expect(fitSettled({ known: 0, total: 30, elapsed: 399, measured: true })).toBe(false);
    expect(fitSettled({ known: 0, total: 30, elapsed: 400, measured: false })).toBe(true);
  });

  it('has nothing to settle with no pages', () => {
    expect(fitSettled({ known: 0, total: 0, elapsed: 900, measured: true })).toBe(false);
  });
});
