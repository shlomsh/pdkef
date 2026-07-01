import { PDFDocument } from '@cantoo/pdf-lib';

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
export async function mergePdfs(files, onProgress) {
  const merged = await PDFDocument.create();

  for (let i = 0; i < files.length; i += 1) {
    const bytes = await files[i].arrayBuffer();
    const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await merged.copyPages(source, source.getPageIndices());
    for (const page of pages) merged.addPage(page);
    onProgress?.((i + 1) / files.length);
  }

  const mergedBytes = await merged.save();
  return new Blob([mergedBytes], { type: 'application/pdf' });
}
