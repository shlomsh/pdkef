export class UnsupportedImageError extends Error {
  constructor(fileName) {
    super(`Unsupported image type: ${fileName}`);
    this.name = 'UnsupportedImageError';
    this.fileName = fileName;
  }
}

// The one rule for turning a photo into a PDF page, shared by Image to PDF
// and Merge: the page is exactly the image's pixel size (1 image pixel = 1 PDF
// point) and the image fills it edge to edge, no distortion or letterboxing.
// `label` is what an UnsupportedImageError names (defaults to the MIME type).
export async function addImagePage(pdfDoc, bytes, mimeType, label = mimeType) {
  let image;
  if (mimeType === 'image/png') {
    image = await pdfDoc.embedPng(bytes);
  } else if (mimeType === 'image/jpeg') {
    image = await pdfDoc.embedJpg(bytes);
  } else {
    throw new UnsupportedImageError(label);
  }
  const page = pdfDoc.addPage([image.width, image.height]);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  return page;
}
