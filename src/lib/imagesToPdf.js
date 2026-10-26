import { getPdfLib } from './pdfLib.js';
import { addImagePage, UnsupportedImageError } from './imagePage.js';
import { mimeTypeOf } from './fileKind.js';

export { UnsupportedImageError };

// Combines image files into a single PDF, one image per page. With the default
// pageSize 'fit', each page is
// sized to match its image's pixel dimensions exactly (1 image pixel = 1 PDF
// point), so the image fills the page edge-to-edge with no distortion or
// letterboxing. Runs entirely in-memory in the browser - no network I/O.
export async function imagesToPdf(files, onProgress, signal, { pageSize = 'fit' } = {}) {
  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException('Conversion aborted', 'AbortError');
  };
  const { PDFDocument } = await getPdfLib();
  const pdf = await PDFDocument.create();

  for (let i = 0; i < files.length; i += 1) {
    throwIfAborted();
    const file = files[i];
    const bytes = await file.arrayBuffer();

    await addImagePage(pdf, bytes, mimeTypeOf(file), file.name, { pageSize });
    onProgress?.((i + 1) / files.length);
  }

  throwIfAborted();
  const pdfBytes = await pdf.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}
