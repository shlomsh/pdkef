import { getPdfLib } from '../pdf/pdfLib.js';
import { addImagePage, UnreadableImageError, UnsupportedImageError } from './imagePage.js';
import { mimeTypeOf } from '../handoff/fileKind.js';
import { throwIfAborted } from '../output/abort.js';

/** @testSeam */
export { UnreadableImageError, UnsupportedImageError };

// Combines image files into a single PDF, one image per page. With the default
// pageSize 'fit', each page is
// sized to match its image's pixel dimensions exactly (1 image pixel = 1 PDF
// point), so the image fills the page edge-to-edge with no distortion or
// letterboxing. Runs entirely in-memory in the browser - no network I/O.
// A picture nothing can decode is left out and named to `onSkip`; the PDF builds from the rest
// (and when there is no rest, the UnreadableImageError travels).
/**
 * @param {File[]} files
 * @param {((fraction: number) => void) | undefined} [onProgress]
 * @param {AbortSignal} [signal]
 * @param {{ pageSize?: string, pointsPerPixel?: number, onSkip?: (name: string) => void }} [options]
 * @returns {Promise<Blob>}
 */
export async function imagesToPdf(files, onProgress, signal, { pageSize = 'fit', pointsPerPixel = 1, onSkip } = {}) {
  const { PDFDocument } = await getPdfLib();
  const pdf = await PDFDocument.create();
  let unreadable = null;

  for (let i = 0; i < files.length; i += 1) {
    throwIfAborted(signal);
    const file = files[i];
    const bytes = await file.arrayBuffer();

    try {
      await addImagePage(pdf, bytes, mimeTypeOf(file), file.name, { pageSize, pointsPerPixel });
    } catch (err) {
      if (!(err instanceof UnreadableImageError)) throw err;
      unreadable = err;
      onSkip?.(file.name); // expected: the person's file, neither decoder can read it
    }
    onProgress?.((i + 1) / files.length);
  }

  throwIfAborted(signal);
  // Every picture was left out: a PDF with no pages is no PDF, so the last one's error travels.
  if (unreadable && pdf.getPageCount() === 0) throw unreadable;
  const pdfBytes = await pdf.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}
