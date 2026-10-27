import { applyRotation } from '../../../lib/pageOps.js';
import { getPdfLib } from '../../../lib/pdfLib.js';
import { openPdfDoc } from '../../../lib/openPdfDoc.ts';
import { throwIfAborted } from '../../../lib/abort.js';
import { toBytes } from '../../../lib/toBytes.js';
import { outputBase, withAffixes } from '../../../lib/outputName.ts';

// DEBT-23: parsePageSelector moved to src/lib/pageSelector.js (shared with
// PDF to Image). Import it from there.

// The source's base name, ".pdf" stripped, "split" when nothing is left.
export function outputBaseName(fileName) {
  return outputBase(fileName || '', { fallback: 'split' });
}

// The single-file output is `extracted_<base>.pdf`, the shape Merge, Sign and
// Redact use (`merged_x.pdf`, `signed_x.pdf`, `redacted_x.pdf`): a prefix in
// the tool's language, then the name in its own direction, so a Hebrew name
// needs no bidi isolation (ux-design-guidelines §5). Compress is the one tool
// that suffixes instead (`x-compressed.pdf`). Per-page files keep
// `<base>-page-<n>.pdf`, one per page, in page order.
export function outputFileName(fileName, mode, pageNumber) {
  const base = outputBaseName(fileName);
  return mode === 'separate' ? withAffixes(base, { suffix: `-page-${pageNumber}` }) : extractedFileName(base);
}

// The single-file name for a base the person may have renamed in the heading.
export function extractedFileName(base) {
  return withAffixes(base, { prefix: 'extracted_' });
}

// Splits the input PDF file based on the selected page numbers and mode.
// mode: 'combined' | 'separate'. `rotations` is an optional { [pageNumber]:
// 0|90|180|270 } map of the delta the person applied with the per-cell
// rotate control, added on top of whatever rotation the source page already
// carried (pageOps.js's applyRotation, shared with Merge and Edit Pages).
export async function splitPdf(file, { pageNumbers, mode = 'combined', rotations = {}, onProgress, signal }) {
  const { PDFDocument } = await getPdfLib();
  const bytes = await toBytes(file);
  throwIfAborted(signal);
  // The island repairs a lost page tree at intake and hands over the repaired file (ARCH-39 decision), so no repair here.
  const { doc: source } = await openPdfDoc(bytes, { encryption: 'ignore' });
  // An owner-only file loads without a password, but its page streams are still
  // encrypted: copying them out would save a valid PDF of blank pages.
  if (source.isEncrypted) throw new Error('This PDF is password protected.');

  if (mode === 'combined') {
    const merged = await PDFDocument.create();
    const indices = pageNumbers.map((n) => n - 1);

    const pages = await merged.copyPages(source, indices);
    for (let i = 0; i < pages.length; i += 1) {
      throwIfAborted(signal);
      applyRotation(pages[i], rotations[pageNumbers[i]]);
      merged.addPage(pages[i]);
      onProgress?.((i + 1) / pages.length);
    }

    throwIfAborted(signal);
    const mergedBytes = await merged.save();
    return [
      {
        blob: new Blob([mergedBytes], { type: 'application/pdf' }),
        filename: outputFileName(file.name, 'combined'),
      },
    ];
  } else {
    // mode === 'separate'
    const results = [];
    for (let i = 0; i < pageNumbers.length; i += 1) {
      throwIfAborted(signal);
      const pageNum = pageNumbers[i];
      const singleDoc = await PDFDocument.create();
      const [copiedPage] = await singleDoc.copyPages(source, [pageNum - 1]);
      applyRotation(copiedPage, rotations[pageNum]);
      singleDoc.addPage(copiedPage);
      const docBytes = await singleDoc.save();
      results.push({
        blob: new Blob([docBytes], { type: 'application/pdf' }),
        filename: outputFileName(file.name, 'separate', pageNum),
        pageNumber: pageNum,
      });
      onProgress?.((i + 1) / pageNumbers.length);
    }
    return results;
  }
}
