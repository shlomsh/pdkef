import { describe, expect, it } from 'vitest';
import { verticalEdges, horizontalRules, ruledCoverage, THIN_INK, DEFAULT_COVERAGE_TOLERANCE } from './inkEdges.js';

const noRects = { verticals: [], horizontals: [], rects: [] };

describe('verticalEdges', () => {
  it('passes segments straight through and folds a thin rect into one mid edge', () => {
    const ink = {
      verticals: [{ x: 5, y0: 0, y1: 10 }],
      horizontals: [],
      rects: [{ x: 20, y: 0, width: 1, height: 10 }], // thinner than THIN_INK on x
    };
    expect(verticalEdges(ink)).toEqual([
      { x: 5, y0: 0, y1: 10 },
      { x: 20.5, y0: 0, y1: 10 },
    ]);
  });

  it('folds a rect with real area into two side walls', () => {
    const ink = { ...noRects, rects: [{ x: 0, y: 0, width: 30, height: 10 }] };
    expect(verticalEdges(ink)).toEqual([
      { x: 0, y0: 0, y1: 10 },
      { x: 30, y0: 0, y1: 10 },
    ]);
  });

  it('excludeRect: a rect the predicate rejects contributes no edges, but the default keeps it', () => {
    const rect = { x: 0, y: 0, width: 30, height: 10 };
    const ink = { ...noRects, rects: [rect] };
    // Mutation check: without the option every rect is still a candidate.
    expect(verticalEdges(ink)).toHaveLength(2);
    expect(verticalEdges(ink, { excludeRect: () => true })).toEqual([]);
    expect(verticalEdges(ink, { excludeRect: (r) => r !== rect })).toHaveLength(2);
  });

  it('thinInk: raising the threshold turns a rect that used to have real area into a thin one', () => {
    const ink = { ...noRects, rects: [{ x: 0, y: 0, width: 3, height: 10 }] };
    // At the default threshold this rect has real area: two side walls.
    expect(verticalEdges(ink)).toHaveLength(2);
    // Past a wider threshold the same rect reads as a thin rule: one mid edge.
    expect(verticalEdges(ink, { thinInk: 5 })).toEqual([{ x: 1.5, y0: 0, y1: 10 }]);
  });
});

describe('horizontalRules', () => {
  it('passes segments straight through and folds a thin rect into one mid rule', () => {
    const ink = {
      verticals: [],
      horizontals: [{ y: 5, x0: 0, x1: 10 }],
      rects: [{ x: 0, y: 20, width: 10, height: 1 }], // thinner than THIN_INK on y
    };
    expect(horizontalRules(ink)).toEqual([
      { y: 5, x0: 0, x1: 10 },
      { y: 20.5, x0: 0, x1: 10 },
    ]);
  });

  it('does not fold a full rect into top/bottom rules by default (formGrid.js behaviour)', () => {
    const ink = { ...noRects, rects: [{ x: 0, y: 0, width: 10, height: 30 }] };
    expect(horizontalRules(ink)).toEqual([]);
  });

  it('includeRectSides: a full rect folds into a rule at its own top and bottom', () => {
    const ink = { ...noRects, rects: [{ x: 0, y: 0, width: 10, height: 30 }] };
    expect(horizontalRules(ink)).toEqual([]); // mutation check: option genuinely gates this
    expect(horizontalRules(ink, { includeRectSides: true })).toEqual([
      { y: 0, x0: 0, x1: 10 },
      { y: 30, x0: 0, x1: 10 },
    ]);
  });

  it('excludeRect: a background-panel-shaped rect contributes nothing when rejected', () => {
    const panel = { x: 0, y: 0, width: 500, height: 700 };
    const ink = { ...noRects, rects: [panel] };
    expect(horizontalRules(ink, { includeRectSides: true })).toHaveLength(2);
    expect(horizontalRules(ink, { includeRectSides: true, excludeRect: () => true })).toEqual([]);
  });

  it('thinInk: raising the threshold turns a real-area rect into a thin rule', () => {
    const ink = { ...noRects, rects: [{ x: 0, y: 0, width: 10, height: 3 }] };
    expect(horizontalRules(ink, { includeRectSides: true })).toEqual([
      { y: 0, x0: 0, x1: 10 },
      { y: 3, x0: 0, x1: 10 },
    ]);
    expect(horizontalRules(ink, { includeRectSides: true, thinInk: 5 }))
      .toEqual([{ y: 1.5, x0: 0, x1: 10 }]);
  });
});

describe('ruledCoverage', () => {
  it('reports the covered share of [left, right] at a given y', () => {
    const rules = [{ y: 10, x0: 0, x1: 50 }];
    expect(ruledCoverage(rules, 10, 0, 100)).toBeCloseTo(0.5, 10);
  });

  it('merges overlapping rule segments rather than double counting them', () => {
    const rules = [{ y: 10, x0: 0, x1: 60 }, { y: 10, x0: 40, x1: 100 }];
    expect(ruledCoverage(rules, 10, 0, 100)).toBeCloseTo(1, 10);
  });

  it('returns 0 for a degenerate span', () => {
    expect(ruledCoverage([{ y: 10, x0: 0, x1: 50 }], 10, 50, 50)).toBe(0);
  });

  it('tolerance: a rule just past the default window is excluded, and included with a wider one', () => {
    const rules = [{ y: 10 + DEFAULT_COVERAGE_TOLERANCE + 0.1, x0: 0, x1: 100 }];
    expect(ruledCoverage(rules, 10, 0, 100)).toBe(0);
    expect(ruledCoverage(rules, 10, 0, 100, DEFAULT_COVERAGE_TOLERANCE + 0.2)).toBeCloseTo(1, 10);
  });
});

describe('THIN_INK / DEFAULT_COVERAGE_TOLERANCE', () => {
  it('are the one value both formGrid.js and formCells.js used to declare separately', () => {
    expect(THIN_INK).toBe(1.5);
    expect(DEFAULT_COVERAGE_TOLERANCE).toBe(1.5);
  });
});
