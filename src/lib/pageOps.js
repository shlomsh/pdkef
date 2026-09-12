import { StandardFonts, degrees as pdfDegrees, rgb } from '@cantoo/pdf-lib';

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
  return doc.embedFont(StandardFonts.Helvetica);
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

// Stamps a bottom-centre page number label. Geometry (size 12, y = 22, colour
// rgb(0.2, 0.2, 0.2), horizontally centred by measuring the label at that
// size) is pinned exactly to what merge.js and editPages.js each drew before
// this file existed - changing any of these numbers changes what every
// existing "add page numbers" export looks like.
export function stampPageNumber(page, label, font) {
  const textSize = 12;
  const textWidth = font.widthOfTextAtSize(label, textSize);
  const { width } = page.getSize();
  page.drawText(label, {
    x: width / 2 - textWidth / 2,
    y: 22,
    size: textSize,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });
}
