import { PDFDocument } from '@cantoo/pdf-lib';

export class UnsupportedImageError extends Error {
  constructor(fileName) {
    super(`Unsupported image type: ${fileName}`);
    this.name = 'UnsupportedImageError';
    this.fileName = fileName;
  }
}

// Combines image files into a single PDF, one image per page. Each page is
// sized to match its image's pixel dimensions exactly (1 image pixel = 1 PDF
// point), so the image fills the page edge-to-edge with no distortion or
// letterboxing. Runs entirely in-memory in the browser - no network I/O.
export async function imagesToPdf(files, onProgress) {
  const pdf = await PDFDocument.create();

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const bytes = await file.arrayBuffer();

    let image;
    if (file.type === 'image/png') {
      image = await pdf.embedPng(bytes);
    } else if (file.type === 'image/jpeg') {
      image = await pdf.embedJpg(bytes);
    } else {
      throw new UnsupportedImageError(file.name);
    }

    const page = pdf.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    onProgress?.((i + 1) / files.length);
  }

  const pdfBytes = await pdf.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}
