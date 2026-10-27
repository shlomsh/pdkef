// @ts-check
import {
  PDFName,
  PDFArray,
  PDFDict,
  decodePDFRawStream,
} from '@cantoo/pdf-lib';
import { multiplyMatrix } from './contentStream.js';
import { lookupDict, numberOf, nameOf } from './dictReads.js';
import { ContentStreamDecodeError, getPageContentBytes } from './pageContent.js';
import { walkContentStream } from './contentStreamWalk.js';
import { closedMark } from './pdkefMark.js';
import { collectCheckboxGlyphs } from './checkboxGlyphs.js';
import { reportError } from '../../../lib/errorReport.ts';

// The public surface of this module stays here; the pieces live in sibling modules (ARCH-55).
export { ContentStreamDecodeError, getPageContentBytes, collectCheckboxGlyphs };

/**
 * Finds the discrete drawing operations on a page and where they live in its
 * content stream, so a single one can be deleted without disturbing the rest.
 *
 * Two kinds are reported, and only these two, because they are the ones a PDF
 * genuinely stores as self-contained units:
 *   - `image`: one `cm ... /Name Do` placement of an image XObject, carrying
 *     `imageRef` ("12 0 R") so the same picture drawn on several pages can be
 *     recognised as one object. Inline images are not reported.
 *   - `text`:  one show-text operation (`Tj`, `TJ`, `'` or `"`) and its operands
 *     (RED-54). Carries `replacement`, the advance-only `TJ` that stands in for
 *     it when deleted so what follows in the text object keeps its position.
 *
 * A `BT`/`ET` block is whatever the producing tool chose to emit, and a form
 * can draw a whole table in one, so it is not the unit. Blocks are reported
 * separately as `blocks`, only so a deletion saved when the block was the
 * unit still matches. A vertical-writing font keeps the whole block as its unit.
 */

/**
 * @typedef {import('./contentStream.js').Matrix} Matrix
 * @typedef {import('./contentStreamWalk.js').PageObject} PageObject
 * @typedef {import('./contentStreamWalk.js').TextBlock} TextBlock
 */

/** @type {Matrix} */
const IDENTITY = [1, 0, 0, 1, 0, 0];

/**
 * Cheaply reports whether a document carries an AcroForm with at least one
 * field, for the MOBI-02 export-flatten decision in sign.js.
 *
 * This deliberately goes through `pdfDoc.catalog.getAcroForm()` - a plain
 * dict lookup - rather than `pdfDoc.getForm()`. `getForm()` strips a
 * document's XFA data as a side effect unless it was loaded with
 * `preserveXFA`, so merely *checking* whether a form exists must not itself
 * be the thing that degrades a hybrid XFA/AcroForm document. This check is
 * also the fast path for the common case of no form at all (both fixtures
 * in `__fixtures__/` have none, per MOBI-03): no widget resolution, no
 * appearance-stream work, just one dict read.
 *
 * @param {import('@cantoo/pdf-lib').PDFDocument} pdfDoc
 * @returns {boolean}
 * @testSeam
 */
export function hasFillableAcroForm(pdfDoc) {
  const acroForm = pdfDoc.catalog.getAcroForm();
  if (!acroForm) return false;
  return (acroForm.getFields()?.length ?? 0) > 0;
}

/**
 * A field entry as the widget sees it: its own, or the nearest ancestor's.
 *
 * Field attributes are inheritable, and a writer is free to put them anywhere
 * on the chain. `@cantoo/pdf-lib` writes a widget as a child of its field
 * dict rather than merging the two, so on a form it generated `/FT`, `/Ff`,
 * `/T` and `/MaxLen` all sit on the parent and the widget dict carries only
 * `/Rect`, `/F` and `/AP` - reading the widget alone finds nothing at all.
 *
 * @param {import('@cantoo/pdf-lib').PDFContext} context
 * @param {import('@cantoo/pdf-lib').PDFObject | undefined} widget
 * @param {string} key
 * @returns {import('@cantoo/pdf-lib').PDFObject | undefined}
 * @testSeam
 */
export function inheritedEntry(context, widget, key) {
  let field = widget;
  /** @type {Set<unknown>} */
  const seen = new Set();
  while (field instanceof PDFDict && !seen.has(field)) {
    seen.add(field);
    const entry = context.lookup(field.get(PDFName.of(key)));
    if (entry !== undefined) return entry;
    field = context.lookup(field.get(PDFName.of('Parent')));
  }
  return undefined;
}


/** Every `/Widget` annotation on the page, in annotation order.
 * @param {import('@cantoo/pdf-lib').PDFPage} page
 * @returns {import('@cantoo/pdf-lib').PDFDict[]}
 */
export function pageWidgets(page) {
  const context = page.doc.context;
  const annotations = context.lookup(page.node.get(PDFName.of('Annots')));
  if (!(annotations instanceof PDFArray)) return [];
  /** @type {import('@cantoo/pdf-lib').PDFDict[]} */
  const widgets = [];
  for (let index = 0; index < annotations.size(); index += 1) {
    const widget = context.lookup(annotations.get(index));
    if (!(widget instanceof PDFDict)) continue;
    if (nameOf(context.lookup(widget.get(PDFName.of('Subtype')))) !== '/Widget') continue;
    widgets.push(widget);
  }
  return widgets;
}

/**
 * What one widget annotation says about itself, as plain values - the shape
 * `formWidgets.js` (tool:sign) decides on. Defined here, not there: this is
 * the module that actually produces it, and an editor module may not import
 * a tool's type even for documentation only (ARCH-24 step D moved
 * `formWidgets.js` out of editor/adapters/pdf/; `formWidgets.js` now points
 * back at this typedef instead of the other way around).
 *
 * `fieldType`, `fieldFlags` and `maxLen` are *inheritable* field attributes
 * and may come from an ancestor rather than the widget (see `widgetEntries`);
 * `annotationFlags` and `rect` are the widget's own and are never inherited.
 *
 * @typedef {object} WidgetEntry
 * @property {string} [fieldType] `/FT`, as pdf-lib renders a name: `'/Tx'`.
 * @property {number} [annotationFlags] `/F`.
 * @property {number} [fieldFlags] `/Ff`.
 * @property {number} [maxLen] `/MaxLen`.
 * @property {{x: number, y: number, width: number, height: number}} [rect] `/Rect`, normalized.
 */

/**
 * The five entries a widget states about itself, as plain values, for
 * `formWidgets.js` to decide on.
 *
 * `/FT`, `/Ff` and `/MaxLen` are inheritable and go through `inheritedEntry`;
 * `/F` and `/Rect` are the widget's own and are read straight off it. This
 * reads, it does not judge - which widget is worth offering is a pure
 * decision made on the result.
 *
 * @param {import('@cantoo/pdf-lib').PDFContext} context
 * @param {import('@cantoo/pdf-lib').PDFDict} widget
 * @returns {WidgetEntry}
 */
export function widgetEntries(context, widget) {
  return {
    fieldType: nameOf(inheritedEntry(context, widget, 'FT')),
    annotationFlags: numberOf(context.lookup(widget.get(PDFName.of('F')))),
    fieldFlags: numberOf(inheritedEntry(context, widget, 'Ff')),
    maxLen: numberOf(inheritedEntry(context, widget, 'MaxLen')),
    rect: rectOf(context.lookup(widget.get(PDFName.of('Rect')))),
  };
}

/** The normalized rectangle an array object has, undefined when it has none.
 * @param {import('@cantoo/pdf-lib').PDFObject | undefined} object
 * @returns {WidgetEntry['rect']}
 */
function rectOf(object) {
  return /** @type {{ asRectangle?: () => WidgetEntry['rect'] } | undefined} */ (object)?.asRectangle?.();
}

/** Form XObjects nested inside one another are followed this deep, no further. */
const MAX_FORM_DEPTH = 8;

/** A Form XObject's `/Matrix` as six numbers, identity when absent or malformed.
 * @param {import('@cantoo/pdf-lib').PDFContext} context
 * @param {import('@cantoo/pdf-lib').PDFStream} stream
 * @returns {Matrix}
 */
function formMatrix(context, stream) {
  const array = context.lookup(stream.dict.get(PDFName.of('Matrix')));
  if (!(array instanceof PDFArray) || array.size() !== 6) return IDENTITY;
  /** @type {Array<number | undefined>} */
  const values = [];
  for (let i = 0; i < 6; i += 1) values.push(numberOf(context.lookup(array.get(i))));
  return values.every((v) => v !== undefined && Number.isFinite(v)) ? /** @type {Matrix} */ (values) : IDENTITY;
}

/**
 * Reports every deletable drawing operation on a page, including those the
 * page draws inside Form XObjects (RED-29).
 *
 * Every object carries `formPath`: the `PDFRef` tags ("12 0 R") of the Forms
 * from the page's content down to the stream that holds it, outermost first.
 * `[]` is the page's own content. `start`/`end` are byte offsets into the
 * decoded content of that holding stream (the page's concatenated content
 * for `[]`, else the last Form in `formPath`), and `rect`/`bbox` are always
 * in page space: the page CTM at the `Do`, times the Form's `/Matrix`, times
 * the Form's own `q`/`cm`/`Q` state.
 *
 * A Form drawn more than once on the page is reported for its first `Do`
 * only: a delete rewrites the Form's stream, which would remove every draw,
 * so offering the later ones would promise a deletion that is not local.
 *
 * @param {import('@cantoo/pdf-lib').PDFPage} page
 * @param {number} pageIndex
 * @returns {{objects: PageObject[], bytes: Uint8Array, blocks: TextBlock[]}} `blocks` are the
 *   `BT ... ET` spans (`start`, `end`, `formPath`, `bbox`), not offered as units
 */
export function extractPageObjects(page, pageIndex = 0) {
  const context = page.doc.context;
  const bytes = getPageContentBytes(page);
  const resources = lookupDict(context, page.node.get(PDFName.of('Resources')));
  // Read before the walk, as it always was: a page whose size read throws stops here.
  const pageSize = page.getSize();
  /** @type {PageObject[]} */
  const objects = [];
  /** @type {TextBlock[]} */
  const blocks = [];
  // Forms already walked on this page. Also the cycle guard: a Form that
  // (indirectly) draws itself finds itself here and stops.
  const walkedForms = new Set();
  // The `/PDkef` mark being read (RED-55), shared with nested Forms.
  const mark = closedMark();
  const env = { context, pageIndex, objects, blocks, mark, walkForm };

  walkContentStream(bytes, resources, IDENTITY, [], env);
  assignIdsAndRects(objects, pageIndex, pageSize);

  return { objects, bytes, blocks };

  /**
   * Walks a Form XObject in place. A Form that cannot be read or lexed
   * contributes nothing; it never costs the page its other objects.
   *
   * @param {{ ref: import('@cantoo/pdf-lib').PDFRef, stream: import('@cantoo/pdf-lib').PDFStream }} form
   * @param {import('@cantoo/pdf-lib').PDFDict | undefined} parentResources
   * @param {Matrix} ctmAtDo
   * @param {string[]} parentPath
   */
  function walkForm({ ref, stream }, parentResources, ctmAtDo, parentPath) {
    if (parentPath.length >= MAX_FORM_DEPTH || walkedForms.has(ref.tag)) return;
    walkedForms.add(ref.tag);
    const before = objects.length;
    try {
      const ownResources = lookupDict(context, stream.dict.get(PDFName.of('Resources')));
      /** @type {Uint8Array} */
      let bytes;
      try {
        bytes = decodePDFRawStream(/** @type {import('@cantoo/pdf-lib').PDFRawStream} */ (stream)).decode();
      } catch (decodeErr) {
        throw new ContentStreamDecodeError(decodeErr);
      }
      walkContentStream(
        bytes,
        ownResources ?? parentResources,
        multiplyMatrix(formMatrix(context, stream), ctmAtDo),
        [...parentPath, ref.tag],
        env,
      );
    } catch (err) {
      objects.length = before;
      // expected: the form's own stream is damaged in the person's file, like a page stream that will not decode
      if (err instanceof ContentStreamDecodeError) return;
      reportError('redact', err, 'walk_form_stream');
      console.error(`Could not read Form XObject ${ref.tag} on page ${pageIndex + 1}`, err);
    }
  }
}

/**
 * Adds an id and page-relative percentages with a top-left origin, matching how the editor stores
 * every other element so the UI needs no second convention.
 *
 * @param {PageObject[]} objects
 * @param {number} pageIndex
 * @param {{ width: number, height: number }} pageSize
 */
function assignIdsAndRects(objects, pageIndex, { width: pageWidth, height: pageHeight }) {
  for (const [index, object] of objects.entries()) {
    const owner = object.formPath.length
      ? `${object.formPath.map((tag) => tag.replace(/ /g, '_')).join('>')}-`
      : '';
    object.id = `obj-${pageIndex}-${owner}${index}`;
    object.rect = {
      left: (object.bbox.x / pageWidth) * 100,
      top: ((pageHeight - object.bbox.y - object.bbox.height) / pageHeight) * 100,
      width: (object.bbox.width / pageWidth) * 100,
      height: (object.bbox.height / pageHeight) * 100,
    };
  }
}
