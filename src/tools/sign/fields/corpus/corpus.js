/**
 * What the form-field detector finds, one element at a time.
 *
 * Every case is a real PDF built from a readable spec (`documents.js`) and run
 * through the whole pipeline the Sign tool runs. The point is regression
 * safety while the detector is refactored: add an element, add a row; the
 * rows already here keep proving themselves for free. `README.md` has the
 * paradigm and how to add one.
 *
 * `expect` is the count of each region kind the pipeline surfaces. A zero is
 * as much of an assertion as a one - several rows exist only to pin something
 * that must NOT be detected.
 */

import { expect } from 'vitest';

/** A page-percent value asserted to a hundredth, for a row that pins a derived box. */
const near = (value) => expect.closeTo(value, 2);

/** The rectangle most single-element cases use: a wide field, upper left. */
const FIELD = { x: 40, y: 200, width: 200, height: 20 };
/** A checkbox-sized square, inside `formGrid.js`'s 4-16pt band. */
const SQUARE = { x: 40, y: 200, width: 12, height: 12 };

const none = { combs: 0, cells: 0, checkboxes: 0 };

/**
 * @typedef {object} Case
 * @property {string} group which vocabulary this element belongs to.
 * @property {string} name what the element is.
 * @property {string} why what this row is actually pinning.
 * @property {object} doc a `buildDocument` spec.
 * @property {{combs: number, cells: number, checkboxes: number}} expect
 * @property {{cells: number, boxed: boolean}} [comb] asserted on the single comb.
 */

/** Live AcroForm fields: the form states what it has, and `/Rect` is exact. */
const LIVE_FORM = [
  {
    name: 'a plain text field',
    why: 'the ordinary case - one field, offered as a free-text cell',
    doc: { widgets: [{ widget: 'text', ...FIELD }] },
    expect: { ...none, cells: 1 },
  },
  {
    name: 'a comb text field',
    why: 'the comb flag plus /MaxLen is a run of boxes, and it is boxed: its own cells are the field',
    doc: { widgets: [{ widget: 'text', ...FIELD, comb: 9 }] },
    expect: { ...none, combs: 1 },
    comb: { cells: 9, boxed: true },
  },
  {
    name: 'a comb longer than the editor can draw',
    why: 'still a real field worth offering, just not as a comb (MAX_COMB_CELLS is 60)',
    doc: { widgets: [{ widget: 'text', ...FIELD, comb: 61 }] },
    expect: { ...none, cells: 1 },
  },
  {
    name: 'a multiline text field',
    why: 'multiline is one bit below the comb flag; it must not be read as one',
    doc: { widgets: [{ widget: 'text', ...FIELD, multiline: true }] },
    expect: { ...none, cells: 1 },
  },
  {
    name: 'a required text field',
    why: 'required says nothing about whether it can be written in',
    doc: { widgets: [{ widget: 'text', ...FIELD, required: true }] },
    expect: { ...none, cells: 1 },
  },
  {
    name: 'a read-only text field',
    why: 'nobody can write in one, so offering it would aim a tap at nothing',
    doc: { widgets: [{ widget: 'text', ...FIELD, readOnly: true }] },
    expect: none,
  },
  {
    name: 'a hidden text field',
    why: 'not on the page to tap',
    doc: { widgets: [{ widget: 'text', ...FIELD, flag: 'hidden' }] },
    expect: none,
  },
  {
    name: 'a no-view text field',
    why: 'the other way a widget is on the page but not shown',
    doc: { widgets: [{ widget: 'text', ...FIELD, flag: 'noView' }] },
    expect: none,
  },
  {
    name: 'a print-flagged text field',
    why: 'the companion to the two above: printable says nothing about visibility',
    doc: { widgets: [{ widget: 'text', ...FIELD, flag: 'print' }] },
    expect: { ...none, cells: 1 },
  },
  {
    name: 'a checkbox',
    why: '/Btn widgets come off /Annots, not off ink - this is the path that already worked',
    doc: { widgets: [{ widget: 'checkbox', ...SQUARE }] },
    expect: { ...none, checkboxes: 1 },
  },
  {
    name: 'a radio group of two',
    why: 'a radio is /Btn too, and each option is its own mark target',
    doc: {
      widgets: [{
        widget: 'radio',
        options: [SQUARE, { ...SQUARE, x: 80 }],
      }],
    },
    expect: { ...none, checkboxes: 2 },
  },
  {
    name: 'a hidden checkbox',
    why: 'the visibility rules are not only for text fields - a checkbox nobody can see is not a mark target',
    doc: { widgets: [{ widget: 'checkbox', ...SQUARE, flag: 'hidden' }] },
    expect: none,
  },
  {
    name: 'a no-view checkbox',
    why: 'the other invisibility flag, on the other field kind',
    doc: { widgets: [{ widget: 'checkbox', ...SQUARE, flag: 'noView' }] },
    expect: none,
  },
  {
    name: 'a read-only checkbox',
    why: 'nobody can tick one, same as nobody can type in a read-only text field',
    doc: { widgets: [{ widget: 'checkbox', ...SQUARE, readOnly: true }] },
    expect: none,
  },
  {
    name: 'a hidden radio group',
    why: 'every option of a hidden group goes, not just the first',
    doc: { widgets: [{ widget: 'radio', options: [SQUARE, { ...SQUARE, x: 80 }], flag: 'hidden' }] },
    expect: none,
  },
  {
    name: 'a print-flagged checkbox',
    why: 'the companion row: printable is not invisible, and the checkbox must survive',
    doc: { widgets: [{ widget: 'checkbox', ...SQUARE, flag: 'print' }] },
    expect: { ...none, checkboxes: 1 },
  },
  {
    name: 'a push button',
    why: 'also /Btn, but it holds no value and cannot be ticked - a mark on Submit is nonsense',
    doc: { widgets: [{ widget: 'pushButton', x: 40, y: 200, width: 90, height: 24 }] },
    expect: none,
  },
  {
    name: 'a dropdown',
    why: '/Ch is neither a text field nor a button; the detector has no answer for it and must not guess',
    doc: { widgets: [{ widget: 'dropdown', ...FIELD }] },
    expect: none,
  },
];

/** Printed ink: what a flat form has instead, and all the ink walk can see. */
const PRINTED = [
  {
    name: 'comb teeth on a writing line',
    why: 'an open comb - ticks at a constant pitch, no boxes (income tax form 101 draws them this way)',
    doc: { ink: [{ ink: 'combTeeth', x: 40, y: 200, pitch: 14, cells: 9 }] },
    expect: { ...none, combs: 1 },
    comb: { cells: 9, boxed: false },
  },
  // The two rows below give an open comb its field's height (FORM-27). Page 400x300, so a percent
  // is 4pt across and 3pt down; `writable` is asserted to a hundredth of a percent.
  {
    name: 'comb teeth standing in a ruled table column',
    why: "FORM-27: form 101's children table. 7.5pt teeth rise 0.357 of a 21pt row, past FORM-26's "
      + 'MIN_FLOOR_RISE_FRACTION, so read as floor ticks they cut the column into uncaptioned slivers '
      + 'and the comb lost its cell. Ticks that divide a column into no captioned field leave the '
      + 'ruled column standing, and the comb takes it as `writable` (the fill frame and the digits '
      + 'follow it); the empty column beside it stays a cell of its own.',
    doc: {
      ink: [
        { ink: 'cellRow', x: 40, y: 201, width: 240, height: 21, columns: 2 },
        { ink: 'combTeeth', x: 160, y: 201, pitch: 120 / 9, cells: 9, toothHeight: 7.5 },
      ],
    },
    expect: { ...none, combs: 1, cells: 1 },
    comb: {
      cells: 9,
      boxed: false,
      writable: { left: near(40), top: near(26), width: near(30), height: near(7) },
    },
  },
  {
    name: 'comb teeth beside a title on the same line',
    why: "FORM-27: form 101's tax year. No cell encloses the teeth, so the title printed beside them, "
      + 'on their line, says how tall the field is: `writable` runs from the title\'s top down to '
      + 'the comb\'s rule.',
    doc: { ink: [{ ink: 'combTeeth', x: 40, y: 200, pitch: 14, cells: 4 }] },
    // A 14pt title 4pt right of the comb (x 100-160, y 197-211), overlapping the 6pt teeth.
    text: [{ str: 'Tax year', left: 25, top: 89 / 3, width: 15, height: 14 / 3 }],
    expect: { ...none, combs: 1 },
    comb: {
      cells: 4,
      boxed: false,
      writable: { left: near(10), top: near(89 / 3), width: near(14), height: near(11 / 3) },
    },
  },
  {
    name: 'comb teeth under a line of text that ends above them',
    why: 'FORM-27: a caption on the line above does not share the teeth\'s line, so it lends no '
      + 'height; the comb keeps no `writable`, as before.',
    doc: { ink: [{ ink: 'combTeeth', x: 40, y: 200, pitch: 14, cells: 4 }] },
    // x 100-160, y 208-222: its bottom is 2pt above the teeth's top (206).
    text: [{ str: 'Tax year', left: 25, top: 26, width: 15, height: 14 / 3 }],
    expect: { ...none, combs: 1 },
    comb: expect.not.objectContaining({ writable: expect.anything() }),
  },
  {
    name: 'a run of closed comb boxes',
    why: 'the same field drawn the other way, and it must come back boxed',
    doc: { ink: [{ ink: 'boxedComb', x: 40, y: 200, pitch: 14, cells: 9, height: 16 }] },
    expect: { ...none, combs: 1 },
    comb: { cells: 9, boxed: true },
  },
  {
    name: 'a painted 12pt square',
    why: 'a drawn checkbox, inside the 4-16pt band',
    doc: { ink: [{ ink: 'paintedRect', ...SQUARE }] },
    expect: { ...none, checkboxes: 1 },
  },
  {
    name: 'a painted 30pt square',
    why: 'the size band has a top: a big square is a panel, not a checkbox',
    doc: { ink: [{ ink: 'paintedRect', x: 40, y: 200, width: 30, height: 30 }] },
    expect: none,
  },
  {
    name: 'a ruled row of three cells',
    why: 'a form row: two rules and four walls, so three closed cells',
    doc: { ink: [{ ink: 'cellRow', x: 40, y: 200, width: 240, height: 20, columns: 3 }] },
    expect: { ...none, cells: 3 },
  },
  {
    name: 'a painted checkbox square inside a printed ruled cell',
    why: 'the painted twin of "a checkbox widget inside a printed ruled cell", and it must read '
      + 'the same: the square once, and the two cells beside it. A painted rect publishes its own '
      + 'top and bottom as horizontal rules (formCells.js\'s horizontalRules(ink, { includeRectSides: '
      + 'true }), from inkEdges.js), so the 20pt band has two rule heights inside it. buildClosedCells '
      + 'scopes rows per column: a cell closes on the nearest '
      + 'rules that cross its own column, so the square\'s rules drop only the cell holding it and '
      + 'the other two close on the row\'s own rules. Before that, adjacent-rule walking cut the '
      + 'whole row into 4/12/4 and it lost all three cells',
    doc: {
      ink: [
        { ink: 'cellRow', x: 40, y: 200, width: 240, height: 20, columns: 3 },
        { ink: 'paintedRect', x: 74, y: 204, width: 12, height: 12 },
      ],
    },
    expect: { ...none, cells: 2, checkboxes: 1 },
  },
  // The three rows below pin MIN_TICK_CELL_WIDTH/MIN_TICK_COLUMN_ROWS (form
  // 101's children table: 6-8pt tick columns that repeat down the page). Text
  // is out of scope here on purpose - a row may declare `text` (README's "Two
  // things to know") when the element it pins is text-plus-geometry, and none
  // of these three are: a tick cell's own geometry is the whole point. So
  // none of these rows can exercise the "a tick cell holding printed text is
  // disqualified" half of the rule; that half is proven in
  // formCells.test.js's `narrow tick columns` block instead.
  {
    name: 'a narrow column repeating down three ruled rows',
    why: 'form 101 rules its children table this way - columns too narrow for a written answer, '
      + 'but the same wall recurring row after row is what makes them tick targets (MOBI-11)',
    doc: {
      ink: [
        { ink: 'cellRow', x: 40, y: 240, width: 24, height: 20, columns: 3 },
        { ink: 'cellRow', x: 40, y: 220, width: 24, height: 20, columns: 3 },
        { ink: 'cellRow', x: 40, y: 200, width: 24, height: 20, columns: 3 },
      ],
    },
    // Surfaced with kind: 'checkbox' inside formCells.js, but the corpus's
    // top-level `checkboxes` count is ink/widget-detected squares only
    // (formGrid.js's detectPageRegions) - everything formCells.js returns,
    // whatever its own `kind`, lands in the `cells` bucket here, the same as
    // in production (useFormFieldRegions.ts pushes it into `found.cells`).
    expect: { ...none, cells: 9 },
  },
  {
    name: 'a narrow column repeated on only two ruled rows',
    why: 'two rows is not a table yet - MIN_TICK_COLUMN_ROWS is 3, and this is the row that '
      + 'stops a future change from calling two of them enough',
    doc: {
      ink: [
        { ink: 'cellRow', x: 40, y: 220, width: 24, height: 20, columns: 3 },
        { ink: 'cellRow', x: 40, y: 200, width: 24, height: 20, columns: 3 },
      ],
    },
    expect: none,
  },
  {
    name: 'a column under the 6pt tick floor, repeated four times',
    why: 'a column narrower than MIN_TICK_CELL_WIDTH never becomes a closed cell at all, so no '
      + 'amount of repetition turns it into a checkbox - the floor is what keeps a dotted leader '
      + "line's stray gaps out, not the column-repeat count",
    doc: {
      ink: [
        { ink: 'cellRow', x: 40, y: 260, width: 15, height: 20, columns: 3 },
        { ink: 'cellRow', x: 40, y: 240, width: 15, height: 20, columns: 3 },
        { ink: 'cellRow', x: 40, y: 220, width: 15, height: 20, columns: 3 },
        { ink: 'cellRow', x: 40, y: 200, width: 15, height: 20, columns: 3 },
      ],
    },
    expect: none,
  },
  {
    name: 'a captioned header row over three identical empty rows',
    why: 'FORM-14: form 101\'s children table prints its column captions ("מספר זהות", "שם") in a '
      + '12.4pt row whose own text reaches its cell\'s midpoint exactly like a labelled field - '
      + '`rightHug` alone cannot tell them apart. What does is the caption\'s own gaps: centred in '
      + 'its cell (leftGap 50pt, rightGap 50pt, ratio 1.0), not hugging a wall, so it reads as a '
      + 'heading and neither cell carves. Dropping it must not cost the three repeating data rows a '
      + 'single cell. Needs its own captions as `text` (README\'s "Two things to know"), since a '
      + 'caption is the whole thing being pinned.',
    doc: {
      ink: [
        { ink: 'cellRow', x: 40, y: 260, width: 240, height: 12.4, columns: 2 },
        { ink: 'cellRow', x: 40, y: 240, width: 240, height: 20, columns: 2 },
        { ink: 'cellRow', x: 40, y: 220, width: 240, height: 20, columns: 2 },
        { ink: 'cellRow', x: 40, y: 200, width: 240, height: 20, columns: 2 },
      ],
    },
    // Page-percent, centred in each header cell with its baseline in the row's lower half
    // (pdf y0=261, row midpoint 266.2) - a side carve is on offer, not a band carve, and
    // HEADER_GAP_RATIO is what turns it down.
    text: [
      { str: 'מספר זהות', left: 22.5, top: 12, width: 5, height: 1 },
      { str: 'שם', left: 52.5, top: 12, width: 5, height: 1 },
    ],
    expect: { ...none, cells: 6 },
  },
  {
    name: 'an RTL heading centred over a single blank row',
    why: 'FORM-14, health\'s own shape: its four false-positive column headings each sit over '
      + 'exactly one blank data row, not a repeating run, so a rule keyed on what repeats below a '
      + 'caption (FORM-13\'s, since removed) could never reach them. The caption here is the same '
      + 'centred position as the row above, just one data row instead of three - what drops it is '
      + 'its own shape, not the run underneath, so a single row is enough.',
    doc: {
      ink: [
        { ink: 'cellRow', x: 40, y: 260, width: 240, height: 12.4, columns: 2 },
        { ink: 'cellRow', x: 40, y: 240, width: 240, height: 20, columns: 2 },
      ],
    },
    text: [
      { str: 'מספר זהות', left: 22.5, top: 12, width: 5, height: 1 },
      { str: 'שם', left: 52.5, top: 12, width: 5, height: 1 },
    ],
    expect: { ...none, cells: 2 },
  },
  {
    name: 'a label hugging its wall over two identically ruled continuation lines',
    why: 'FORM-14: an address block - "כתובת" against the right wall of the first line, two more '
      + 'blank lines ruled the same way under it. leftGap 90pt vs rightGap 2pt, ratio 45 - the '
      + 'caption hugs its wall, so it carves and keeps its field regardless of what repeats below '
      + 'it. Formerly a known gap under FORM-13\'s header rule, which read the run of identical '
      + 'empty rows below and dropped the labelled line as a column heading (5 of 6 cells); FORM-14 '
      + 'removed that rule in favour of reading the caption\'s own shape, which finds all 6.',
    doc: {
      ink: [
        { ink: 'cellRow', x: 40, y: 240, width: 240, height: 20, columns: 2 },
        { ink: 'cellRow', x: 40, y: 220, width: 240, height: 20, columns: 2 },
        { ink: 'cellRow', x: 40, y: 200, width: 240, height: 20, columns: 2 },
      ],
    },
    // Page-percent on the 400x300 default page: x 250-278 against the right cell's wall at 280,
    // pdf y 243-251, in the lower half of its 240-260 line, so a side carve rather than a band.
    text: [{ str: 'כתובת', left: 62.5, top: 16.33, width: 7, height: 2.67 }],
    expect: { ...none, cells: 6 },
  },
  {
    name: 'an English caption hugging its right wall over an empty row',
    why: 'FORM-14: the LTR counterpart to the hugging-wall address block above, translated to '
      + 'English - a "List A" / "List B" pair set against each cell\'s right wall (leftGap 100pt, '
      + 'rightGap 10pt, ratio 10 - well past HEADER_GAP_RATIO\'s own boundary of 3), the same shape '
      + 'a real hugging label takes and, on an RTL caption, would carve and keep. RTL_RE rejects a '
      + 'side carve outright when the caption is not RTL, before HEADER_GAP_RATIO is even asked, so '
      + 'only the blank data row survives.',
    doc: {
      ink: [
        { ink: 'cellRow', x: 40, y: 260, width: 240, height: 12.4, columns: 2 },
        { ink: 'cellRow', x: 40, y: 240, width: 240, height: 20, columns: 2 },
      ],
    },
    // Page-percent on the 400x300 default page: each 120pt cell (x 40-160, 160-280) holds a
    // 10pt caption 10pt off its own right wall - leftGap 100pt vs rightGap 10pt.
    text: [
      { str: 'List A', left: 35, top: 12, width: 2.5, height: 1 },
      { str: 'List B', left: 65, top: 12, width: 2.5, height: 1 },
    ],
    expect: { ...none, cells: 2 },
  },
  // The three rows below pin MIN_FLOOR_RISE_FRACTION and captionBelowFloor directly (FORM-26),
  // on the same shape form 101's private-address row draws: one ruled box, an inner underline
  // near its floor, and short ticks standing on that underline dividing the writing strip above
  // it into columns - never a full-height wall, which is what tells `buildClosedCells` a tick
  // from an ordinary interior divider. All three share one 240x28 box (x 40-280, y 200-228) with
  // an underline 7pt above its floor (y 207, so the writable band above it is 21pt) and two ticks
  // at x 110 and 200, splitting it into three columns of 70/90/80pt.
  {
    name: 'an underline with two ticks rising past the floor-rise floor, captioned below',
    why: 'FORM-26: ticks 7.5pt off a 21pt band (0.357, past MIN_FLOOR_RISE_FRACTION\'s 0.3) split '
      + 'the writing strip into three columns; a caption printed in the strip below the underline, '
      + 'inside each column\'s own x-range, is what `captionBelowFloor` reads as that column\'s '
      + "label - measured, this is 3 one-line text cells, one per column.",
    doc: {
      ink: [
        { ink: 'rect', x: 40, y: 200, width: 240, height: 28 },
        { ink: 'line', x: 40, y: 207, x2: 280, y2: 207 },
        { ink: 'line', x: 110, y: 207, x2: 110, y2: 214.5 },
        { ink: 'line', x: 200, y: 207, x2: 200, y2: 214.5 },
      ],
    },
    // Page-percent, page 400x300: three short captions in the strip between the underline
    // (y 207) and the box's own floor (y 200), each centred in its column's x-range.
    text: [
      { str: 'Street', left: 16.25, top: 31.667, width: 5, height: 1 },
      { str: 'Number', left: 36.25, top: 31.667, width: 5, height: 1 },
      { str: 'City', left: 57.5, top: 31.667, width: 5, height: 1 },
    ],
    expect: { ...none, cells: 3 },
  },
  {
    name: 'the same box with ticks rising only 0.2 of the band',
    why: 'FORM-26: measured - ticks at 4.2pt off the same 21pt band (0.2, short of '
      + "MIN_FLOOR_RISE_FRACTION's 0.3) never qualify as a floor rise, so the band keeps only its "
      + "two outer walls (xs.length 2) and every one of its three stacked bands (top-to-underline, "
      + "underline-to-floor, top-to-floor) is read as a lone undivided box instead. A lone box "
      + "needs a caption above it (SNG-10's `headerAbove`), and every caption here sits below the "
      + 'underline, address-block style, so none qualifies - this is the pre-FORM-26 behaviour, '
      + 'and it publishes nothing at all.',
    doc: {
      ink: [
        { ink: 'rect', x: 40, y: 200, width: 240, height: 28 },
        { ink: 'line', x: 40, y: 207, x2: 280, y2: 207 },
        { ink: 'line', x: 110, y: 207, x2: 110, y2: 211.2 },
        { ink: 'line', x: 200, y: 207, x2: 200, y2: 211.2 },
      ],
    },
    text: [
      { str: 'Street', left: 16.25, top: 31.667, width: 5, height: 1 },
      { str: 'Number', left: 36.25, top: 31.667, width: 5, height: 1 },
      { str: 'City', left: 57.5, top: 31.667, width: 5, height: 1 },
    ],
    expect: none,
  },
  {
    name: 'the same ticked underline with no captions at all',
    why: 'FORM-26: measured - the ticks still pass MIN_FLOOR_RISE_FRACTION and split the band '
      + 'into three floor-ticked columns exactly as the first row above, but `captionBelowFloor` '
      + 'finds nothing under any of them, and a floor-ticked column with no caption below is not a '
      + 'field (README\'s "a column with no caption below is not emitted") - all three are dropped, '
      + 'not published as unlabelled cells.',
    doc: {
      ink: [
        { ink: 'rect', x: 40, y: 200, width: 240, height: 28 },
        { ink: 'line', x: 40, y: 207, x2: 280, y2: 207 },
        { ink: 'line', x: 110, y: 207, x2: 110, y2: 214.5 },
        { ink: 'line', x: 200, y: 207, x2: 200, y2: 214.5 },
      ],
    },
    expect: none,
  },
  {
    name: 'an undivided decorative panel',
    why: 'SNG-10: an empty lone box (no interior wall) with no label printed above it is still a '
      + 'bare frame, not evidence of a field - formCells.js reads a lone box as a field only when '
      + "it is both empty and labelled, and this row carries no text at all, so it has neither.",
    doc: { ink: [{ ink: 'rect', x: 40, y: 100, width: 300, height: 40 }] },
    expect: none,
  },
  {
    name: 'a clipping rectangle',
    why: 're W n paints nothing; counting clips as boxes once invented 76 phantom checkboxes',
    doc: { ink: [{ ink: 'clipRect', ...SQUARE }] },
    expect: none,
  },
  {
    name: 'a blank page',
    why: 'the floor: nothing in, nothing out',
    doc: {},
    expect: none,
  },
];

/** Both sources describing one field, which is what a real fillable form is. */
const HYBRID = [
  {
    name: 'printed guide boxes under a comb widget',
    why: 'the practice form\'s own shape - one field, two sources, and it must be reported once',
    doc: {
      ink: [{ ink: 'boxedComb', x: 40, y: 200, pitch: 14, cells: 9, height: 20 }],
      widgets: [{ widget: 'text', x: 40, y: 200, width: 126, height: 20, comb: 9 }],
    },
    expect: { ...none, combs: 1 },
    comb: { cells: 9, boxed: true },
  },
  {
    name: 'a comb widget over a cell the ink pass called plain text',
    why: 'a comb beats a cell whichever source found it, or one rectangle carries two snap targets',
    doc: {
      ink: [{ ink: 'cellRow', x: 40, y: 200, width: 240, height: 20, columns: 3 }],
      widgets: [{ widget: 'text', x: 40, y: 200, width: 80, height: 20, comb: 9 }],
    },
    expect: { ...none, combs: 1, cells: 2 },
  },
  {
    name: 'a text widget over a printed checkbox',
    why: 'a cell is never offered on top of a checkbox already found',
    doc: {
      ink: [{ ink: 'paintedRect', ...SQUARE }],
      widgets: [{ widget: 'text', ...SQUARE }],
    },
    expect: { ...none, checkboxes: 1 },
  },
  // The row below pins the cell-side claim test: `reconcileFields` drops a
  // printed cell something else has already reported. What it cannot reach is
  // *which rectangle* that question is asked of. Since "Ask the claim question
  // of the cell's printed box, not its writing strip" a cell's bounds are the
  // blank strip and the printed box rides along as `enclosure` - but a cell
  // only carves a strip when it has its own printed text inside it, and this
  // runner passes none (README, "Two things to know"), so every cell here
  // publishes its whole box and carries no `enclosure` at all. The strip half
  // is proven where text exists: formCells.test.js's "the bounds are the
  // writing strip, not the ruled box" block for the carve, fieldRegions.test.js
  // for the claim question asked of the box, and the real-PDF numbers in
  // docs/mobi-10-field-map-spike.md for what either is worth on a page.
  {
    name: 'a checkbox widget inside a printed ruled cell',
    why: 'one rectangle, one region: the cell around a checkbox already reported is not offered '
      + 'as a text field as well, or the middle of the row carries two hints. The two cells of '
      + 'the same row that hold nothing must survive it',
    doc: {
      ink: [{ ink: 'cellRow', x: 40, y: 200, width: 240, height: 20, columns: 3 }],
      widgets: [{ widget: 'checkbox', x: 74, y: 204, width: 12, height: 12 }],
    },
    expect: { ...none, cells: 2, checkboxes: 1 },
  },
  {
    name: 'a widget and printed ink in different places',
    why: 'the sources add up when they are not the same field - the whole reason for two of them',
    doc: {
      ink: [{ ink: 'cellRow', x: 40, y: 80, width: 240, height: 20, columns: 3 }],
      widgets: [{ widget: 'text', ...FIELD }],
    },
    expect: { ...none, cells: 4 },
  },
];

/** The page itself, which both sources have to agree about. */
const PAGE_GEOMETRY = [
  {
    name: 'a rotated page',
    why: '/Rotate turns the percentages with it, through the one transform both sources share',
    doc: { rotation: 90, widgets: [{ widget: 'text', ...FIELD }] },
    expect: { ...none, cells: 1 },
  },
  {
    name: 'a page cropped away from the origin',
    why: 'a percentage is of what is shown, not of the media box',
    doc: { cropBox: [20, 0, 360, 300], widgets: [{ widget: 'text', ...FIELD }] },
    expect: { ...none, cells: 1 },
  },
  {
    name: 'fields on the second page of two',
    why: 'page index is carried, not assumed - a field found on page 2 must not land on page 1',
    doc: {
      pages: [
        { widgets: [{ widget: 'text', ...FIELD }] },
        { widgets: [{ widget: 'text', ...FIELD, comb: 9 }, { widget: 'checkbox', ...SQUARE, y: 100 }] },
      ],
    },
    perPage: [
      { ...none, cells: 1 },
      { ...none, combs: 1, checkboxes: 1 },
    ],
  },
];

/**
 * Known gaps, pinned deliberately.
 *
 * These assert what the detector does today, not what it should do. They are
 * here so that fixing one shows up as a failing row to update rather than as
 * a silent change, and so nobody re-discovers the same limit from scratch.
 * Each names where the evidence lives.
 */
const KNOWN_GAPS = [
  {
    name: 'a checkbox square stroked as a path, not painted with `re`',
    why: 'findCheckboxes reads ink.rects alone, and a path-drawn square never lands there. '
      + 'This is the miss behind "none of the drawn squares" on form 101 '
      + '(docs/mobi-10-field-map-spike.md). Fixing it should flip this row to 1.',
    doc: { ink: [{ ink: 'rect', ...SQUARE }] },
    expect: none,
  },
  {
    name: 'a signature field',
    why: 'collectTextFieldWidgets reads /Tx only, so a real /Sig field is invisible. Signature '
      + 'placement is a different creation mode - a saved-signature dialog, not a point tap '
      + '(MOBI-11) - so this is a scope line, not a bug. Wiring it up should flip this row.',
    doc: { widgets: [{ widget: 'signature', ...FIELD }] },
    expect: none,
  },
];

const tag = (group, cases) => cases.map((entry) => ({ group, ...entry }));

/** @type {Case[]} */
export const ELEMENT_CASES = [
  ...tag('live form', LIVE_FORM),
  ...tag('printed', PRINTED),
  ...tag('hybrid', HYBRID),
  ...tag('page geometry', PAGE_GEOMETRY),
  ...tag('known gap', KNOWN_GAPS),
];

/**
 * Real documents, as counterweight to everything above.
 *
 * A synthetic case proves one rule in isolation; only a file somebody was
 * actually sent proves the rules hold together. These three are the corpus's
 * ground: one live AcroForm (ours) and two flat Hebrew government forms whose
 * recall and precision are scored in `docs/mobi-10-field-map-spike.md`.
 */
export const DOCUMENT_CASES = [
  {
    name: 'the frozen v1 practice form (live AcroForm, 9 fields)',
    file: ['src', 'tools', 'sign', 'fields', '__fixtures__', 'practice-form-v1.pdf'],
    why: 'the corpus\'s only live-AcroForm-widget case, kept as a fixture now that SNG-10 has the home page offer a flat, widget-free v2',
    expect: { combs: 1, cells: 6, checkboxes: 2 },
  },
  {
    name: 'income tax form 101, page 1 (flat)',
    file: ['src', 'tools', 'sign', 'fields', '__fixtures__', 'income-tax-101-page1-geometry.pdf'],
    why: 'a dense flat form - no widgets at all, so the widget pass must be a provable no-op',
    widgetFree: true,
  },
  {
    name: 'health declaration, page 1 (flat)',
    file: ['src', 'tools', 'sign', 'fields', '__fixtures__', 'health-declaration-page1-geometry.pdf'],
    why: 'the other scored form, whose checkboxes are painted rects rather than paths',
    widgetFree: true,
  },
];
