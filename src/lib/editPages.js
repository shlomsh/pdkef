import { PDFDocument } from '@cantoo/pdf-lib';
import { applyRotation, embedPageNumberFont, stampPageNumber } from './pageOps.js';

/**
 * Edits pages in a PDF: reorders, removes, rotates, and/or adds page numbers.
 *
 * @param {File} file The original PDF file.
 * @param {Object} options
 * @param {number[]} options.pageOrder Final page order as 1-indexed original page numbers.
 *   e.g. [3,1,2] means output page 1 = original page 3, etc.
 *   If omitted defaults to original order.
 * @param {Set<number>} options.removedPageNums Set of 1-indexed original page numbers to remove.
 * @param {Object} options.rotations Map of { [1-indexed pageNumber]: degrees } to add to each page's rotation.
 * @param {boolean} options.addPageNumbers Whether to stamp sequential page numbers at the bottom centre.
 * @param {function} [onProgress] Progress callback (0–1).
 * @returns {Promise<Blob>} The modified PDF as a Blob.
 */
export async function editPages(
  file,
  { pageOrder = null, removedPageNums = new Set(), rotations = {}, addPageNumbers = false },
  onProgress,
) {
  const bytes = await file.arrayBuffer();
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const originalCount = srcDoc.getPageCount();

  // Build the ordered list of 1-indexed page numbers to keep, in final output order.
  const orderedPageNums = (pageOrder ?? Array.from({ length: originalCount }, (_, i) => i + 1))
    .filter((pageNum) => !removedPageNums.has(pageNum));

  const totalOps = orderedPageNums.length;
  let opsDone = 0;

  // Copy the kept pages (in final order) into a new document.
  const outDoc = await PDFDocument.create();

  // Copy all pages we need in one batch for efficiency.
  // pdf-lib copyPages takes 0-indexed positions in srcDoc.
  const zeroIndexed = orderedPageNums.map((n) => n - 1);
  const copiedPages = await outDoc.copyPages(srcDoc, zeroIndexed);

  let font = null;
  if (addPageNumbers) {
    font = await embedPageNumberFont(outDoc);
  }

  for (let i = 0; i < copiedPages.length; i++) {
    const page = outDoc.addPage(copiedPages[i]);
    const originalPageNum = orderedPageNums[i];

    // Apply rotation delta (additive on top of any existing page rotation).
    applyRotation(page, rotations[originalPageNum]);

    // Stamp page number at bottom-centre.
    if (addPageNumbers) {
      stampPageNumber(page, `${i + 1}`, font);
    }

    opsDone++;
    onProgress?.(opsDone / totalOps);
  }

  const modifiedBytes = await outDoc.save();
  return new Blob([modifiedBytes], { type: 'application/pdf' });
}
