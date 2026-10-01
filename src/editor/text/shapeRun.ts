// Export-only shaping: imported by textPdf.ts, never by the editor, so
// bidi-js stays out of the editor's first paint (measured 2026-09-29: 5.3 KB
// brotli of eager JS on /sign/ when this lived in textMetrics.ts).
import type { PDFFont } from '@cantoo/pdf-lib';
import bidiFactory from 'bidi-js';
import { composeHebrewClusters } from './hebrewComposition.js';
import { fontkitFont, type BidiDirection, type FontkitFont, type FontkitRun } from './textMetrics.ts';

const bidi = bidiFactory();

/**
 * Shapes one bidi run. `shapedWidth` and `drawShapedRun` both go through here,
 * so what the export measures is what it draws.
 *
 * An RTL run draws each Bidi_Mirrored character as its mirror (UAX#9 rule
 * L4), as the editor's textarea does: `א(ב)` paints `(ב)א`. fontkit's
 * `layout(..., 'rtl')` reverses glyph order but never mirrors, so without
 * this every bracket in a Hebrew or Arabic answer came out flipped (FONT-09).
 * A mirror the font has no glyph for keeps the typed character.
 */
export function layoutRun(fk: FontkitFont, text: string, direction?: BidiDirection): FontkitRun {
  const hasGlyph = (cp: number) => fk.hasGlyphForCodePoint(cp);
  const drawnText = direction === 'rtl'
    ? Array.from(text, (char) => {
      const mirror = bidi.getMirroredCharacter(char);
      return mirror && hasGlyph(mirror.codePointAt(0) as number) ? mirror : char;
    }).join('')
    : text;
  return fk.layout(composeHebrewClusters(drawnText, hasGlyph), undefined, undefined, undefined, direction);
}

/** Returns shaped width in points, or null when the fontkit handle is absent. */
export function shapedWidth(pdfFont: PDFFont | null, text: string, size: number, direction?: BidiDirection): number | null {
  const fk = fontkitFont(pdfFont);
  if (!fk) return null;
  const { positions } = layoutRun(fk, text, direction);
  return positions.reduce((sum, p) => sum + p.xAdvance, 0) * size / fk.unitsPerEm;
}
