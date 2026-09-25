import { describe, expect, it } from 'vitest';
import { createPageGeometry } from '../../../editor/geometry/coords.ts';
import { placeTextOnCell } from '../../../editor/text/combPlacement.ts';
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
    // The strip is not thrown away, though: it rides along as `writable`,
    // which is where a box typed into the cell goes. See the placement
    // describe below.
    expect(cell.writable.left).toBeCloseTo(50, 5);
    expect(cell.writable.width).toBeCloseTo(35, 5);
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

describe('detectCellCandidates -> placeTextOnCell: where the typed box goes', () => {
  // One row, two cells, both carved sideways by their own printed text - and
  // the two carves mean opposite things. The left cell's text is a caption a
  // person writes *beside*; the right cell's is the `/  /` of a printed date,
  // which a person writes *across*. Form 101 page 1 prints both, four cells
  // apart.
  //
  // On an RTL form a box given a cell's whole span starts its text at the
  // span's *right* edge (getTextAlign, and the same arithmetic in the
  // exporter's pen). For the captioned cell that wall is where the caption is
  // printed, so the whole span means "type across the caption" and the box has
  // to stop at the strip. For the date cell the whole span is exactly right.
  const ink = rowBand({ top: 80, bottom: 60, columns: [0, 50, 100] });
  const CAPTION_LEFT = 28;
  // Both runs sit in the lower half of the band, so neither cell can carve a
  // band under its text - a side carve is the only one on offer here.
  const caption = text('מספר טלפון', { left: CAPTION_LEFT, top: 29, width: 20, height: 2.2 });
  const separators = [
    text('/', { left: 78, top: 29, width: 1.5, height: 2.2 }),
    text('/', { left: 88, top: 29, width: 1.5, height: 2.2 }),
  ];
  const detect = () => detectCellCandidates(ink, geometry, 0, [caption, ...separators]);
  const place = (cell) => placeTextOnCell(cell, { fontSize: 12, pageHeightPoints: 100 });

  it('stops the box at a real caption hugging the cell wall, instead of typing across it', () => {
    const [cell] = detect();
    expect(cell.label).toBe('מספר טלפון');
    // Placement only: the bounds are still the whole ruled cell.
    expect(cell.left).toBeCloseTo(0, 5);
    expect(cell.width).toBeCloseTo(50, 5);

    const placed = place(cell);
    expect(placed.left).toBeCloseTo(0, 5);
    // The box's right edge is where the first typed character lands on this
    // form, so it must not reach the caption's left edge.
    expect(placed.left + placed.minWidth).toBeLessThanOrEqual(CAPTION_LEFT + 1e-9);
  });

  it('gives a date cell the whole cell, because `/  /` is written across, not beside', () => {
    const [captioned, date] = detect();
    // The pair is the assertion: the same side carve happens in both cells,
    // and only a caption is a reason to move the box off it. Pinning both
    // here is what stops the date cells being "fixed" alongside the phone
    // cells, or the phone cells being given up to leave the dates alone.
    expect(captioned.writable).toBeDefined();
    expect(date.kind).toBe('date');
    expect(date.writable).toBeUndefined();

    const placed = place(date);
    expect(placed.left).toBeCloseTo(50, 5);
    expect(placed.minWidth).toBeCloseTo(50, 5);
    // Which is what puts the day, month and year on top of the separators.
    expect(placed.left + placed.minWidth).toBeGreaterThan(88);
  });

  it('gives a phone cell the width under its caption, writing across its area-code slash', () => {
    // Form 101's lower phone cells: the caption in the top corner, a lone `/`
    // low in the middle. Read as caption, the slash carved the cell sideways
    // and left the box a sliver left of it.
    const phoneInk = rowBand({ top: 80, bottom: 60, columns: [0, 50, 100] });
    const phoneCaption = text('מספר טלפון', { left: 28, top: 20.5, width: 20, height: 2.2 });
    const areaCodeSlash = text('/', { left: 25, top: 36, width: 1.5, height: 2.2 });
    const [cell] = detectCellCandidates(phoneInk, geometry, 0, [phoneCaption, areaCodeSlash]);
    expect(cell.label).toContain('מספר טלפון');
    expect(cell.width).toBeCloseTo(50, 5);

    const placed = place(cell);
    expect(placed.left).toBeCloseTo(0, 5);
    expect(placed.minWidth).toBeCloseTo(50, 5);
    // The band under the caption (its baseline at percent 22.7), not on it.
    expect(cell.writable.top).toBeCloseTo(22.7, 5);
    expect(cell.writable.height).toBeCloseTo(17.3, 5);
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

describe('rows are scoped per column', () => {
  // Rule heights are collected page-wide, so ink that never touches a table can still add a
  // height inside its rows. Form 101's children table is the live case: the boxes to its left
  // rule their own lines at heights that fall mid-row, and every row there came back empty.

  it('keeps a row\'s cells when a stray rule off to the side lands at a height inside it', () => {
    const table = rowBand({ top: 80, bottom: 60, columns: [22, 48, 74, 100] });
    // A short rule well to the left of the table, halfway down its row. It crosses none of the
    // table's columns, so it must not split the row into two 10pt halves that close on nothing.
    const stray = { horizontals: [{ y: 70, x0: 0, x1: 15 }], verticals: [], rects: [] };
    const cells = detectCellCandidates(mergeInk(table, stray), geometry, 0, []);
    expect(cells).toHaveLength(3);
    expect(cells.map((c) => c.left)).toEqual([22, 48, 74]);
    expect(cells.every((c) => Math.abs(c.height - 20) < 1e-9)).toBe(true);
  });

  it('does not read a large filled, unstroked background panel\'s sides as walls', () => {
    // Form 1040 tints its whole body with one unstroked fill. Its left side runs through the
    // middle of the first cell here (x=35), which as a wall split that cell in two.
    const row = rowBand({ top: 80, bottom: 60, columns: [20, 50, 80] });
    const panel = {
      horizontals: [],
      verticals: [],
      rects: [{ x: 35, y: 5, width: 60, height: 90, filled: true, stroked: false }],
    };
    const cells = detectCellCandidates(mergeInk(row, panel), geometry, 0, []);
    expect(cells.map((c) => [c.left, c.width])).toEqual([[20, 30], [50, 30]]);
  });

  it('keeps the row when a stray height sits just over 1pt from its own top or bottom', () => {
    // Heights merge within 1pt, but a rule counts as bounding a row up to 1.5pt away. A stray
    // height in that gap must not be read as the row's own top or bottom rule crossing it.
    const table = rowBand({ top: 80, bottom: 60, columns: [22, 48, 74, 100] });
    for (const y of [81.2, 78.8, 61.2, 58.8]) {
      const stray = {
        horizontals: [{ y: 70, x0: 0, x1: 15 }, { y, x0: 0, x1: 15 }],
        verticals: [],
        rects: [],
      };
      const cells = detectCellCandidates(mergeInk(table, stray), geometry, 0, []);
      expect(cells.map((c) => c.left), `stray height at ${y}`).toEqual([22, 48, 74]);
      expect(cells.every((c) => Math.abs(c.height - 20) < 1e-9)).toBe(true);
    }
  });

  it('does not close a row short on a height just inside it that only a box beside it has', () => {
    // A radio square beside the row puts heights 1.3pt inside its top and bottom. A row rule is
    // accepted up to 1.5pt off, so without looking at what is actually at those heights every
    // column would close a second, shorter cell on them.
    const table = rowBand({ top: 80, bottom: 60, columns: [22, 48, 74, 100] });
    const square = {
      horizontals: [{ y: 78.7, x0: 110, x1: 117 }, { y: 61.3, x0: 110, x1: 117 }],
      verticals: [{ x: 110, y0: 61.3, y1: 78.7 }, { x: 117, y0: 61.3, y1: 78.7 }],
      rects: [],
    };
    const cells = detectCellCandidates(mergeInk(table, square), geometry, 0, []);
    expect(cells.map((c) => [c.left, c.height])).toEqual([[22, 20], [48, 20], [74, 20]]);
  });

  it('drops only the column a rule in between actually crosses', () => {
    const table = rowBand({ top: 80, bottom: 60, columns: [22, 48, 74, 100] });
    // A short rule across the middle column, too short to close either half of it on its own.
    const splitter = { horizontals: [{ y: 70, x0: 55, x1: 65 }], verticals: [], rects: [] };
    const cells = detectCellCandidates(mergeInk(table, splitter), geometry, 0, []);
    expect(cells.map((c) => [c.left, c.width, c.height])).toEqual([[22, 26, 20], [74, 26, 20]]);
  });

  it('drops a column whose wall is the side of a smaller box beside it', () => {
    // The health declaration's sliver: the gap between a table's frame and a radio square,
    // whose right wall is the square's side. The square's own top and bottom end against that
    // wall mid-row, so the column is not one cell across the row.
    const table = rowBand({ top: 80, bottom: 60, columns: [22, 48, 74, 100] });
    const square = {
      horizontals: [{ y: 76, x0: 100, x1: 107 }, { y: 64, x0: 100, x1: 107 }],
      verticals: [{ x: 107, y0: 64, y1: 76 }],
      rects: [],
    };
    const cells = detectCellCandidates(mergeInk(table, square), geometry, 0, []);
    expect(cells.map((c) => c.left)).toEqual([22, 48]);
  });

  it('does not close a column on a band when its real bottom rule sits just past it', () => {
    // The right column's own bottom rule is 1.3pt below the others'. The others' rule clips its
    // corner, so it does cross the column at the band's bottom, and the 1.3pt rule is inside
    // the 1.5pt a bounding rule may sit off. The column still must not close on the band.
    const ink = {
      horizontals: [
        { y: 80, x0: 22, x1: 100 },
        { y: 60, x0: 22, x1: 80 },
        { y: 58.7, x0: 74, x1: 100 },
        { y: 70, x0: 0, x1: 15 },
      ],
      verticals: [
        { x: 22, y0: 60, y1: 80 },
        { x: 48, y0: 60, y1: 80 },
        { x: 74, y0: 58.7, y1: 80 },
        { x: 100, y0: 58.7, y1: 80 },
      ],
      rects: [],
    };
    const cells = detectCellCandidates(ink, geometry, 0, []);
    expect(cells.map((c) => [c.left, c.height])).toEqual([[22, 20], [48, 20]]);
  });

  it('stays cheap on a dense hatch of hundreds of page-wide rules', () => {
    // 636 full-width rules at a 1.1pt pitch across 41 walls. Pairing every height with every
    // height a row could reach, and re-scanning every rule per pair, took seconds here. The
    // bound is loose on purpose: it catches that blow-up, not a slow machine.
    const bigPage = createPageGeometry({ cropBox: { x: 0, y: 0, width: 800, height: 800 }, rotation: 0 });
    const hatch = {
      horizontals: Array.from({ length: 636 }, (_, n) => ({ y: 50 + n * 1.1, x0: 0, x1: 600 })),
      verticals: Array.from({ length: 41 }, (_, n) => ({ x: n * 15, y0: 50, y1: 50 + 635 * 1.1 })),
      rects: [],
    };
    const started = performance.now();
    const cells = detectCellCandidates(hatch, bigPage, 0, []);
    expect(performance.now() - started).toBeLessThan(500);
    expect(cells).toEqual([]);
  });
});

describe('FORM-14: a caption\'s own shape decides label vs heading, not what repeats below it', () => {
  // Mirrors form 101's children-table header: a 12.4pt-tall row whose two cells each hold a
  // short caption reaching the cell's midpoint (`rightHug`), the same shape as an ordinary
  // labelled field. FORM-13 tried telling the two apart by what repeats underneath; FORM-14
  // replaces that with the caption's own shape - RTL_RE and HEADER_GAP_RATIO. What is stacked
  // below (or whether anything is) no longer affects the verdict, so every case here uses one
  // empty row, health's own shape.
  const HEADER_TOP = 92.4;
  const HEADER_BOTTOM = 80; // 12.4pt tall, matching form 101's own header row.
  const HEADER_COLUMNS = [0, 50, 100];
  // Baseline (y0) at pdf y=83, well below the row's midpoint (86.2): the lower half, so this is
  // NOT a band carve.
  const CAPTION = { top: 14.8, height: 2.2 }; // percent top 14.8 -> pdf y1 85.2, y0 83.
  // Hugging its cell's right wall: leftGap 30 vs rightGap 10, ratio 3.0 - HEADER_GAP_RATIO's own
  // boundary, matching form 101's real children-table captions.
  const idCaptionHugging = text('מספר זהות', { left: 30, width: 10, ...CAPTION });
  const nameCaptionHugging = text('שם', { left: 80, width: 10, ...CAPTION });
  // Centred in its cell: ratio 1.0 - health's own four column headings measure 0.94-1.02,
  // itc101's least-centred one 1.35. Same percent numbers as everywhere else in this block, but
  // 'drops a centred RTL caption...' below renders them against a page double this one's width,
  // so each 50pt half-cell becomes a 100pt one and the gap on both sides clears MIN_BLANK_WIDTH
  // (25pt) - on this page's own 50pt cells a 20pt leftGap is already under that floor, so the
  // case would pass even with HEADER_GAP_RATIO disabled and pin nothing.
  const idCaptionCentred = text('מספר זהות', { left: 20, width: 10, ...CAPTION });
  const nameCaptionCentred = text('שם', { left: 70, width: 10, ...CAPTION });
  const idSeparator = text('/ /', { left: 30, width: 10, ...CAPTION });
  const nameSeparator = text('/ /', { left: 80, width: 10, ...CAPTION });
  // Percent top of the header's own bottom wall (pdf y=80 -> 100-80=20): a real header
  // candidate's `top` is always less than this, a data row's never is.
  const HEADER_PERCENT_FLOOR = 20;

  function header() {
    return rowBand({ top: HEADER_TOP, bottom: HEADER_BOTTOM, columns: HEADER_COLUMNS });
  }

  /** `count` identical 20pt rows, stacked directly under the header with no gap. */
  function emptyRows(count) {
    const bands = [];
    for (let i = 0; i < count; i += 1) {
      bands.push(rowBand({
        top: HEADER_BOTTOM - i * 20,
        bottom: HEADER_BOTTOM - (i + 1) * 20,
        columns: HEADER_COLUMNS,
      }));
    }
    return mergeInk(...bands);
  }

  it('drops a centred RTL caption as a heading, keeping the data row', () => {
    // Cells doubled to 100pt wide (page 200x100pt, header cols [0, 100, 200]) so
    // idCaptionCentred/nameCaptionCentred - unchanged percent numbers - land with a 40pt gap on
    // both sides: clearly past MIN_BLANK_WIDTH (25pt) with ratio 1.0, so only HEADER_GAP_RATIO,
    // not the width floor, is what has to reject them.
    const wideGeometry = createPageGeometry({ cropBox: { x: 0, y: 0, width: 200, height: 100 }, rotation: 0 });
    const wideColumns = [0, 100, 200];
    const ink = mergeInk(
      rowBand({ top: HEADER_TOP, bottom: HEADER_BOTTOM, columns: wideColumns }),
      rowBand({ top: HEADER_BOTTOM, bottom: HEADER_BOTTOM - 20, columns: wideColumns }),
    );
    const candidates = detectCellCandidates(ink, wideGeometry, 0, [idCaptionCentred, nameCaptionCentred]);
    expect(candidates).toHaveLength(2); // only the one data row's 2 columns
    expect(candidates.every((c) => c.top >= HEADER_PERCENT_FLOOR - 1e-6)).toBe(true);
  });

  it('keeps a hugging RTL caption as a field, over the same run', () => {
    const ink = mergeInk(header(), emptyRows(1));
    const candidates = detectCellCandidates(ink, geometry, 0, [idCaptionHugging, nameCaptionHugging]);
    expect(candidates).toHaveLength(4); // the header's 2 cells, plus the one data row's 2
    const headerCells = candidates.filter((c) => c.top < HEADER_PERCENT_FLOOR - 1e-6);
    expect(headerCells).toHaveLength(2);
    expect(headerCells.every((c) => c.kind === 'text')).toBe(true);
  });

  it('never side-carves an LTR caption, even when it reaches the cell\'s midpoint', () => {
    // Same geometry as the hugging RTL case above, translated to English - reaches the
    // midpoint (`rightHug`) exactly the way a real label would, but RTL_RE screens it out
    // before HEADER_GAP_RATIO is even asked.
    const ink = mergeInk(header(), emptyRows(1));
    const idLatin = text('ID number', { left: 30, width: 10, ...CAPTION });
    const nameLatin = text('Name', { left: 80, width: 10, ...CAPTION });
    const candidates = detectCellCandidates(ink, geometry, 0, [idLatin, nameLatin]);
    expect(candidates).toHaveLength(2); // only the one data row's 2 columns - the caption row is gone
    expect(candidates.every((c) => c.top >= HEADER_PERCENT_FLOOR - 1e-6)).toBe(true);
  });

  it('never side-carves a Latin caption whose own text carries a U+FEFF (BOM)', () => {
    // RTL_RE used to run to ﻿, so a byte-order-mark left behind by a PDF's own text
    // extraction (not RTL script) could still register as an RTL character and let a plain
    // English caption side-carve. A BOM that leads the caption's *own joined string* is not a
    // real case here: writableArea trims that string before testing it, and trim() already
    // treats ﻿ as whitespace, so a genuinely leading/trailing BOM is stripped before RTL_RE
    // ever sees it - proven harmless independently of this regex. The real case is a BOM a PDF
    // leaves at the start of one of several text runs making up a caption (a common decoding
    // artefact), which survives the trim because it is not at the joined string's own edge - so
    // this caption is split into two runs, 'ID' then the BOM-prefixed 'number', same hugging
    // geometry (leftGap 30 vs rightGap 10) as idCaptionHugging above.
    const ink = mergeInk(header(), emptyRows(1));
    const idPart1 = text('ID', { left: 30, width: 5, ...CAPTION });
    const idPart2 = text('﻿number', { left: 35, width: 5, ...CAPTION });
    const nameLatin = text('Name', { left: 80, width: 10, ...CAPTION });
    const candidates = detectCellCandidates(ink, geometry, 0, [idPart1, idPart2, nameLatin]);
    expect(candidates).toHaveLength(2); // only the one data row's 2 columns - the caption row is gone
    expect(candidates.every((c) => c.top >= HEADER_PERCENT_FLOOR - 1e-6)).toBe(true);
  });

  it('keeps a printed "/ /" cell above a run of empty rows - it is written across, not captioned', () => {
    const ink = mergeInk(header(), emptyRows(3));
    const candidates = detectCellCandidates(ink, geometry, 0, [idSeparator, nameSeparator]);
    expect(candidates).toHaveLength(8);
    const headerCells = candidates.filter((c) => c.top < HEADER_PERCENT_FLOOR - 1e-6);
    expect(headerCells).toHaveLength(2);
    expect(headerCells.every((c) => c.kind === 'date')).toBe(true);
  });
});
