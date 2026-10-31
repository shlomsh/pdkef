import { PDFName, PDFNumber } from '@cantoo/pdf-lib';
import type { PDFPage } from '@cantoo/pdf-lib';
import { createPageGeometry, visiblePageBox } from '#editor/geometry/coords.ts';

// pdf-lib exposes CropBox/MediaBox/Rotate at the page API, but not /UserUnit.
// Read that one numeric page attribute through the library's typed low-level
// objects, including an inherited value when present. Invalid producer output
// falls back to the PDF default of 1, matching pdf.js.
/** @testSeam */
export function pageUserUnit(page: PDFPage): number {
  try {
    const value = page.node.getInheritableAttribute(PDFName.of('UserUnit'));
    const number = page.doc.context.lookupMaybe(value, PDFNumber)?.asNumber();
    return number !== undefined && Number.isFinite(number) && number > 0 ? number : 1;
  } catch {
    // expected: invalid UserUnit from a producer defaults to 1
    return 1;
  }
}

export function pageGeometryFromPdfLibPage(page: PDFPage) {
  return createPageGeometry({
    cropBox: visiblePageBox(page.getMediaBox(), page.getCropBox()),
    rotation: page.getRotation().angle,
    userUnit: pageUserUnit(page),
  });
}
