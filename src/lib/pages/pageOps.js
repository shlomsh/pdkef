import { HELVETICA, degrees as pdfDegrees, rgb } from '../pdf/pdfLiterals.ts';

/**
 * Per-page building blocks shared by every tool that assembles an output PDF
 * page by page: merge.js (many source files -> one document) and
 * editPages.js (one source file, reordered/rotated/trimmed). Both used to
 * carry their own copies of this font/rotation/stamp logic; MERGE-03 pulled
 * it out here so the geometry can only drift in one place, and so mergePlan
 * round-trip tests and editPages.test.js (still the oracle for exact pixel
 * geometry) are both exercising the same code.
 */

// Embeds the one font every "add page numbers" checkbox in the app uses.
// A single shared instance is embedded once per output document (not once
// per page) because embedFont() writes a font resource into the doc.
export async function embedPageNumberFont(doc) {
  return doc.embedFont(HELVETICA);
}

// Applies an additive rotation delta on top of whatever rotation the page
// already had (a page rotated 90 in the source PDF plus a further +90 from
// the user should land on 180, not overwrite it). A falsy delta (0 or
// undefined - "leave this page alone") is a no-op, matching editPages.js's
// original `if (rotDelta)` guard so an entry with rotation 0 never touches
// the page's existing /Rotate at all.
export function applyRotation(page, deltaDegrees) {
  if (!deltaDegrees) return;
  const currentAngle = page.getRotation().angle;
  page.setRotation(pdfDegrees(currentAngle + deltaDegrees));
}

// Where to draw a page-number label so that, once a viewer applies the page's
// /Rotate (clockwise, per the PDF spec), it reads upright and is centred on the
// visual bottom edge, `inset` points up. Text is drawn in unrotated user space,
// so the label is rotated and moved to whichever unrotated edge ends up at the
// bottom: right for 90, top for 180, left for 270. `box` is the visible box
// (CropBox, else MediaBox) and may have a non-zero origin.
/** @testSeam */
export function pageNumberPlacement({ box, rotation, textWidth, inset = 22 }) {
  const { x, y, width, height } = box;
  const angle = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  if (angle === 90) return { x: x + width - inset, y: y + height / 2 - textWidth / 2, rotate: 90 };
  if (angle === 180) return { x: x + width / 2 + textWidth / 2, y: y + height - inset, rotate: 180 };
  if (angle === 270) return { x: x + inset, y: y + height / 2 + textWidth / 2, rotate: 270 };
  return { x: x + width / 2 - textWidth / 2, y: y + inset, rotate: 0 };
}

// Stamps a bottom-centre page number label. Size 12, colour rgb(0.2, 0.2, 0.2)
// and the 22pt inset are pinned to what merge.js and editPages.js each drew
// before this file existed - changing them changes every existing "add page
// numbers" export. Rotation and the box origin are accounted for because many
// source PDFs (landscape scans) carry /Rotate: a label placed in unrotated
// space would land on a side or top edge, sideways or upside down. An
// unrotated page with a (0,0) origin yields the historic x/y exactly.
export function stampPageNumber(page, label, font) {
  const textSize = 12;
  const textWidth = font.widthOfTextAtSize(label, textSize);
  const { x, y, rotate } = pageNumberPlacement({
    box: page.getCropBox(),
    rotation: page.getRotation().angle,
    textWidth,
  });
  page.drawText(label, {
    x,
    y,
    size: textSize,
    font,
    color: rgb(0.2, 0.2, 0.2),
    rotate: pdfDegrees(rotate),
  });
}
