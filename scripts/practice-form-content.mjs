/**
 * Source of truth for the app's own practice form (SNG-10 v2): every string, the palette, the
 * chosen page size, and the LAYOUT - every writable field's kind and rect, in one place.
 *
 * `scripts/generate-practice-form.mjs` imports this module twice over: once to draw the page
 * (`@cantoo/pdf-lib` calls, positioning arithmetic) and once to derive the scored corpus's ground
 * truth (`src/tools/sign/fields/corpus/scoring/ground-truth/practice-form-page1.json`), so a field
 * moved here moves in both places at once and can never quietly drift out of sync with what the
 * page actually draws. `src/site-lib/FileDropzone.tsx` fetches the rendered PDF as "PDkef practice
 * form.pdf", the try-it sample that opens Sign from the home page.
 *
 * v2 is a flat vector form: no `/AcroForm`, no widgets, every box and comb cell is drawn ink the
 * detector has to read off the page's own content stream, the same as a real form someone receives
 * (`src/tools/sign/fields/pageInk.js`, `formGrid.js`, `formCells.js`). It replaces v1, a field-trip
 * permission slip built as an interactive AcroForm and now frozen at
 * `src/tools/sign/fields/__fixtures__/practice-form-v1.pdf` for the tests that still need its exact
 * geometry.
 *
 * Dependency-free by design so a plain Node script can import it directly.
 */

/** Page size in points, [width, height]. A4 portrait. */
export const PAGE_SIZE = [595, 842];

export const DOCUMENT_META = {
  title: 'PDkef practice form - fictional employee details form',
  author: 'PDkef',
  subject: 'A blank practice form for Sign & Fill',
  keywords: ['PDkef', 'practice', 'employee details', 'sample form'],
};

/** RGB triples (0-1 range), matching `rgb(r, g, b)` from `@cantoo/pdf-lib`. Reused from v1: a
 * restrained teal/ink palette, no loud colours. */
export const PALETTE = {
  ink: [0.12, 0.25, 0.29],
  muted: [0.32, 0.45, 0.50],
  teal: [0.17, 0.48, 0.56],
  rule: [0.72, 0.81, 0.84],
  soft: [0.93, 0.97, 0.97],
  field: [0.98, 0.995, 0.995],
  white: [1, 1, 1],
};

export const HEADER = {
  eyebrow: 'PDKEF PRACTICE FORM',
  title: 'PERSONAL AND EMPLOYMENT DETAILS',
};

/** Section headings, top-down y of the heading's own baseline area. */
export const SECTIONS = [
  { id: 'personal', heading: '1. Personal details', y: 110 },
  { id: 'employment', heading: '2. Employment', y: 362 },
  { id: 'declaration', heading: '3. Declaration', y: 540 },
];

/** The declaration paragraph, pre-wrapped to two short lines (width stays under 420pt at 9.5pt). It
 * deliberately never says "signature", "sign" or "date" - those words belong to the two fields
 * below it, not to the paragraph introducing them. */
export const DECLARATION_TEXT = [
  'I declare that the details on this form are true and complete, and that I',
  'will tell my employer in writing if any of them change.',
];

export const FOOTER = {
  disclaimer: 'Fictional form. No real personal data.',
  pageNumber: '1 / 1',
};

/** Every text/date box and comb cell shares this height (PDF points). */
const FIELD_HEIGHT = 22;
/** Comb cells are square-ish, contiguous, this wide each. */
const COMB_CELL_WIDTH = 20;

/**
 * Every writable field, in on-page order. A regular field carries `rect` (top-down: `y` is the
 * distance from the page's own top edge to the field's own top edge). A line field (`signature`,
 * `signature_date`) carries `line` instead - see `lineWritableRect` below for how its rect is
 * derived from it.
 */
export const FIELDS = [
  { id: 'full_name', kind: 'text', label: 'Full name', rect: { x: 48, y: 136, width: 272, height: FIELD_HEIGHT } },
  {
    id: 'id_number', kind: 'comb', label: 'ID number',
    rect: { x: 48, y: 180, width: COMB_CELL_WIDTH * 9, height: FIELD_HEIGHT }, cells: 9,
  },
  { id: 'date_of_birth', kind: 'date', label: 'Date of birth', rect: { x: 48, y: 224, width: 136, height: FIELD_HEIGHT } },
  { id: 'phone', kind: 'text', label: 'Phone', rect: { x: 200, y: 224, width: 180, height: FIELD_HEIGHT } },
  { id: 'street_address', kind: 'text', label: 'Street address', rect: { x: 48, y: 268, width: 452, height: FIELD_HEIGHT } },
  { id: 'city', kind: 'text', label: 'City', rect: { x: 48, y: 312, width: 204, height: FIELD_HEIGHT } },
  {
    id: 'postal_code', kind: 'comb', label: 'Postal code',
    rect: { x: 268, y: 312, width: COMB_CELL_WIDTH * 7, height: FIELD_HEIGHT }, cells: 7,
  },
  { id: 'employer', kind: 'text', label: 'Employer', rect: { x: 48, y: 388, width: 272, height: FIELD_HEIGHT } },
  { id: 'start_date', kind: 'date', label: 'Start date', rect: { x: 48, y: 432, width: 136, height: FIELD_HEIGHT } },
  { id: 'has_other_job', kind: 'checkbox', label: 'I have another job', rect: { x: 48, y: 470, width: 12, height: 12 } },
  { id: 'receives_pension', kind: 'checkbox', label: 'I receive a pension', rect: { x: 48, y: 494, width: 12, height: 12 } },
  { id: 'signature', kind: 'signature', label: 'Signature', line: { x0: 48, x1: 300, y: 640 } },
  { id: 'signature_date', kind: 'date', label: 'Date', line: { x0: 336, x1: 472, y: 640 } },
];

/** A line field's own writable rect, in the same top-down `{x, y, width, height}` shape a boxed
 * field's `rect` uses: the strip a person writes in sits ABOVE the line, one field-height tall,
 * spanning the line's own length. There is no drawn box for a line field - the rule itself, plus
 * this convention, is the whole field. */
export function lineWritableRect(line) {
  return { x: line.x0, y: line.y - FIELD_HEIGHT, width: line.x1 - line.x0, height: FIELD_HEIGHT };
}

/**
 * Every writable field, normalized to `{ id, kind, label, rect }` - the one shape both the
 * generator (drawing) and the truth builder (scoring ground truth) read. A boxed field's `rect` is
 * its own; a line field's is derived through `lineWritableRect`.
 */
export function fieldLayout() {
  return FIELDS.map(({ id, kind, label, rect, line }) => ({
    id, kind, label, rect: rect ?? lineWritableRect(line),
  }));
}
