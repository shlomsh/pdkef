import { describe, expect, it } from 'vitest';
import { inkFromRaster } from '#lib/pageLayout/rasterInk.ts';
import { FORM, PAGE, near, render, up } from '#lib/pageLayout/rasterInk.test-helper.js';
import { findCombRuns, findCheckboxes } from './formGrid.js';

// READ-02: the cases where Sign's form detectors read what inkFromRaster found, moved whole out of
// src/lib/pageLayout/rasterInk.test.js (a lib test may not import a tool).
describe('inkFromRaster on a clean synthetic form', () => {
  const ink = inkFromRaster(render(FORM), PAGE);

  it('finds the comb teeth as verticals and the existing comb detector reads them', () => {
    const teeth = near(ink.verticals, 0, () => 0, Infinity).filter((v) => v.y1 - v.y0 > 9 && v.y1 - v.y0 < 15);
    expect(teeth).toHaveLength(7);
    const [run] = findCombRuns(ink);
    expect(run.cells).toBe(6);
    expect(run.pitch).toBeCloseTo(12, 0);
    expect(run.left).toBeCloseTo(30, 0);
  });

  it('recovers the checkbox as a square rect that findCheckboxes accepts, and does not turn it into rules', () => {
    expect(ink.rects).toHaveLength(1);
    const [rect] = ink.rects;
    expect(rect.width).toBeCloseTo(9, 0);
    expect(rect.height).toBeCloseTo(9, 0);
    expect(rect.x).toBeCloseTo(29.5, 0);
    expect(rect.y).toBeCloseTo(up(68.5), 0);
    expect(findCheckboxes(ink)).toHaveLength(1);
    expect(near(ink.horizontals, up(60), (rule) => rule.y, 2)).toHaveLength(0);
  });
});

describe('inkFromRaster on a slightly rotated scan', () => {
  const degrees = 1;
  const ink = inkFromRaster(render(FORM, { degrees }), PAGE);

  it('keeps the comb and the checkbox', () => {
    expect(findCombRuns(ink)[0]?.cells).toBe(6);
    expect(findCheckboxes(ink)).toHaveLength(1);
  });
});
