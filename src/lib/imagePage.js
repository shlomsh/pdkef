export class UnsupportedImageError extends Error {
  constructor(fileName) {
    super(`Unsupported image type: ${fileName}`);
    this.name = 'UnsupportedImageError';
    this.fileName = fileName;
  }
}

const startsWith = (bytes, signature) => signature.every((b, i) => bytes[i] === b);
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// Cheap "is this really a JPEG/PNG" check on the leading bytes, for callers
// that must not pay for a full decode just to validate a photo.
export function hasImageSignature(bytes, mimeType) {
  const head = new Uint8Array(bytes.buffer ?? bytes, bytes.byteOffset ?? 0, Math.min(8, bytes.byteLength));
  if (mimeType === 'image/jpeg') return startsWith(head, JPEG_SIGNATURE);
  if (mimeType === 'image/png') return startsWith(head, PNG_SIGNATURE);
  return false;
}

// EXIF orientation (1-8) of a JPEG, read from the APP1 Exif segment's TIFF
// IFD0 tag 0x0112. 1 (upright) when absent, unreadable, or not a JPEG.
export function jpegOrientation(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!startsWith(bytes, JPEG_SIGNATURE)) return 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 2;
  while (pos + 4 <= bytes.length && bytes[pos] === 0xff) {
    const marker = bytes[pos + 1];
    if (marker === 0xda || marker === 0xd9) break; // image data starts, no Exif before it
    const length = view.getUint16(pos + 2);
    if (marker === 0xe1 && length >= 8 && pos + 2 + length <= bytes.length) {
      const orientation = tiffOrientation(view, pos + 4, pos + 2 + length);
      if (orientation) return orientation;
    }
    pos += 2 + length;
  }
  return 1;
}

function tiffOrientation(view, start, end) {
  // "Exif\0\0" then the TIFF header.
  if (end - start < 14 || view.getUint32(start) !== 0x45786966 || view.getUint16(start + 4) !== 0) return 0;
  const tiff = start + 6;
  const little = view.getUint16(tiff) === 0x4949;
  if (!little && view.getUint16(tiff) !== 0x4d4d) return 0;
  const u16 = (o) => view.getUint16(o, little);
  const u32 = (o) => view.getUint32(o, little);
  if (u16(tiff + 2) !== 42) return 0;
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return 0;
  const count = u16(ifd);
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return 0;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : 0;
    }
  }
  return 0;
}

// The rotation part of an EXIF orientation. Mirrored values (2, 4, 5, 7) keep
// only their rotation: the page is never flipped.
const ORIENTATION_ROTATION = { 1: 0, 2: 0, 3: 180, 4: 180, 5: 90, 6: 90, 7: 270, 8: 270 };

// Page sizes in PDF points (portrait). Scan lays its pages on these.
export const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] };

// Where an image sits on its page, in PDF points. 'fit' is the pixel-for-pixel
// rule below, or `pointsPerPixel` points a pixel when the caller fixes a density
// (Scan, so a scan stepped down to a size limit keeps its paper size). A named size turns landscape when the image is wider than tall,
// then scales the image (up or down) to fit inside the page, centred, aspect kept.
export function placeImage(imageWidth, imageHeight, pageSize = 'fit', pointsPerPixel = 1) {
  if (pageSize === 'fit') {
    const width = imageWidth * pointsPerPixel;
    const height = imageHeight * pointsPerPixel;
    return { pageWidth: width, pageHeight: height, x: 0, y: 0, width, height };
  }
  const [short, long] = PAGE_SIZES[pageSize];
  const [pageWidth, pageHeight] = imageWidth > imageHeight ? [long, short] : [short, long];
  const scale = Math.min(pageWidth / imageWidth, pageHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return { pageWidth, pageHeight, x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height };
}

// The one rule for turning a photo into a PDF page, shared by Image to PDF
// and Merge: the page is exactly the image's pixel size (1 image pixel = 1 PDF
// point) and the image fills it edge to edge, no distortion or letterboxing.
// A JPEG's EXIF orientation becomes the page's /Rotate, so a phone photo comes
// out upright, as browsers show it; the MediaBox stays the stored pixel size.
// `label` is what an UnsupportedImageError names (defaults to the MIME type).
// `pageSize` other than 'fit' lays the image on a named page instead (see placeImage).
export async function addImagePage(pdfDoc, bytes, mimeType, label = mimeType, { pageSize = 'fit', pointsPerPixel = 1 } = {}) {
  let image;
  if (mimeType === 'image/png') {
    image = await pdfDoc.embedPng(bytes);
  } else if (mimeType === 'image/jpeg') {
    image = await pdfDoc.embedJpg(bytes);
  } else {
    throw new UnsupportedImageError(label);
  }
  const { pageWidth, pageHeight, x, y, width, height } = placeImage(image.width, image.height, pageSize, pointsPerPixel);
  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  page.drawImage(image, { x, y, width, height });
  // A sized page skips /Rotate: Scan only sends canvas-encoded JPEGs, which carry no EXIF.
  if (pageSize === 'fit' && mimeType === 'image/jpeg') {
    const angle = ORIENTATION_ROTATION[jpegOrientation(bytes)];
    if (angle) page.setRotation({ type: 'degrees', angle }); // same shape as pdf-lib's degrees(), without a static pdf-lib import
  }
  return page;
}
