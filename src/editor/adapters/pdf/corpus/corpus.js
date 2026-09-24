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
      + 'top and bottom as horizontal rules (horizontalRulesAll), so the 20pt band has two rule '
      + 'heights inside it. buildClosedCells scopes rows per column: a cell closes on the nearest '
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
    why: 'FORM-13: form 101\'s children table prints its column captions ("מספר זהות", "שם") in a '
      + '12.4pt row whose own text side-carves it exactly like a labelled field - `writableArea` '
      + 'cannot tell them apart. What does is the three identical, empty, ruled rows underneath: '
      + 'only the header\'s two cells are headings, and dropping them must not cost the data rows '
      + 'a single cell. Needs its own captions as `text` (README\'s "Two things to know"), since a '
      + 'caption is the whole thing being pinned.',
    doc: {
      ink: [
        { ink: 'cellRow', x: 40, y: 260, width: 240, height: 12.4, columns: 2 },
        { ink: 'cellRow', x: 40, y: 240, width: 240, height: 20, columns: 2 },
        { ink: 'cellRow', x: 40, y: 220, width: 240, height: 20, columns: 2 },
        { ink: 'cellRow', x: 40, y: 200, width: 240, height: 20, columns: 2 },
      ],
    },
    // Page-percent, hugging each header cell's right wall with its baseline in the row's lower
    // half (pdf y0=261, row midpoint 266.2) - a side carve, not a band carve.
    text: [
      { str: 'מספר זהות', left: 22.5, top: 12, width: 5, height: 1 },
      { str: 'שם', left: 52.5, top: 12, width: 5, height: 1 },
    ],
    expect: { ...none, cells: 6 },
  },
  {
    name: 'a captioned row over one empty row',
    why: 'FORM-13\'s companion: one blank row under a caption is the ordinary label-over-blank '
      + 'shape (MIN_HEADER_RUN is 2, not 1), so both captioned cells are counted here - a change '
      + 'that drops every side-carved caption regardless of what repeats below it goes red on this '
      + 'row instead of only showing up as a lost itc101 point.',
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
    expect: { ...none, cells: 4 },
  },
  {
    name: 'an undivided decorative panel',
    why: 'a row needs an interior wall - a plain box is a frame, not a field',
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
  {
    name: 'a label hugging its wall over two identically ruled continuation lines',
    why: 'an address block: "כתובת" against the right wall of the first line, two more blank lines '
      + 'ruled the same way under it. FORM-13\'s header rule reads the run of identical empty rows '
      + 'below and drops the labelled line as a column heading, so this finds 5 of the 6 cells. No '
      + 'scored form has this shape (independent review, 2026-09-24). What separates it from a '
      + 'heading is where the caption sits - hugging, not centred - which is FORM-14\'s test; '
      + 'combining the two should flip this row to 6.',
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
    expect: { ...none, cells: 5 },
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
    name: 'the practice form (live AcroForm, 9 fields)',
    file: ['public', 'images', 'redaction-guide', 'sample.pdf'],
    why: 'the file the home page offers on a first visit, and the one this corpus was written for',
    expect: { combs: 1, cells: 6, checkboxes: 2 },
  },
  {
    name: 'income tax form 101, page 1 (flat)',
    file: ['src', 'editor', 'adapters', 'pdf', '__fixtures__', 'income-tax-101-page1-geometry.pdf'],
    why: 'a dense flat form - no widgets at all, so the widget pass must be a provable no-op',
    widgetFree: true,
  },
  {
    name: 'health declaration, page 1 (flat)',
    file: ['src', 'editor', 'adapters', 'pdf', '__fixtures__', 'health-declaration-page1-geometry.pdf'],
    why: 'the other scored form, whose checkboxes are painted rects rather than paths',
    widgetFree: true,
  },
];
