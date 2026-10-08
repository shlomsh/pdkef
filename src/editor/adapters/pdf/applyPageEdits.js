import { redactPdf } from './redact.js';
import { deleteObjectsFromPdf } from './deleteObjects.js';

/**
 * Applies a Redact-tool session's elements to a PDF: `delete`-type elements
 * remove the underlying PDF object (vector-preserving), everything else
 * (blackout/blur/whiteout boxes and the blur and whiteout brush
 * strokes, which redactPdf counts as covering their page) redacts and flattens as `redactPdf` always has.
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
 * @param {{ finish?: (doc: import('@cantoo/pdf-lib').PDFDocument) => void, keepAttachments?: string[] }} [options]
 *   RED-59: `finish` edits the output document before its traces are stripped;
 *   `keepAttachments` names attached files to keep. `finish` runs on the first
 *   pass only (Delete when there are deletions, else the flatten), so a replay
 *   never runs twice; `keepAttachments` goes to both steps.
 * @returns {Promise<{ blob: Blob }>} The processed PDF.
 */
export async function applyPageEdits(file, elements, onProgress, options = {}) {
  const deletions = elements.filter((el) => el.type === 'delete');
  const boxes = elements.filter((el) => el.type !== 'delete');

  if (deletions.length === 0) {
    return redactPdf(file, boxes, onProgress, options);
  }

  const { finish: _finish, ...secondPass } = options;
  const hasBoxes = boxes.length > 0;
  const deleted = await deleteObjectsFromPdf(
    file,
    deletions,
    hasBoxes ? (p) => onProgress?.(p * 0.4) : onProgress,
    options,
  );

  if (!hasBoxes) return { blob: deleted };

  return redactPdf(deleted, boxes, (p) => onProgress?.(0.4 + p * 0.6), secondPass);
}
