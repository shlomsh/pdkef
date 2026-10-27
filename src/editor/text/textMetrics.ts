// fontkit's Indic syllable-state-machine shaping uses generators. The pinned
// @pdf-lib/fontkit build needs this polyfill before any `layout()` call.
import 'regenerator-runtime/runtime.js';
import type { PDFFont } from '@cantoo/pdf-lib';
import { findMissingGlyphs } from './textTransforms.js';

export type BidiDirection = 'ltr' | 'rtl';

export type FontkitRun = {
  glyphs: { id: number }[];
  positions: { xAdvance: number; xOffset: number; yOffset: number }[];
};

export type FontkitFont = {
  unitsPerEm: number;
  layout: (text: string, features?: undefined, script?: undefined, language?: undefined, direction?: BidiDirection) => FontkitRun;
  hasGlyphForCodePoint: (codePoint: number) => boolean;
};

/** The private shape of pdf-lib's custom-font embedder, as far as the editor reads it. */
export type PdfFontEmbedder = {
  font?: FontkitFont;
  subset?: { includeGlyph: (glyph: unknown) => number };
  glyphs?: unknown[];
  glyphIdMap?: Map<number, number>;
  glyphCache?: { invalidate: () => void };
};

/** The one accessor for pdf-lib's private `embedder` field; undefined for standard fonts or no font. */
export function pdfFontEmbedder(pdfFont: PDFFont | null): PdfFontEmbedder | undefined {
  return (pdfFont as unknown as { embedder?: PdfFontEmbedder } | null)?.embedder;
}

// `embedder` is pdf-lib's private field, reached the same way the export's
// baseline calculation does. Keeping the accessor shared means the editor's
// coverage notice and the exporter judge the exact same font instance.
export function fontkitFont(pdfFont: PDFFont | null): FontkitFont | null {
  const fk = pdfFontEmbedder(pdfFont)?.font;
  return fk?.unitsPerEm ? fk : null;
}

/** Returns unsupported characters in first-seen order for the drawn form. */
export function unrepresentableCharacters(pdfFont: PDFFont | null, text: string): string[] {
  const fk = fontkitFont(pdfFont);
  if (!fk) return [];
  return findMissingGlyphs(text, (cp: number) => fk.hasGlyphForCodePoint(cp));
}
