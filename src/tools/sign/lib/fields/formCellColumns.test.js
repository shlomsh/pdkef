import { describe, expect, it } from 'vitest';
import {
  applyFloorTicks,
  closedColumn,
  columnsBetween,
  findBands,
  risesFromFloor,
  spansBand,
  vetoRules,
} from './formCells.js';

/** A horizontal rule at height `y`. */
const rule = (y, x0 = 0, x1 = 100) => ({ y, x0, x1 });
/** A vertical edge at `x`. */
const edge = (x, y0 = 60, y1 = 80) => ({ x, y0, y1 });

/** A 20pt band from y 60 to 80 with a full rule on each side, overridable per test. */
function band(overrides = {}) {
  const top = [rule(80)];
  const bottom = [rule(60)];
  return {
    top: 80, bottom: 60, height: 20,
    topRules: top, bottomRules: bottom, topNear: top, bottomNear: bottom,
    inside: [], outside: [], edges: [],
    ...overrides,
  };
}

describe('vetoRules', () => {
  it('has none when no height lies between the band edges', () => {
    const ys = [80, 60];
    const rulesAt = [[rule(80)], [rule(60)]];
    expect(vetoRules(ys, rulesAt, 0, 1)).toEqual({ inside: [], outside: [] });
  });

  it('collects the rules at heights between, and not the band own edges', () => {
    const middle = rule(70, 20, 40);
    const ys = [80, 70, 60];
    const rulesAt = [[rule(80)], [middle], [rule(60)]];
    expect(vetoRules(ys, rulesAt, 0, 2)).toEqual({ inside: [middle], outside: [] });
  });

  it('collects a rule just outside the band but not one beyond BAND_TOLERANCE', () => {
    const near = rule(81.4, 20, 40);
    const far = rule(90, 20, 40);
    const ys = [90, 81.4, 80, 70, 60];
    const rulesAt = [[far], [near], [rule(80)], [rule(70)], [rule(60)]];
    expect(vetoRules(ys, rulesAt, 2, 4).outside).toEqual([near]);
  });
});

describe('findBands', () => {
  const rulesAtOf = (ys) => ys.map((y) => [rule(y)]);

  it('pairs heights in top-down order and keeps the vertical edges that reach each band', () => {
    const ys = [80, 60];
    const reaching = edge(10);
    const elsewhere = edge(10, 0, 20);
    const bands = findBands(ys, rulesAtOf(ys), rulesAtOf(ys), [reaching, elsewhere]);
    expect(bands).toHaveLength(1);
    expect(bands[0]).toMatchObject({ top: 80, bottom: 60, height: 20, edges: [reaching] });
  });

  it('skips a band shorter than a row and stops at one taller than a row', () => {
    const ys = [100, 98, 60, 10];
    const bands = findBands(ys, rulesAtOf(ys), rulesAtOf(ys), []);
    expect(bands.map((b) => [b.top, b.bottom])).toEqual([[100, 60], [98, 60]]);
  });
});

describe('spansBand and risesFromFloor', () => {
  const b = band();

  it('spansBand holds for an edge covering the whole band, within tolerance', () => {
    expect(spansBand(edge(10, 60, 80), b)).toBe(true);
    expect(spansBand(edge(10, 60.5, 79.5), b)).toBe(true);
    expect(spansBand(edge(10, 60, 70), b)).toBe(false);
  });

  it('risesFromFloor needs the edge to stand on the floor and rise a third of the band', () => {
    expect(risesFromFloor(edge(10, 60, 67), b)).toBe(true);
    expect(risesFromFloor(edge(10, 60, 65), b)).toBe(false);
    expect(risesFromFloor(edge(10, 65, 80), b)).toBe(false);
  });
});

describe('closedColumn', () => {
  const walled = (...xs) => band({ edges: xs.map((x) => edge(x)) });

  it('builds a cell from two full walls and two full rules', () => {
    const b = walled(10, 50);
    const cell = closedColumn(10, 50, b, [10, 50], b.topRules);
    expect(cell).toMatchObject({
      left: 10, right: 50, top: 80, bottom: 60, width: 40, height: 20, closure: 1,
      narrow: false, lone: true, square: false, floorTicked: false, nextRuleY: null,
    });
  });

  it('refuses a column narrower than a tick cell', () => {
    const b = walled(10, 14);
    expect(closedColumn(10, 14, b, [10, 14], [])).toBeNull();
  });

  it('flags a column narrower than a cell as narrow', () => {
    const b = walled(10, 20);
    expect(closedColumn(10, 20, b, [10, 20], [])?.narrow).toBe(true);
  });

  it('refuses a column the top or bottom rule does not cross', () => {
    const b = walled(10, 50);
    expect(closedColumn(10, 50, { ...b, topRules: [rule(80, 60, 100)] }, [10, 50], [])).toBeNull();
    expect(closedColumn(10, 50, { ...b, bottomRules: [] }, [10, 50], [])).toBeNull();
  });

  it('refuses a column vetoed by a rule between or a rule crossing just outside', () => {
    const b = walled(10, 50);
    expect(closedColumn(10, 50, { ...b, inside: [rule(70, 50, 70)] }, [10, 50], [])).toBeNull();
    expect(closedColumn(10, 50, { ...b, inside: [rule(70, 51, 70)] }, [10, 50], [])).not.toBeNull();
    expect(closedColumn(10, 50, { ...b, outside: [rule(81, 40, 70)] }, [10, 50], [])).toBeNull();
    expect(closedColumn(10, 50, { ...b, outside: [rule(81, 50, 70)] }, [10, 50], [])).not.toBeNull();
  });

  it('refuses a column whose top rule covers too little of it', () => {
    const b = walled(10, 50);
    expect(closedColumn(10, 50, { ...b, topNear: [rule(80, 0, 30)] }, [10, 50], [])).toBeNull();
  });

  it('refuses a short wall, but keeps one that is a floor tick, with its real closure and the next rule below', () => {
    const shortWall = band({ edges: [edge(10), edge(50, 60, 65)] });
    expect(closedColumn(10, 50, shortWall, [10, 50], [])).toBeNull();

    const ticked = band({ edges: [edge(10), edge(50, 60, 70)] });
    const below = rule(40, 0, 100);
    const cell = closedColumn(10, 50, ticked, [10, 50], [rule(80), rule(60), below, rule(40, 70, 90)]);
    expect(cell?.floorTicked).toBe(true);
    expect(cell?.closure).toBeCloseTo(0.5, 5);
    expect(cell?.nextRuleY).toBe(40);
  });
});

describe('columnsBetween', () => {
  it('returns the closed columns between neighbouring walls, left to right, skipping gaps that fail', () => {
    const b = band({ edges: [edge(10), edge(40), edge(43), edge(80)] });
    const columns = columnsBetween([10, 40, 43, 80], b, [10, 40, 43, 80], b.topRules);
    expect(columns.map((c) => [c.left, c.right])).toEqual([[10, 40], [43, 80]]);
  });

  it('is empty with fewer than two walls', () => {
    expect(columnsBetween([10], band(), [10], [])).toEqual([]);
  });
});

describe('applyFloorTicks', () => {
  const ticked = band({ edges: [edge(10), edge(50, 60, 70), edge(90)] });
  const xs = [10, 50, 90];

  it('returns the columns unchanged when none is floor-ticked', () => {
    const plain = band({ edges: [edge(10), edge(90)] });
    const cells = columnsBetween([10, 90], plain, [10, 90], []);
    expect(applyFloorTicks(cells, plain, [10, 90], [])).toBe(cells);
  });

  it('gives each floor-ticked column its group span and adds the wall column that holds them', () => {
    const cells = columnsBetween(xs, ticked, xs, ticked.topRules);
    const all = applyFloorTicks(cells, ticked, xs, ticked.topRules);
    expect(all).toHaveLength(3);
    expect(all.slice(0, 2).map((c) => [c.left, c.right, c.rowLeft, c.rowRight])).toEqual([[10, 50, 10, 90], [50, 90, 10, 90]]);
    expect(all[2]).toMatchObject({ left: 10, right: 90, tickDivided: true, lone: true });
  });
});
