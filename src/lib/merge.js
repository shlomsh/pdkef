import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

// Reads the PDF's internal /CreationDate, if present and parseable.
// Used as a secondary sort signal (see sort.js); never required.
export async function resolvePdfCreationDate(file) {
  try {
    const bytes = await file.arrayBuffer();
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const date = pdf.getCreationDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : null;
  } catch {
    return null;
  }
}

// Merges PDF files in the given order into a single PDF Blob.
// Runs entirely in-memory in the browser - no network I/O.
export async function mergePdfs(files, options = {}, onProgress) {
  if (typeof options === 'function') {
    onProgress = options;
    options = {};
  }

  const merged = await PDFDocument.create();
  const { addPageNumbers = false } = options;

  let font = null;
  if (addPageNumbers) {
    font = await merged.embedFont(StandardFonts.Helvetica);
  }

  let globalPageIndex = 0;

  for (let i = 0; i < files.length; i += 1) {
    const bytes = await files[i].arrayBuffer();
    const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await merged.copyPages(source, source.getPageIndices());
    for (const page of pages) {
      const addedPage = merged.addPage(page);

      if (addPageNumbers) {
        const label = `${globalPageIndex + 1}`;
        const textSize = 12;
        const textWidth = font.widthOfTextAtSize(label, textSize);
        const { width } = addedPage.getSize();
        addedPage.drawText(label, {
          x: width / 2 - textWidth / 2,
          y: 22,
          size: textSize,
          font,
          color: rgb(0.2, 0.2, 0.2),
        });
      }
      globalPageIndex++;
    }
    onProgress?.((i + 1) / files.length);
  }

  const mergedBytes = await merged.save();
  return new Blob([mergedBytes], { type: 'application/pdf' });
}
