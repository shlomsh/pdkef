import { describe, expect, it } from 'vitest';
import { tokenize } from './contentStream.js';
import { collectInkFromTokens } from './pageInk.js';
import { createPageGeometry } from '../../geometry/coords.ts';
import { detectRegions, findCheckboxes, findCombRuns } from './formGrid.js';

const inkOf = (stream) => collectInkFromTokens(tokenize(new TextEncoder().encode(stream)));
const runsOf = (stream) => findCombRuns(inkOf(stream));

/** A row of tick marks hanging from `baseline`, drawn the way form 101 draws them. */
function teeth({ from, pitch, count, baseline = 500, height = 4, matrix = null }) {
  const marks = [];
  for (let index = 0; index < count; index += 1) {
    const x = from + index * pitch;
    marks.push(`${x} ${baseline} m ${x} ${baseline + height} l S`);
  }
  const body = marks.join(' ');
  return matrix ? `q ${matrix} cm ${body} Q` : body;
}

/** A wall: a vertical tall enough to read as a table rule rather than a tooth. */
const wall = (x, baseline = 500) => `${x} ${baseline - 10} m ${x} ${baseline + 20} l S`;

describe('findCombRuns', () => {
  it('finds a run of equal cells on one baseline', () => {
    const [run] = runsOf(teeth({ from: 100, pitch: 11.3, count: 7 }));
    expect(run).toMatchObject({ cells: 6, left: 100 });
    expect(run.pitch).toBeCloseTo(11.3, 5);
  });

  it('ignores a row with too few cells to be a comb', () => {
    expect(runsOf(teeth({ from: 100, pitch: 11.3, count: 4 }))).toEqual([]);
  });

  it('ignores marks whose pitch is too narrow to write a character into', () => {
    // The state emblem on form 101 draws rows of strokes 0.7pt apart.
    expect(runsOf(teeth({ from: 100, pitch: 0.72, count: 9 }))).toEqual([]);
  });

  it('ignores marks that do not share a baseline', () => {
    const staggered = [0, 1, 2, 3, 4, 5, 6]
      .map((index) => `${100 + index * 11.3} ${500 + index * 4} m ${100 + index * 11.3} ${504 + index * 4} l S`)
      .join(' ');
    expect(runsOf(staggered)).toEqual([]);
  });

  describe('cell walls', () => {
    it('extends onto a wall the page draws, so a nine-digit field is nine cells', () => {
      // Form 101's identity comb: eight teeth, and both outer walls belong to
      // the enclosing table rather than to the comb.
      const stream = [
        teeth({ from: 449.4, pitch: 11.34, count: 8 }),
        wall(438.06),
        wall(540.12),
      ].join(' ');
      const [run] = runsOf(stream);
      expect(run.cells).toBe(9);
      expect(run.left).toBeCloseTo(438.06, 5);
      expect(run.right).toBeCloseTo(540.12, 5);
    });

    it('takes a wall from the edge of a painted rectangle', () => {
      // The identity comb's right-hand wall is the side of a filled section box,
      // not a stroked segment. Reading only segments loses a cell.
      const stream = [
        teeth({ from: 449.4, pitch: 11.34, count: 8 }),
        wall(438.06),
        '28.69 450 511.43 120 re f',
      ].join(' ');
      expect(runsOf(stream)[0].cells).toBe(9);
    });

    it('does not extend onto empty paper', () => {
      const [run] = runsOf(teeth({ from: 100, pitch: 11.3, count: 7 }));
      expect(run.cells).toBe(6);
    });

    it('does not extend onto ink that misses the row', () => {
      // A vertical at the right x but nowhere near this baseline is a different
      // field's wall, not this one's.
      const stream = [
        teeth({ from: 100, pitch: 11.3, count: 7 }),
        `${88.7} 200 m ${88.7} 240 l S`,
      ].join(' ');
      expect(runsOf(stream)[0].cells).toBe(6);
    });
  });

  describe('where a run stops', () => {
    it('splits two fields ruled at the same pitch with a wall between them', () => {
      // Form 101's two date fields. Merging them offers one sixteen-cell target
      // covering two different dates.
      const stream = [
        teeth({ from: 39.71, pitch: 11.34, count: 7 }),
        teeth({ from: 130.69, pitch: 11.34, count: 7 }),
        wall(28.37), wall(119.03), wall(210.03),
      ].join(' ');
      const runs = findCombRuns(inkOf(stream)).sort((a, b) => a.left - b.left);
      expect(runs.map((run) => run.cells)).toEqual([8, 8]);
      expect(runs[0].right).toBeCloseTo(runs[1].left, 5);
    });

    it('splits at a label slot rather than inventing a cell under it', () => {
      // The health declaration's phone strip: a label sits in a slot twice the
      // cell pitch. Bridging it merges a fax number with a postal code.
      const stream = [
        teeth({ from: 38, pitch: 13.87, count: 10 }),
        teeth({ from: 190.93, pitch: 13.87, count: 4 }),
      ].join(' ');
      const runs = findCombRuns(inkOf(stream));
      expect(runs.map((run) => run.cells)).toEqual([9]);
      expect(runs[0].right).toBeCloseTo(162.83, 2);
    });

    it('splits where the pitch changes', () => {
      const stream = [
        teeth({ from: 40, pitch: 11.3, count: 7 }),
        teeth({ from: 200, pitch: 16.2, count: 7 }),
      ].join(' ');
      expect(findCombRuns(inkOf(stream)).map((run) => run.cells).sort()).toEqual([6, 6]);
    });
  });

  describe('closed cells versus teeth on a line', () => {
    // Which one decides whether text sits *on* a line or *in* a box, and the
    // page answers it: form 101 rules nothing along its runs' tops, the health
    // declaration rules 96% of them.
    const row = teeth({ from: 100, pitch: 12, count: 7, baseline: 500, height: 11 });
    const rule = (y, from = 100, to = 172) => `${from} ${y} m ${to} ${y} l S`;

    it('reports a run ruled top and bottom as boxed', () => {
      expect(runsOf([row, rule(500), rule(511)].join(' '))[0].boxed).toBe(true);
    });

    it('reports a run ruled only along its bottom as open', () => {
      expect(runsOf([row, rule(500)].join(' '))[0].boxed).toBe(false);
    });

    it('reports a run with no rule at all as open', () => {
      expect(runsOf(row)[0].boxed).toBe(false);
    });

    it('accepts a top ruled cell by cell rather than in one piece', () => {
      // A table drawn per cell closes its top with abutting segments, which is
      // how the health declaration draws every one of its combs.
      const perCell = [0, 1, 2, 3, 4, 5]
        .map((index) => rule(511, 100 + index * 12, 112 + index * 12))
        .join(' ');
      expect(runsOf([row, rule(500), perCell].join(' '))[0].boxed).toBe(true);
    });

    it('ignores a top rule that covers only part of the run', () => {
      expect(runsOf([row, rule(500), rule(511, 100, 120)].join(' '))[0].boxed).toBe(false);
    });
  });

  describe('the current transformation matrix', () => {
    // The regression MOBI-03 asks for by name: form 101 issues 370 `cm`
    // operators on page 1, so a walk that reads raw operands finds no shared
    // baseline anywhere and recovers none of its seventeen comb runs.
    it('finds a run whose operands share no baseline until the CTM is applied', () => {
      const perToothMatrix = [0, 1, 2, 3, 4, 5, 6]
        .map((index) => `q 1 0 0 1 ${index * 11.3} 400 cm 0 0 m 0 4 l S Q`)
        .join(' ');
      const [run] = runsOf(perToothMatrix);
      expect(run).toMatchObject({ cells: 6 });
      expect(run.left).toBeCloseTo(0, 5);
      expect(run.pitch).toBeCloseTo(11.3, 5);
    });

    it('reads the same run identically however the page nests it', () => {
      const plain = runsOf(teeth({ from: 120, pitch: 11.3, count: 7, baseline: 300 }));
      const transformed = runsOf(teeth({
        from: 20, pitch: 11.3, count: 7, baseline: 100, matrix: '1 0 0 1 100 200',
      }));
      expect(transformed).toEqual(plain);
    });
  });
});

describe('findCheckboxes', () => {
  it('finds a stroked square in the checkbox band', () => {
    const [box] = findCheckboxes(inkOf('100 200 6.6 6.6 re S'));
    expect(box.x).toBeCloseTo(100, 6);
    expect(box.y).toBeCloseTo(200, 6);
    expect(box.width).toBeCloseTo(6.6, 6);
    expect(box.height).toBeCloseTo(6.6, 6);
  });

  it('rejects a clip rectangle, which is where the phantom checkboxes came from', () => {
    // 1,027 of the health declaration's 1,635 `re` operators clip text. Counting
    // them adds 76 boxes at 13.3x10.8 that the page never draws.
    expect(findCheckboxes(inkOf('100 200 13.3 10.8 re W* n'))).toEqual([]);
  });

  it('rejects a painted rectangle that is not square enough to be a checkbox', () => {
    expect(findCheckboxes(inkOf('100 200 13.3 10.8 re f'))).toEqual([]);
  });

  it('rejects squares outside the size band', () => {
    expect(findCheckboxes(inkOf('0 0 2 2 re f 50 50 40 40 re f'))).toEqual([]);
  });

  it('counts a box drawn twice, as a stroke and a fill, once', () => {
    expect(findCheckboxes(inkOf('100 200 7.6 7.6 re f 100 200 7.6 7.6 re S'))).toHaveLength(1);
  });
});

describe('detectRegions', () => {
  // A realistic A4 page, never jsdom's 0x0 default: percentages derived from a
  // zero-sized page are all NaN or Infinity and assert nothing (CLAUDE.md II.5).
  const geometry = createPageGeometry({ cropBox: { x: 0, y: 0, width: 600, height: 800 } });

  it('reports a comb run as top-left-origin page percentages', () => {
    const { combs } = detectRegions(
      inkOf(teeth({ from: 60, pitch: 12, count: 6, baseline: 400, height: 4 })),
      geometry,
      3,
    );
    expect(combs).toHaveLength(1);
    expect(combs[0]).toMatchObject({ kind: 'comb', pageIndex: 3, cells: 5 });
    // 60pt of 600 across; the run's top edge is 404pt up a 800pt page, so 396
    // from the top, and it is 4pt tall.
    expect(combs[0].left).toBeCloseTo(10, 5);
    expect(combs[0].width).toBeCloseTo(10, 5);
    expect(combs[0].top).toBeCloseTo(49.5, 5);
    expect(combs[0].height).toBeCloseTo(0.5, 5);
  });

  it('reports a checkbox as page percentages', () => {
    const { checkboxes } = detectRegions(inkOf('120 600 6 6 re S'), geometry, 0);
    expect(checkboxes[0]).toMatchObject({ kind: 'checkbox', pageIndex: 0 });
    expect(checkboxes[0].left).toBeCloseTo(20, 5);
    expect(checkboxes[0].top).toBeCloseTo(24.25, 5);
    expect(checkboxes[0].width).toBeCloseTo(1, 5);
  });

  it('follows page rotation through the one page-coordinate transform', () => {
    const rotated = createPageGeometry({
      cropBox: { x: 0, y: 0, width: 600, height: 800 },
      rotation: 90,
    });
    const { checkboxes } = detectRegions(inkOf('120 600 6 6 re S'), rotated, 0);
    // A quarter turn swaps the axes: the box's 600pt height coordinate becomes
    // 600pt across an 800pt-wide page, and its 120pt x becomes 120pt down.
    expect(checkboxes[0].left).toBeCloseTo(75, 5);
    expect(checkboxes[0].top).toBeCloseTo(20, 5);
    expect(checkboxes[0].width).toBeCloseTo(0.75, 5);
  });
});
