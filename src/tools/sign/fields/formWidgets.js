import { MAX_COMB_CELLS } from '../../../constants/signGeometry.js';
import { createPageGeometry, toPagePercentBox } from '../../../editor/geometry/coords.ts';
import { pageCropBox } from './pageInk.js';
import { pageWidgets, widgetEntries } from '../../../editor/adapters/pdf/pdfObjects.js';

/**
 * The fields a form states outright, from its own `/Tx` widget annotations.
 *
 * Everything else under `adapters/pdf/` infers a field from ink, because the
 * forms people are usually sent are flat: no `/AcroForm`, the boxes drawn in
 * the page's own content stream, which is what `pageInk.js` reads. A form
 * that is still fillable does not need inferring. Each widget's `/Rect` *is*
 * the field, to the point, and the ink detectors cannot see it at all - its
 * border is painted inside the widget's `/AP /N` appearance stream, a
 * separate object graph the page stream never invokes (`pageInk.js`'s
 * docstring scopes out even Form XObjects reached by `Do`; an annotation
 * appearance is one step further out). Our own practice form is exactly this
 * shape, and so is any form filled once in another app and passed on.
 *
 * The module is in two halves, and the seam is deliberate:
 *
 * - **The decisions are pure functions over plain numbers.** `fillableTextField`
 *   is the whole of the flag arithmetic; `widgetRegions` is the whole of the
 *   classification and the transform. Neither touches a PDF object, so every
 *   edge case is a plain object in a unit test rather than a PDF someone has
 *   to build. This is where the bugs would be, so this is what is testable.
 * - **The pdf-lib half only reads.** `collectTextFieldWidgets` pulls five
 *   values off each widget and hands them over; `detectWidgetRegions` composes
 *   the two. Neither decides anything.
 */

/** Annotation `/F` flags that mean "do not show this on the page" (PDF 32000-1 table 165). */
const ANNOTATION_HIDDEN = 0b10;
const ANNOTATION_NO_VIEW = 0b100000;
/** `/Ff` field flags: read-only is bit 1, comb is bit 25 (PDF 32000-1 tables 221, 228). */
const FIELD_READ_ONLY = 1;
const FIELD_COMB = 1 << 24;

/**
 * What one widget annotation says about itself, as plain values - defined in
 * `pdfObjects.js` (editor), the module that actually produces this shape via
 * `widgetEntries()`; this file only interprets it (ARCH-24 step D).
 * @typedef {import('../../../editor/adapters/pdf/pdfObjects.js').WidgetEntry} WidgetEntry
 */

/** A writable text field, in PDF user space. `combCells` marks a comb run. */
/**
 * @typedef {object} TextFieldWidget
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {number} [combCells]
 */

/** `/Ff` bit 17: a push button, which holds no value and cannot be ticked. */
const FIELD_PUSH_BUTTON = 1 << 16;

/**
 * The part of the decision that has nothing to do with what kind of field it
 * is: can a person see this, and can they put anything in it - pure.
 *
 * Hidden, no-view and read-only are each skipped because none of the three is
 * a place anyone can write, so offering one as a target would aim a tap at a
 * field that is not there. A degenerate `/Rect` is skipped for the same
 * reason; pdf-lib's `asRectangle` already normalizes a rectangle written
 * corner-swapped, so a zero here means zero, not a sign error.
 *
 * Shared by both field kinds on purpose. It was written for `/Tx` first and
 * `/Btn` went on being read straight off `/Annots` with none of these checks,
 * so a hidden checkbox stayed a mark target - the two paths now answer the
 * visibility question in one place, and a corpus row pins each flag for each
 * kind.
 *
 * @param {WidgetEntry} entry
 * @returns {{x: number, y: number, width: number, height: number} | null}
 */
export function visibleWritableRect(entry) {
  if ((entry.annotationFlags ?? 0) & (ANNOTATION_HIDDEN | ANNOTATION_NO_VIEW)) return null;
  if ((entry.fieldFlags ?? 0) & FIELD_READ_ONLY) return null;
  const { rect } = entry;
  if (!(rect?.width > 0) || !(rect?.height > 0)) return null;
  const { x, y, width, height } = rect;
  return { x, y, width, height };
}

/**
 * Decides whether one widget is a checkbox or radio worth marking - pure.
 *
 * `/Btn` covers push buttons too, and those are not mark targets: a push
 * button has no on state to toggle, so a checkmark over a Submit or Print
 * control aims a tap at something that cannot hold it.
 *
 * Radio options are not grouped here. Each option is its own widget with its
 * own `/Rect`, and each is separately markable, which is what the editor
 * needs; grouping a row of them into one question is a review-surface idea
 * (MOBI-11), not a geometry one.
 *
 * @param {WidgetEntry} entry
 * @returns {{x: number, y: number, width: number, height: number} | null}
 */
export function markableButtonField(entry) {
  if (entry.fieldType !== '/Btn') return null;
  if ((entry.fieldFlags ?? 0) & FIELD_PUSH_BUTTON) return null;
  return visibleWritableRect(entry);
}

/**
 * Decides whether one widget is a text field somebody can write in - pure.
 *
 * Hidden, no-view and read-only are each skipped because none of the three is
 * a place anyone can write, so offering one as a snap target would aim a tap
 * at a field that is not there. A degenerate `/Rect` is skipped for the same
 * reason; pdf-lib's `asRectangle` already normalizes a rectangle written
 * corner-swapped, so a zero here means zero, not a sign error.
 *
 * `combCells` is the `/MaxLen` of a widget whose comb flag is set: a run of
 * that many equal boxes, which is what a comb region means everywhere else.
 * `/MaxLen` 1 is a single box, not a run, and the flag without a `/MaxLen` is
 * meaningless - the spec makes the two inseparable - so both fall through to
 * an ordinary field rather than a comb of nothing.
 *
 * @param {WidgetEntry} entry
 * @returns {TextFieldWidget | null} null when the widget is not one to offer.
 */
export function fillableTextField(entry) {
  if (entry.fieldType !== '/Tx') return null;
  const rect = visibleWritableRect(entry);
  if (!rect) return null;
  const isComb = Boolean((entry.fieldFlags ?? 0) & FIELD_COMB) && entry.maxLen > 1;
  return isComb ? { ...rect, combCells: entry.maxLen } : rect;
}

/**
 * Turns text-field widgets into editor regions - pure.
 *
 * A comb widget becomes a `boxed` comb: its cells are the widget's own equal
 * divisions of `/Rect`, not teeth guessed off a printed rule, so there is no
 * enclosing cell for `reconcileFields` to go looking for. A run longer than
 * the editor can draw (`MAX_COMB_CELLS`) is kept as an ordinary field rather
 * than dropped - the field is still real and still worth offering, it just
 * cannot be offered as a comb.
 *
 * The geometry is the caller's, and is the same `PageGeometry` the ink
 * detectors use, so page rotation and a cropped page are handled by the one
 * transform rather than by a second copy of it here. `/Rect` is in default
 * user space, the same space the ink walk reports in once it has composed the
 * CTM, so both sources arrive comparable.
 *
 * @param {TextFieldWidget[]} fields
 * @param {import('../../../editor/geometry/coords.ts').PageGeometry} geometry
 * @param {number} pageIndex
 * @returns {{combs: Array, cells: Array}} in the editor's page percentages
 */
export function widgetRegions(fields, geometry, pageIndex = 0) {
  const combs = [];
  const cells = [];
  for (const field of fields) {
    const box = toPagePercentBox(geometry, {
      x0: field.x, y0: field.y, x1: field.x + field.width, y1: field.y + field.height,
    });
    if (field.combCells && field.combCells <= MAX_COMB_CELLS) {
      combs.push({ kind: 'comb', pageIndex, cells: field.combCells, boxed: true, ...box });
    } else {
      cells.push({ kind: 'text', pageIndex, ...box });
    }
  }
  return { combs, cells };
}

/**
 * Reads the page's text-field widgets. On-device and read-only: the
 * annotation tree is walked, never modified.
 *
 * @param {import('@cantoo/pdf-lib').PDFPage} page
 * @returns {TextFieldWidget[]} in PDF user space
 */
export function collectTextFieldWidgets(page) {
  return collectWidgets(page, fillableTextField);
}

/**
 * Reads the page's checkbox and radio widgets, as `formGrid.js`'s checkbox
 * detector takes them: plain PDF user-space rectangles.
 *
 * This lived in `pdfObjects.js` and skipped none of the visibility checks
 * above, which is the whole reason it moved here.
 *
 * @param {import('@cantoo/pdf-lib').PDFPage} page
 * @returns {Array<{x: number, y: number, width: number, height: number}>}
 */
export function collectCheckboxWidgets(page) {
  return collectWidgets(page, markableButtonField);
}

/** Every widget on the page that `decide` accepts. */
function collectWidgets(page, decide) {
  return pageWidgets(page)
    .map((widget) => decide(widgetEntries(page.doc.context, widget)))
    .filter((field) => field !== null);
}

/**
 * The page's text-field widgets as editor regions.
 *
 * @param {import('@cantoo/pdf-lib').PDFPage} page
 * @param {number} pageIndex
 * @returns {{combs: Array, cells: Array}} in the editor's page percentages
 */
export function detectWidgetRegions(page, pageIndex = 0) {
  const geometry = createPageGeometry({
    cropBox: pageCropBox(page),
    rotation: page.getRotation().angle,
  });
  return widgetRegions(collectTextFieldWidgets(page), geometry, pageIndex);
}
