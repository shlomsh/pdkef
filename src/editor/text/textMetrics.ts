// fontkit's Indic syllable-state-machine shaping uses generators. The pinned
// @pdf-lib/fontkit build needs this polyfill before any `layout()` call.
import 'regenerator-runtime/runtime.js';
import type { PDFFont } from '@cantoo/pdf-lib';
import { composeHebrewClusters } from './hebrewComposition.js';
import { findMissingGlyphs } from './textTransforms.js';

export type BidiDirection = 'ltr' | 'rtl';

type FontkitFont = {
  unitsPerEm: number;
  layout: (text: string, features?: undefined, script?: undefined, language?: undefined, direction?: BidiDirection) => {
    glyphs: { id: number }[];
    positions: { xAdvance: number; xOffset: number; yOffset: number }[];
  };
  hasGlyphForCodePoint: (codePoint: number) => boolean;
};

// `embedder` is pdf-lib's private field, reached the same way the export's
// baseline calculation does. Keeping the accessor shared means the editor's
// coverage notice and the exporter judge the exact same font instance.
export function fontkitFont(pdfFont: PDFFont | null): FontkitFont | null {
  const fk = (pdfFont as unknown as { embedder?: { font?: FontkitFont } } | null)?.embedder?.font;
  return fk?.unitsPerEm ? fk : null;
}

/** Returns unsupported characters in first-seen order for the drawn form. */
export function unrepresentableCharacters(pdfFont: PDFFont | null, text: string): string[] {
  const fk = fontkitFont(pdfFont);
  if (!fk) return [];
  return findMissingGlyphs(text, (cp: number) => fk.hasGlyphForCodePoint(cp));
}

/** Returns shaped width in points, or null when the fontkit handle is absent. */
export function shapedWidth(pdfFont: PDFFont | null, text: string, size: number, direction?: BidiDirection): number | null {
  const fk = fontkitFont(pdfFont);
  if (!fk) return null;
  const composedText = composeHebrewClusters(text, (cp) => fk.hasGlyphForCodePoint(cp));
  const { positions } = fk.layout(composedText, undefined, undefined, undefined, direction);
  return positions.reduce((sum, p) => sum + p.xAdvance, 0) * size / fk.unitsPerEm;
}
