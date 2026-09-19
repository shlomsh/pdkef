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
