/**
 * Bidi-aware text for the flat fixtures - the only module that touches fontkit and bidi.
 *
 * Deliberately self-contained: it imports nothing from src/. These fixtures are the yardstick the
 * Sign editor is later tested against, so drawing them with Sign's own bidi, shaping or export code
 * would make the yardstick agree with the code under test by construction. Instead the line is
 * reordered with the standalone `bidi-js` (UAX #9 levels, L2 reordering, Bidi_Mirroring) and painted
 * one character at a time with pdf-lib's public `drawText`, so pdf-lib alone keeps widths,
 * ToUnicode and subsetting right. A single character is never reordered by fontkit; the price is
 * lost kerning, which does not matter for a printed-form fixture.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bidiFactory from 'bidi-js';
import fontkit from '@pdf-lib/fontkit';
import { PDFHexString, PDFName, PDFOperator, PDFOperatorNames, endMarkedContent } from '@cantoo/pdf-lib';

const FONT_DIR = fileURLToPath(new URL('../../../public/fonts/', import.meta.url));
/** Fixed subset tags (six capitals, as the PDF spec asks) so font names do not depend on a random suffix. */
const SUBSET_TAGS = { regular: 'QAFRGR', bold: 'QAFBLD' };
const SURROGATE = /[\uD800-\uDFFF]/;

const bidi = bidiFactory();

/** Embeds a `{regular, bold}` pair of font files from public/fonts/ as subsets. */
export async function embedFonts(doc, fontFiles) {
  doc.registerFontkit(fontkit);
  const embedOne = (weight) => {
    const file = fontFiles[weight];
    const customName = `${SUBSET_TAGS[weight]}+${path.basename(file, '.ttf')}`;
    return doc.embedFont(fs.readFileSync(path.join(FONT_DIR, file)), { subset: true, customName });
  };
  return { regular: await embedOne('regular'), bold: await embedOne('bold') };
}

/**
 * Lays out one line for painting: the glyph characters to paint, in visual
 * (left-to-right) order (mirrored where UAX #9 says so, e.g. "(" at an odd level paints ")").
 * Every character is one UTF-16 unit, which holds for the text of these forms and is asserted.
 */
function visualOrder(text, direction) {
  if (SURROGATE.test(text)) throw new Error(`"${text}" contains a surrogate pair; the fixture line layout is BMP-only`);
  // getReorderedString applies L2 reordering and Bidi_Mirroring together. (getMirroredCharactersMap
  // wants the raw levels array, not the result object, and silently mirrors nothing if given the object.)
  return Array.from(bidi.getReorderedString(text, bidi.getEmbeddingLevels(text, direction)));
}

/**
 * Wraps `paint` in a marked-content span carrying /ActualText, the replacement text extractors
 * that honour it use for the span. Per the PDF spec it is the text in reading order, so it is the
 * LOGICAL string as typed, not the visual order the glyphs are painted in. pdf.js ignores it
 * (measured: extraction is identical with a wrong or absent span, and comes out logical either
 * way), which is why verify.mjs checks the spans in the content stream as well as pdf.js output.
 */
function withActualText(page, actualText, paint) {
  const props = page.doc.context.obj({ ActualText: PDFHexString.fromText(actualText) });
  page.pushOperators(PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of('Span'), props]));
  paint();
  page.pushOperators(endMarkedContent());
}

/**
 * Draws one line. `x` is the anchor and `align` says which point of the line sits on it
 * ('left' | 'right' | 'center'); `baseline` is in PDF user space. `direction` is the paragraph
 * direction. Returns the horizontal extent actually painted, so callers can check margins.
 */
export function drawLine(page, font, text, { x, baseline, size, color, direction, align }) {
  const glyphs = visualOrder(text, direction).map((glyph) => ({ glyph, width: font.widthOfTextAtSize(glyph, size) }));
  const width = glyphs.reduce((sum, item) => sum + item.width, 0);
  const left = { left: x, right: x - width, center: x - width / 2 }[align];
  withActualText(page, text, () => {
    let pen = left;
    for (const { glyph, width: advance } of glyphs) {
      page.drawText(glyph, { x: pen, y: baseline, size, font, color });
      pen += advance;
    }
  });
  return { left, right: left + width };
}
