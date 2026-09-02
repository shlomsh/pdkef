import { redactPdf } from '../editor/adapters/pdf/redact.js';
import { deleteObjectsFromPdf } from './deleteObjects.js';

/**
 * Applies a Redact-tool session's elements to a PDF: `delete`-type elements
 * remove the underlying PDF object (vector-preserving), everything else
 * (blackout/blur/whiteout) redacts and flattens as `redactPdf` always has.
 *
 * The two run in sequence, deletions first, because they compose cleanly in
 * that order and not the reverse: `redactPdf` copies untouched pages
 * losslessly and only rasterizes a page that actually has a box on it, so a
 * page with nothing but deletions passes through the second step unchanged
 * and keeps its deletions' size and searchability win. Doing it the other way
 * would mean cutting an object out of a page `redactPdf` has already turned
 * into a JPEG, which is not a thing byte-offset splicing can do.
 *
 * @param {File} file source PDF
 * @param {Array} elements Redact tool elements; `type: 'delete'` ones carry
 *   `start`/`end` from `pdfObjects.js`, everything else is a redaction box
 * @param {(progress: number) => void} [onProgress]
 * @returns {Promise<Blob>}
 */
export async function applyPageEdits(file, elements, onProgress) {
  const deletions = elements.filter((el) => el.type === 'delete');
  const boxes = elements.filter((el) => el.type !== 'delete');

  if (deletions.length === 0) {
    return redactPdf(file, boxes, onProgress);
  }

  const hasBoxes = boxes.length > 0;
  const deleted = await deleteObjectsFromPdf(
    file,
    deletions,
    hasBoxes ? (p) => onProgress?.(p * 0.4) : onProgress,
  );

  if (!hasBoxes) return deleted;

  return redactPdf(deleted, boxes, (p) => onProgress?.(0.4 + p * 0.6));
}
