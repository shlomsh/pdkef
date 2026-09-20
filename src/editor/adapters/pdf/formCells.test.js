import { describe, expect, it } from 'vitest';
import { createPageGeometry } from '../../geometry/coords.ts';
import { detectCellCandidates } from './formCells.js';

// A 100x100pt page makes the PDF-point <-> page-percent arithmetic trivial to read: percent
// x equals PDF x, and percent top equals `100 - PDF y` (the one y-flip in the whole model).
const geometry = createPageGeometry({ cropBox: { x: 0, y: 0, width: 100, height: 100 }, rotation: 0 });

/** An empty ink page, with one row band from `top` to `bottom` (PDF points, y up) carrying
 * `columns.length - 1` cells between the given x positions. */
function rowBand({ top, bottom, columns }) {
  const horizontals = [{ y: top, x0: columns[0], x1: columns[columns.length - 1] },
    { y: bottom, x0: columns[0], x1: columns[columns.length - 1] }];
  const verticals = columns.map((x) => ({ x, y0: bottom, y1: top }));
  return { horizontals, verticals, rects: [] };
}

function mergeInk(...pages) {
  return {
    horizontals: pages.flatMap((p) => p.horizontals),
    verticals: pages.flatMap((p) => p.verticals),
    rects: pages.flatMap((p) => p.rects),
  };
}

/** A page-percent text run, matching pdf.js's `dir` field shape (unused by formCells.js). */
function text(str, { left, top, width, height = 2.2 }) {
  return { str, left, top, width, height };
}

describe('detectCellCandidates', () => {
  it('finds two blank cells in a two-column row and classifies them text', () => {
    // Row from y=60 to y=80 (height 20pt, within range), three verticals -> two cells.
    const ink = rowBand({ top: 80, bottom: 60, columns: [0, 50, 100] });
    const [a, b] = detectCellCandidates(ink, geometry, 0, []);
    expect(a.kind).toBe('text');
    expect(b.kind).toBe('text');
    expect(a.label).toBeUndefined();
    // percent top = 100 - 80 = 20, height = 20 (20pt on a 100pt-tall page).
    expect(a.top).toBeCloseTo(20, 5);
    expect(a.height).toBeCloseTo(20, 5);
  });

  it('drops a row bounded only by its own two outer walls (no interior division)', () => {
    // An instructional panel: one bordered paragraph, no internal rule.
    const ink = rowBand({ top: 80, bottom: 60, columns: [0, 100] });
    expect(detectCellCandidates(ink, geometry, 0, [])).toEqual([]);
  });

  it('ignores a row band outside the writable height range', () => {
    const tooShort = rowBand({ top: 80, bottom: 78, columns: [0, 50, 100] }); // 2pt < MIN_ROW_HEIGHT
    const tooTall = rowBand({ top: 80, bottom: 20, columns: [0, 50, 100] }); // 60pt > MAX_ROW_HEIGHT
    expect(detectCellCandidates(tooShort, geometry, 0, [], [])).toEqual([]);
    expect(detectCellCandidates(tooTall, geometry, 0, [], [])).toEqual([]);
  });

  it('reads a column header above a blank cell as its label', () => {
    const ink = rowBand({ top: 80, bottom: 60, columns: [0, 40, 100] });
    // Header sits directly above the second cell (percent left 40..100 -> percent top < 20).
    const header = text('שם משפחה', { left: 40, top: 10, width: 30 });
    const [, cell] = detectCellCandidates(ink, geometry, 0, [header]);
    expect(cell.label).toBe('שם משפחה');
    expect(cell.kind).toBe('text');
  });

  it('classifies a header containing תאריך as a date cell', () => {
    const ink = rowBand({ top: 80, bottom: 60, columns: [0, 50, 100] });
    const header = text('תאריך לידה', { left: 0, top: 10, width: 50 });
    const [cell] = detectCellCandidates(ink, geometry, 0, [header]);
    expect(cell.kind).toBe('date');
  });

  it('classifies a header containing the חתימ root (construct state) as a signature cell', () => {
    const ink = rowBand({ top: 80, bottom: 60, columns: [0, 50, 100] });
    // חתימת (construct state, "signature-of-") does not contain the literal string חתימה.
    const header = text('חתימת העובד', { left: 0, top: 10, width: 50 });
    const [cell] = detectCellCandidates(ink, geometry, 0, [header]);
    expect(cell.kind).toBe('signature');
  });

  it('classifies a cell whose own text is a bare slash pattern as a date', () => {
    // Cell spans PDF points y 60..80, which is percent top 20..40 (100 - y) - own text has to
    // land inside that percent range, hugging the visual top edge (percent top close to 20).
    const ink = rowBand({ top: 80, bottom: 60, columns: [0, 50, 100] });
    const ownText = text('/  /', { left: 5, top: 21, width: 8, height: 2 });
    const [cell] = detectCellCandidates(ink, geometry, 0, [ownText]);
    expect(cell.kind).toBe('date');
  });

  it('drops an explanatory box whose own text covers most of its area', () => {
    const ink = rowBand({ top: 80, bottom: 60, columns: [0, 50, 100] });
    // ~76% of the first (left 0..50) cell's area; the second cell stays genuinely blank.
    const paragraph = text('א', { left: 1, top: 21, width: 45, height: 17 });
    const candidates = detectCellCandidates(ink, geometry, 0, [paragraph]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].left).toBeCloseTo(50, 5); // only the untouched second cell survives
  });

  it('promotes a column recurring across three or more row bands to table-cell', () => {
    const ink = mergeInk(
      rowBand({ top: 90, bottom: 82, columns: [0, 50, 100] }),
      rowBand({ top: 78, bottom: 70, columns: [0, 50, 100] }),
      rowBand({ top: 66, bottom: 58, columns: [0, 50, 100] }),
    );
    const kinds = detectCellCandidates(ink, geometry, 0, []).map((c) => c.kind);
    expect(kinds).toHaveLength(6);
    expect(kinds.every((k) => k === 'table-cell')).toBe(true);
  });

  it('leaves a one-off column (fewer than three row bands) as text, not table-cell', () => {
    const ink = mergeInk(
      rowBand({ top: 90, bottom: 82, columns: [0, 50, 100] }),
      rowBand({ top: 78, bottom: 70, columns: [0, 50, 100] }),
    );
    const kinds = detectCellCandidates(ink, geometry, 0, []).map((c) => c.kind);
    expect(kinds).toHaveLength(4);
    expect(kinds.every((k) => k === 'text')).toBe(true);
  });

  it('assigns a lower confidence than the baseline detector\'s 0.8, capped at 0.7', () => {
    const ink = rowBand({ top: 80, bottom: 60, columns: [0, 50, 100] });
    const header = text('תאריך לידה', { left: 0, top: 10, width: 50 });
    const [cell] = detectCellCandidates(ink, geometry, 0, [header]);
    expect(cell.confidence).toBeLessThan(0.8);
    expect(cell.confidence).toBeLessThanOrEqual(0.7);
  });
});

describe('detectCellCandidates – the bounds are the writing strip, not the ruled box', () => {
  // Form 101's employer row, live: "מספר טלפון" printed small in the top-right
  // corner of a 25pt-tall cell. Centring a box on the whole cell put the top
  // of the typed number against that label's baseline; the answer belongs
  // in the blank strip under it, and so does the field's own box (five of
  // form 101's labelled cells scored as false positives on a real target,
  // at IoU 0.44-0.49, purely because they published the caption too).

  it('publishes the whole cell, and no enclosure, for a wholly blank one', () => {
    const ink = rowBand({ top: 80, bottom: 60, columns: [0, 50, 100] });
    const [cell] = detectCellCandidates(ink, geometry, 0, []);
    expect(cell.top).toBeCloseTo(20, 5);
    expect(cell.height).toBeCloseTo(20, 5);
    expect(cell.enclosure).toBeUndefined();
  });

  it('publishes the band UNDER a label sitting in the top corner, at the cell\'s full width', () => {
    const ink = rowBand({ top: 80, bottom: 60, columns: [0, 50, 100] });
    // Percent top 21, height 6 -> PDF y 73..79: the label's baseline is at 73,
    // 13pt above the cell floor (60), in the cell's top half and hugging its
    // right wall too.
    const label = text('שם', { left: 70, top: 21, width: 10, height: 6 });
    const [, cell] = detectCellCandidates(ink, geometry, 0, [label]);
    expect(cell.label).toBe('שם');
    // The band starts at the label's baseline and runs to the floor, full width:
    // NOT the inner corner of the L (which would stop at the label's left, 70).
    expect(cell.left).toBeCloseTo(50, 5);
    expect(cell.top).toBeCloseTo(27, 5);
    expect(cell.width).toBeCloseTo(50, 5);
    expect(cell.height).toBeCloseTo(13, 5);
    // The ruled box rides along, so a tap on the caption still lands on the field.
    expect(cell.enclosure.top).toBeCloseTo(20, 5);
    expect(cell.enclosure.height).toBeCloseTo(20, 5);
  });

  it('keeps the whole cell when the only blank is a strip BESIDE a right-hugging label', () => {
    // A 12pt-tall cell: the label's baseline (65) is in the lower half, so
    // there is no room under it, but 35pt of blank to its left. That blank is
    // what admits the cell, and it is not trusted to be where the answer goes:
    // form 101's `/ /` date cells and its phone cells read exactly this way and
    // lost IoU 0.54-0.74 -> 0.09-0.22 when the sliver was published.
    const ink = rowBand({ top: 72, bottom: 60, columns: [0, 50, 100] });
    const label = text('שם', { left: 85, top: 29, width: 12, height: 6 });
    const [, cell] = detectCellCandidates(ink, geometry, 0, [label]);
    expect(cell.label).toBe('שם');
    expect(cell.left).toBeCloseTo(50, 5);
    expect(cell.top).toBeCloseTo(28, 5);
    expect(cell.width).toBeCloseTo(50, 5);
    expect(cell.height).toBeCloseTo(12, 5);
    expect(cell.enclosure).toBeUndefined();
  });

  it('publishes the whole cell when the label is a header above it, not inside it', () => {
    const ink = rowBand({ top: 80, bottom: 60, columns: [0, 40, 100] });
    const header = text('שם משפחה', { left: 40, top: 10, width: 30 });
    const [, cell] = detectCellCandidates(ink, geometry, 0, [header]);
    expect(cell.label).toBe('שם משפחה');
    expect(cell.height).toBeCloseTo(20, 5);
    expect(cell.enclosure).toBeUndefined();
  });
});

describe('narrow tick columns', () => {
  /** Three stacked 20pt row bands sharing one column layout (MOBI-11's children table shape). */
  function stackedRows(columns, count = 3) {
    const bands = [];
    for (let i = 0; i < count; i += 1) {
      bands.push(rowBand({ top: 80 - i * 20, bottom: 60 - i * 20, columns }));
    }
    return mergeInk(...bands);
  }

  it('reads a narrow blank column that repeats down a table as tick cells', () => {
    // A wide writable cell (0..60) beside two 8pt tick columns, the shape form 101 rules its
    // children table in: a name to write, then two columns a person ticks.
    const ink = stackedRows([0, 60, 68, 76]);
    const ticks = detectCellCandidates(ink, geometry, 0, []).filter((c) => c.kind === 'checkbox');
    expect(ticks).toHaveLength(6);
    expect(ticks.every((c) => c.width < 15)).toBe(true);
  });

  it('leaves a narrow column alone when it does not repeat', () => {
    // The same 8pt columns on a single band: an incidental gap, not a printed tick column.
    const ink = rowBand({ top: 80, bottom: 60, columns: [0, 60, 68, 76] });
    expect(detectCellCandidates(ink, geometry, 0, []).some((c) => c.kind === 'checkbox')).toBe(false);
  });

  it('does not tick a narrow cell that holds printed text', () => {
    // A repeating narrow column carrying a row number is a printed value, not somewhere to tick.
    const ink = stackedRows([0, 60, 68, 76]);
    const digits = [1, 2, 3].map((n, i) => text(String(n), { left: 69, top: 21 + i * 20, width: 4 }));
    const ticks = detectCellCandidates(ink, geometry, 0, digits).filter((c) => c.kind === 'checkbox');
    // The 68..76 column is out; the 60..68 column beside it still ticks.
    expect(ticks.every((c) => c.left < 68)).toBe(true);
  });
});
