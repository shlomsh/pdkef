import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFStream,
  concatTransformationMatrix,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
} from '@cantoo/pdf-lib';
import { getPdfjs } from './pdfjsLoader.js';
import { PDFJS_WASM_URL } from '../../../lib/pdfjsWasm.js';
import { buildImageOnlyPage, rasterizePageToJpeg } from './rasterPage.js';

/**
 * Thrown when a source PDF's annotations or form fields cannot all be baked
 * into their pages (MOBI-02, SEO-21). Flattening replaces each annotation with
 * its drawn appearance, so a document where any one of them cannot be drawn
 * must fail whole rather than download with that content silently missing or
 * left as a live, empty field. `cause` is an Error or a plain description.
 */
export class FormFlattenError extends Error {
  constructor(cause) {
    super(`Could not flatten the source PDF's form fields: ${cause?.message ?? cause}`);
    this.name = 'FormFlattenError';
    this.cause = cause;
  }
}

const FLAG_HIDDEN = 1 << 1; // PDF 32000-1 table 165, bit 2
const FLAG_NO_VIEW = 1 << 5; // bit 6
const NOT_APPEARANCES = new Set(['Popup', 'Link']);

const name = (key) => PDFName.of(key);

function numbers(context, array, length) {
  const resolved = context.lookup(array);
  if (!(resolved instanceof PDFArray) || resolved.size() < length) return undefined;
  const values = Array.from({ length }, (_, i) => context.lookup(resolved.get(i))?.asNumber?.());
  return values.every(Number.isFinite) ? values : undefined;
}

const boundsOf = (points) => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

/**
 * PDF 32000-1 12.5.5: the appearance /Matrix is applied to the /BBox corners,
 * and the bounding box of the result is scaled and translated onto /Rect.
 * Returns the matrix to concatenate before `Do` (which itself applies /Matrix
 * and clips to /BBox), or undefined when the geometry is unusable.
 */
export function appearanceToRectMatrix(bbox, matrix, rect) {
  if (!bbox || !rect) return undefined;
  const [x0, y0, x1, y1] = bbox;
  const [m0, m1, m2, m3, m4, m5] = matrix;
  const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
    .map(([x, y]) => [m0 * x + m2 * y + m4, m1 * x + m3 * y + m5]);
  const [bx0, by0, bx1, by1] = boundsOf(corners);
  const [rx0, ry0, rx1, ry1] = boundsOf([[rect[0], rect[1]], [rect[2], rect[3]]]);
  const sx = bx1 - bx0 > 0 ? (rx1 - rx0) / (bx1 - bx0) : 1;
  const sy = by1 - by0 > 0 ? (ry1 - ry0) / (by1 - by0) : 1;
  return [sx, 0, 0, sy, rx0 - bx0 * sx, ry0 - by0 * sy];
}

/** The normal-appearance stream ref for an annotation, resolving /AS for state dictionaries. */
function normalAppearanceRef(context, annot) {
  const ap = context.lookup(annot.get(name('AP')));
  const normal = ap instanceof PDFDict ? ap.get(name('N')) : undefined;
  const resolved = context.lookup(normal);
  if (resolved instanceof PDFStream) return normal instanceof PDFRef ? normal : undefined;
  if (!(resolved instanceof PDFDict)) return undefined;
  const state = context.lookup(annot.get(name('AS')));
  const entry = state instanceof PDFName ? resolved.get(state) : undefined;
  return entry instanceof PDFRef ? entry : undefined;
}

/** A checkbox or radio whose current state has no appearance entry draws nothing; that is correct, not a failure. */
function isBlankState(context, annot) {
  const ap = context.lookup(annot.get(name('AP')));
  const normal = ap instanceof PDFDict ? context.lookup(ap.get(name('N'))) : undefined;
  return normal instanceof PDFDict && !(normal instanceof PDFStream);
}

const hasAppearance = (context, annot) => Boolean(normalAppearanceRef(context, annot)) || isBlankState(context, annot);

/** The field type (/FT), inherited through /Parent. */
function fieldType(context, annot) {
  const seen = new Set();
  for (let node = annot; node instanceof PDFDict && !seen.has(node); node = context.lookup(node.get(name('Parent')))) {
    seen.add(node);
    const ft = context.lookup(node.get(name('FT')));
    if (ft instanceof PDFName) return ft.decodeText();
  }
  return undefined;
}

function describe(context, page, annotRef) {
  const annot = context.lookup(annotRef);
  if (!(annot instanceof PDFDict)) return undefined;
  const subtype = context.lookup(annot.get(name('Subtype')));
  const kind = subtype instanceof PDFName ? subtype.decodeText() : '';
  if (NOT_APPEARANCES.has(kind)) return undefined;
  const flags = context.lookup(annot.get(name('F')));
  const f = flags instanceof PDFNumber ? flags.asNumber() : 0;
  const widget = kind === 'Widget';
  const hidden = (f & (FLAG_HIDDEN | FLAG_NO_VIEW)) !== 0;
  return { annot, annotRef, page, widget, hidden };
}

function plan(context, entry) {
  const { annot, widget } = entry;
  const appearanceRef = normalAppearanceRef(context, annot);
  if (!appearanceRef) {
    // A blank signature field almost never has an appearance and is not a failure.
    if (entry.hidden || (widget && (isBlankState(context, annot) || fieldType(context, annot) === 'Sig'))) {
      return { ...entry, blank: true };
    }
    // A widget with no appearance would vanish on removal; a non-widget is left as it is.
    return widget ? { ...entry, failed: true } : { ...entry, skip: true };
  }
  if (entry.hidden) return { ...entry, blank: true };
  const stream = context.lookup(appearanceRef);
  const bbox = numbers(context, stream.dict.get(name('BBox')), 4);
  const matrix = numbers(context, stream.dict.get(name('Matrix')), 6) ?? [1, 0, 0, 1, 0, 0];
  const rect = numbers(context, annot.get(name('Rect')), 4);
  const placement = appearanceToRectMatrix(bbox, matrix, rect);
  return placement ? { ...entry, appearanceRef, placement } : { ...entry, failed: true };
}

const hasWidgetIn = (context, field, removed, seen = new Set()) => {
  const dict = context.lookup(field);
  if (!(dict instanceof PDFDict) || seen.has(dict)) return false;
  seen.add(dict);
  if (removed.has(dict)) return true;
  const kids = context.lookup(dict.get(name('Kids')));
  return kids instanceof PDFArray
    && Array.from({ length: kids.size() }, (_, i) => kids.get(i)).some((kid) => hasWidgetIn(context, kid, removed, seen));
};

function removeFields(pdfDoc, removedWidgets) {
  const { context } = pdfDoc;
  const acroForm = pdfDoc.catalog.getAcroForm();
  const fields = acroForm && context.lookup(acroForm.dict.get(name('Fields')));
  if (!(fields instanceof PDFArray) || removedWidgets.size === 0) return;
  for (let i = fields.size() - 1; i >= 0; i -= 1) {
    if (hasWidgetIn(context, fields.get(i), removedWidgets)) fields.remove(i);
  }
}

/**
 * Bakes every visible annotation's normal appearance into its page and removes
 * the annotation, plus the form field for a widget (keep-text mode: text stays
 * text, nothing is rasterised). Own loop rather than pdf-lib's `form.flatten()`,
 * which handles widgets only, swallows per-widget failures and ignores the
 * appearance /Matrix and /BBox (SEO-21). All planning happens before the first
 * mutation: any annotation that has an appearance and cannot be drawn throws
 * FormFlattenError, never a partial document. Returns whether anything changed.
 *
 * Content is appended to each page, so call this before drawing your own
 * content if it must sit on top. Drawing is in raw user space, where /Rect
 * lives, so page /Rotate and a shifted crop box need no special handling.
 *
 * @param {import('@cantoo/pdf-lib').PDFDocument} pdfDoc
 * @returns {boolean}
 */
export function flattenDoc(pdfDoc) {
  const { context } = pdfDoc;
  const collect = () => pdfDoc.getPages().flatMap((page) => {
    const annots = page.node.Annots();
    return Array.from({ length: annots?.size() ?? 0 }, (_, i) => describe(context, page, annots.get(i))).filter(Boolean);
  });
  let entries = collect();
  // Programmatically filled forms can have values but no appearances; pdf-lib's
  // form.flatten() used to regenerate them first, so do the same, and only when
  // needed (getForm() strips XFA).
  if (pdfDoc.catalog.getAcroForm()
    && entries.some((e) => e.widget && !e.hidden && !hasAppearance(context, e.annot))) {
    try {
      pdfDoc.getForm().updateFieldAppearances();
    } catch (error) {
      throw new FormFlattenError(error);
    }
    entries = collect();
  }
  const planned = entries.map((entry) => plan(context, entry));
  const actionable = planned.filter((entry) => !entry.skip);
  if (actionable.length === 0) return false;

  const found = actionable.filter((entry) => !entry.blank);
  const failed = found.filter((entry) => entry.failed).length;
  if (failed > 0) {
    throw new FormFlattenError(`${failed} of ${found.length} annotations have no appearance that can be drawn`);
  }

  const removed = new Map();
  for (const { page, annotRef, annot, appearanceRef, placement } of actionable) {
    if (appearanceRef) {
      const key = page.node.newXObject('FlatAnnot', appearanceRef);
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...placement), drawObject(key), popGraphicsState());
    }
    const annots = page.node.Annots();
    for (let i = annots.size() - 1; i >= 0; i -= 1) {
      if (annots.get(i) === annotRef) annots.remove(i);
    }
    removed.set(annot, annotRef);
  }
  removeFields(pdfDoc, removed);
  for (const ref of removed.values()) if (ref instanceof PDFRef) context.delete(ref);
  return true;
}

/**
 * Image mode: every page becomes one picture at Redact's raster settings, so
 * fields, comments and text are all baked in and nothing stays selectable.
 */
async function rasterizeAllPages(source) {
  const pdfjs = await getPdfjs();
  const loadingTask = pdfjs.getDocument({ data: source.slice(0), wasmUrl: PDFJS_WASM_URL });
  try {
    const pdfjsDoc = await loadingTask.promise;
    const out = await PDFDocument.create();
    for (let i = 1; i <= pdfjsDoc.numPages; i += 1) {
      const { jpeg, width, height } = await rasterizePageToJpeg(await pdfjsDoc.getPage(i));
      await buildImageOnlyPage(out, jpeg, width, height);
    }
    return out.save();
  } finally {
    await loadingTask.destroy();
  }
}

/**
 * Flattens a PDF's annotations and form fields into page content.
 * 'keep-text' (default) bakes annotations and fields in and keeps vector text;
 * 'image' turns every page into a picture and loses selectable text.
 *
 * @param {ArrayBuffer | Uint8Array} bytes
 * @param {{ mode?: 'keep-text' | 'image' }} [options]
 * @returns {Promise<Uint8Array>}
 */
export async function flattenPdf(bytes, { mode = 'keep-text' } = {}) {
  if (mode !== 'keep-text' && mode !== 'image') throw new Error(`Unknown flatten mode "${mode}"`);
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (mode === 'image') return rasterizeAllPages(source);
  const pdfDoc = await PDFDocument.load(source);
  return flattenDoc(pdfDoc) ? pdfDoc.save() : source;
}
