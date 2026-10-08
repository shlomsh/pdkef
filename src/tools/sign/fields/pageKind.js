import { extractPageObjects } from '../../../editor/adapters/pdf/pdfObjects.js';
import { collectPageInk } from './pageInk.js';

/**
 * What the first page of a document is made of, for one reason: FORM-35 counts
 * how often Sign opens a page that is only an image, through a closed-list
 * `page_kind` on `sign_form_detection`.
 *
 * Coarse on purpose. Ink inside Form XObjects, curves and diagonals is not seen
 * by `collectPageInk`, so such a page reads as `image` or `none`.
 *
 * @typedef {'text' | 'vector' | 'image' | 'none'} PageKind
 */

/**
 * Text wins, then vector ink, then an image, else nothing.
 *
 * @param {{hasText: boolean, hasInk: boolean, hasImage: boolean}} signals
 * @returns {PageKind}
 */
export function classifyPageKind({ hasText, hasInk, hasImage }) {
  if (hasText) return 'text';
  if (hasInk) return 'vector';
  if (hasImage) return 'image';
  return 'none';
}

/** A probe that throws counts as "not there": telemetry never blocks the tool. */
function probe(fn) {
  try {
    return fn();
  } catch { // expected: a throwing probe means "not there"
    return false;
  }
}

/**
 * The kind of page 0. The dearer probes only run when the cheaper ones found
 * nothing, so the usual text page costs a length check.
 *
 * @param {import('@cantoo/pdf-lib').PDFDocument} pdfLibDoc
 * @param {Array<Array<unknown>> | undefined} textRuns pdf.js text runs per page
 * @returns {PageKind}
 */
export function firstPageKind(pdfLibDoc, textRuns) {
  const page = probe(() => (pdfLibDoc.getPageCount() > 0 ? pdfLibDoc.getPage(0) : null));
  if (!page) return 'none';
  const hasText = (textRuns?.[0]?.length ?? 0) > 0;
  const hasInk = !hasText && probe(() => {
    const { verticals, horizontals, rects } = collectPageInk(page);
    return verticals.length + horizontals.length + rects.length > 0;
  });
  const hasImage = !hasText && !hasInk
    && probe(() => extractPageObjects(page, 0).objects.some((o) => o.kind === 'image'));
  return classifyPageKind({ hasText, hasInk, hasImage });
}
