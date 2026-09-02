import { PDFDocument, PDFName } from '@cantoo/pdf-lib';
import { extractPageObjects, getPageContentBytes } from './pdfObjects.js';

/**
 * Removes chosen drawing operations from a PDF by rewriting the affected page
 * content streams, leaving every other page byte-identical.
 *
 * This is the counterpart to `redactPdf`, and deliberately unlike it. Redaction
 * paints over content and must then flatten the page to an image, because a
 * drawn rectangle does not remove what is underneath it. Deletion removes the
 * operation itself, so the page stays vector: text elsewhere on it is still
 * selectable, the file stays small, and nothing is re-encoded.
 *
 * @param {File|Blob|ArrayBuffer|Uint8Array} file source PDF
 * @param {Array<{pageIndex: number, start: number, end: number}>} deletions
 *   byte spans as reported by `extractPageObjects` for that same page
 * @param {(progress: number) => void} [onProgress]
 * @returns {Promise<Blob>}
 */
export async function deleteObjectsFromPdf(file, deletions, onProgress) {
  const bytes =
    file instanceof Uint8Array
      ? file
      : new Uint8Array(file instanceof ArrayBuffer ? file : await file.arrayBuffer());

  const doc = await PDFDocument.load(bytes);

  const byPage = new Map();
  for (const deletion of deletions) {
    if (!byPage.has(deletion.pageIndex)) byPage.set(deletion.pageIndex, []);
    byPage.get(deletion.pageIndex).push(deletion);
  }

  const pageIndexes = [...byPage.keys()].sort((a, b) => a - b);
  for (const [step, pageIndex] of pageIndexes.entries()) {
    const page = doc.getPage(pageIndex);
    const original = getPageContentBytes(page);
    const rewritten = spliceOut(original, byPage.get(pageIndex));

    // One merged stream replaces however many the page had. Offsets were
    // computed against the merged buffer, so the two must agree.
    const stream = doc.context.flateStream(rewritten);
    page.node.set(PDFName.of('Contents'), doc.context.register(stream));

    onProgress?.((step + 1) / pageIndexes.length);
  }

  const saved = await doc.save();
  return new Blob([saved], { type: 'application/pdf' });
}

/**
 * Cuts byte ranges out of a content stream.
 *
 * Ranges are applied back to front so earlier offsets stay valid, and each cut
 * leaves a newline behind: the removed span sat between two tokens, and butting
 * its neighbours together could fuse them into one.
 *
 * @param {Uint8Array} bytes
 * @param {Array<{start: number, end: number}>} ranges
 * @returns {Uint8Array}
 */
export function spliceOut(bytes, ranges) {
  const ordered = [...ranges].sort((a, b) => a.start - b.start);

  // Merge overlaps so a doubly-selected span is not cut twice.
  const merged = [];
  for (const range of ordered) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ start: range.start, end: range.end });
  }

  const pieces = [];
  let cursor = 0;
  for (const range of merged) {
    const start = Math.max(0, Math.min(range.start, bytes.length));
    const end = Math.max(start, Math.min(range.end, bytes.length));
    pieces.push(bytes.subarray(cursor, start));
    pieces.push(new Uint8Array([0x0a]));
    cursor = end;
  }
  pieces.push(bytes.subarray(cursor));

  const total = pieces.reduce((sum, piece) => sum + piece.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const piece of pieces) {
    out.set(piece, offset);
    offset += piece.length;
  }
  return out;
}

/**
 * Lists the deletable objects on every page, for the UI's hover targets.
 *
 * A page whose content stream this lexer cannot fully model (an unusual
 * operator sequence, a font it can't read metrics from) is skipped rather than
 * failing the whole file: it simply offers nothing to click, which matches the
 * "what you see is what you get, no highlight means no delete" rule the rest
 * of this feature follows.
 *
 * @param {File|Blob|ArrayBuffer|Uint8Array} file
 * @returns {Promise<Array>} objects carrying `rect` in page percentages
 */
export async function listDeletableObjects(file) {
  const bytes =
    file instanceof Uint8Array
      ? file
      : new Uint8Array(file instanceof ArrayBuffer ? file : await file.arrayBuffer());

  const doc = await PDFDocument.load(bytes);
  const all = [];
  for (let i = 0; i < doc.getPageCount(); i += 1) {
    try {
      const { objects } = extractPageObjects(doc.getPage(i), i);
      all.push(...objects);
    } catch (err) {
      console.error(`Could not read deletable objects on page ${i + 1}`, err);
    }
  }
  return all;
}
