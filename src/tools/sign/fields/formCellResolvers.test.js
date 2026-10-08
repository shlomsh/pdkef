import { describe, expect, it } from 'vitest';
import { createPageGeometry } from '../../../editor/geometry/coords.ts';
import {
  resolveFloorTicked,
  resolveGeneralCell,
  resolveLoneBox,
  resolveLoneSquare,
  resolveNarrowTick,
} from './formCells.js';

// A 100x100pt page: percent x equals PDF x, percent top equals `100 - PDF y`.
const geometry = createPageGeometry({ cropBox: { x: 0, y: 0, width: 100, height: 100 }, rotation: 0 });

/** A closed cell in PDF points (y up), with every flag off unless overridden. */
function closed(overrides = {}) {
  const base = { left: 10, right: 50, bottom: 60, top: 80, closure: 1, narrow: false, lone: false, square: false, floorTicked: false, nextRuleY: null };
  const cell = { ...base, ...overrides };
  return { ...cell, width: cell.right - cell.left, height: cell.top - cell.bottom };
}

/** A text run in PDF points. */
function run(str, x0, x1, y0, y1) {
  return { str, x0, x1, y0, y1 };
}

/** The context `detectCellCandidates` builds, with the per-test parts overridden. */
function context(overrides = {}) {
  return {
    geometry,
    textItemsPoints: [],
    ownText: [],
    closedColumnCounts: new Map(),
    emptyColumnCounts: new Map(),
    columnKey: (c) => `${Math.round(c.left)}|${Math.round(c.right)}`,
    isStackedRow: () => false,
    ...overrides,
  };
}

describe('resolveFloorTicked', () => {
  const floorCell = closed({ floorTicked: true, rowLeft: 10, rowRight: 90 });

  it('is not its kind of cell when the band is not floor-ticked', () => {
    expect(resolveFloorTicked(closed(), context())).toBeUndefined();
  });

  it('drops the field when no caption is printed below the floor rule', () => {
    expect(resolveFloorTicked(floorCell, context())).toBeNull();
  });

  it('captions the whole band from the text below the floor and keeps its full height', () => {
    const caption = run('Name', 20, 40, 52, 56);
    const resolved = resolveFloorTicked(floorCell, context({ textItemsPoints: [caption] }));
    expect(resolved?.label).toBe('Name');
    expect(resolved?.kind).toBe('text');
    expect(resolved?.coverage).toBe(0);
    expect(resolved?.enclosureBounds).toBeUndefined();
    expect(resolved?.bounds.top).toBeCloseTo(20, 5);
  });

  it('cuts the field down to the strip under a row caption, and publishes the band as its enclosure', () => {
    // The row caption sits in the band's top corner, so the writing line is what is left under it.
    const rowCaption = run('Name:', 12, 30, 70, 78);
    const floorCaption = run('Name', 20, 40, 52, 56);
    const resolved = resolveFloorTicked(floorCell, context({ textItemsPoints: [rowCaption, floorCaption] }));
    expect(resolved?.bounds.top).toBeCloseTo(30, 5);
    expect(resolved?.enclosureBounds?.top).toBeCloseTo(20, 5);
  });
});

describe('resolveNarrowTick', () => {
  const narrow = closed({ left: 60, right: 68, narrow: true });
  const repeating = new Map([['60|68', 3]]);

  it('is not its kind of cell when the cell is wide enough to read', () => {
    expect(resolveNarrowTick(closed(), context())).toBeUndefined();
  });

  it('drops a narrow cell that holds any text', () => {
    const ownText = [run('1', 61, 64, 65, 70)];
    expect(resolveNarrowTick(narrow, context({ ownText, closedColumnCounts: repeating }))).toBeNull();
  });

  it('drops a narrow cell whose column does not repeat', () => {
    expect(resolveNarrowTick(narrow, context({ closedColumnCounts: new Map([['60|68', 2]]) }))).toBeNull();
  });

  it('reads a blank narrow cell in a repeating column as a tick box labelled by its header', () => {
    const header = run('Yes', 58, 70, 82, 90);
    const resolved = resolveNarrowTick(narrow, context({ closedColumnCounts: repeating, textItemsPoints: [header] }));
    expect(resolved?.kind).toBe('checkbox');
    expect(resolved?.label).toBe('Yes');
    expect(resolved?.ownTextCount).toBe(0);
  });
});

describe('resolveLoneSquare', () => {
  const square = closed({ left: 40, right: 56, bottom: 60, top: 76, lone: true, square: true });

  it('is not its kind of cell unless it is lone, square and empty', () => {
    expect(resolveLoneSquare({ ...square, lone: false }, context())).toBeUndefined();
    expect(resolveLoneSquare({ ...square, square: false }, context())).toBeUndefined();
    expect(resolveLoneSquare(square, context({ ownText: [run('x', 44, 50, 64, 70)] }))).toBeUndefined();
  });

  it('takes an empty lone square as a tick box with no caption test', () => {
    const resolved = resolveLoneSquare(square, context());
    expect(resolved?.kind).toBe('checkbox');
    expect(resolved?.label).toBeUndefined();
  });
});

describe('resolveLoneBox', () => {
  const lone = closed({ lone: true });
  const caption = (str, y0) => run(str, 10, 40, y0, y0 + 4);

  it('is not its kind of cell when the box is not lone, or is a row of a stack', () => {
    expect(resolveLoneBox(closed(), context())).toBeUndefined();
    expect(resolveLoneBox(lone, context({ isStackedRow: () => true }))).toBeUndefined();
  });

  it('drops a lone box that holds any text, whatever its caption', () => {
    const ownText = [run('prose', 12, 30, 65, 70)];
    expect(resolveLoneBox(lone, context({ ownText, textItemsPoints: [caption('Name', 82)] }))).toBeNull();
  });

  it('drops a lone box with no caption above it', () => {
    expect(resolveLoneBox(lone, context())).toBeNull();
  });

  it('drops a lone box whose caption sits too far above it', () => {
    // 90 - 80 = 10 is inside LONE_CAPTION_GAP (12); 94 - 80 = 14 is past it.
    expect(resolveLoneBox(lone, context({ textItemsPoints: [caption('Name', 94)] }))).toBeNull();
  });

  it('drops a lone box whose caption is a sentence, not a short label', () => {
    const long = caption('A long instruction that is no label', 82);
    expect(resolveLoneBox(lone, context({ textItemsPoints: [long] }))).toBeNull();
  });

  it('lets a lone box with a short caption right on it fall through to the general resolver', () => {
    expect(resolveLoneBox(lone, context({ textItemsPoints: [caption('Name', 82)] }))).toBeUndefined();
  });
});

describe('resolveGeneralCell', () => {
  it('reads a blank cell as a text field labelled by the header above it', () => {
    const header = run('Full name', 10, 50, 82, 86);
    const resolved = resolveGeneralCell(closed(), context({ textItemsPoints: [header] }));
    expect(resolved?.kind).toBe('text');
    expect(resolved?.label).toBe('Full name');
    expect(resolved?.enclosureBounds).toBeUndefined();
  });

  it('drops a cell whose own text fills it', () => {
    const ownText = [run('terms', 10, 50, 60, 80)];
    expect(resolveGeneralCell(closed(), context({ ownText }))).toBeNull();
  });

  it('drops a cell whose own text is a bare checkbox glyph', () => {
    const ownText = [run('o', 12, 14, 62, 64)];
    expect(resolveGeneralCell(closed(), context({ ownText }))).toBeNull();
  });
});
