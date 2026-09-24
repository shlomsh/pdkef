import { applyRotation } from '../../lib/pageOps.js';
import { getPdfLib } from '../../lib/pdfLib.js';

// DEBT-23: parsePageSelector moved to src/lib/pageSelector.js (shared with
// PDF to Image). Import it from there.

// Converts a list of page numbers (e.g. [1, 2, 3, 5, 7, 8]) into a minimal range string
// (e.g. "1-3, 5, 7-8").
export function pageNumbersToRangeString(numbers) {
  if (!numbers || numbers.length === 0) return '';
  const sorted = [...numbers].sort((a, b) => a - b);
  const ranges = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i <= sorted.length; i += 1) {
    const current = sorted[i];
    if (current === prev + 1) {
      prev = current;
    } else {
      if (start === prev) {
        ranges.push(`${start}`);
      } else {
        ranges.push(`${start}-${prev}`);
      }
      start = current;
      prev = current;
    }
  }
  return ranges.join(', ');
}

// The source's base name, ".pdf" stripped, "split" when nothing is left.
export function outputBaseName(fileName) {
  return (fileName || '').replace(/\.pdf$/i, '') || 'split';
}

// The single-file output is `extracted_<base>.pdf`, the shape every other
// tool uses (`merged_x.pdf`, `signed_x.pdf`, `compressed_x.pdf`): a prefix in
// the tool's language, then the name in its own direction, so a Hebrew name
// needs no bidi isolation (ux-design-guidelines §5). Per-page files keep
// `<base>-page-<n>.pdf`, one per page, in page order.
export function outputFileName(fileName, mode, pageNumber) {
  const base = outputBaseName(fileName);
  return mode === 'separate' ? `${base}-page-${pageNumber}.pdf` : `extracted_${base}.pdf`;
}

// Splits the input PDF file based on the selected page numbers and mode.
// mode: 'combined' | 'separate'. `rotations` is an optional { [pageNumber]:
// 0|90|180|270 } map of the delta the person applied with the per-cell
// rotate control, added on top of whatever rotation the source page already
// carried (pageOps.js's applyRotation, shared with Merge and Edit Pages).
export async function splitPdf(file, { pageNumbers, mode = 'combined', rotations = {}, onProgress }) {
  const { PDFDocument } = await getPdfLib();
  const bytes = await file.arrayBuffer();
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });

  if (mode === 'combined') {
    const merged = await PDFDocument.create();
    const indices = pageNumbers.map((n) => n - 1);

    const pages = await merged.copyPages(source, indices);
    for (let i = 0; i < pages.length; i += 1) {
      applyRotation(pages[i], rotations[pageNumbers[i]]);
      merged.addPage(pages[i]);
      onProgress?.((i + 1) / pages.length);
    }

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
