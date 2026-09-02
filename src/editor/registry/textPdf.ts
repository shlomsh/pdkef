// PDF-only text drawing. This module is imported only when a document is
// downloaded; keep measurement and coverage helpers in textMetrics.ts so the
// editor does not eagerly fetch pdf-lib while it hydrates.
import {
  PDFHexString, rgb, beginText, endText, popGraphicsState, pushGraphicsState,
  setFillingColor, setFontAndSize, setTextMatrix, setTextRise, showText,
  PDFOperator, PDFOperatorNames, PDFName, endMarkedContent,
} from '@cantoo/pdf-lib';
import type { Color, PDFFont, PDFPage } from '@cantoo/pdf-lib';
import type { TextElement } from '../model/editorModel.ts';
import type { SerializeContext } from './types.ts';
import { DEFAULT_LINE_HEIGHT_EM } from '../../constants/signGeometry.js';
import { combCellCount, combCharacters, combCellCenterFraction, isComb } from '../text/comb.js';
import { resolveBidiRuns } from '../text/bidiRuns.js';
import { composeHebrewClusters } from '../text/hebrewComposition.js';
import { normalizeTabsForBidi, stripInvisibleFormatting } from '../text/textTransforms.js';
import { getEffectiveTextDirection, hexToRgbFractions } from '../../lib/signHelpers.js';
import { resolveTypography } from '../text/fonts.js';
import { fontkitFont, shapedWidth, type BidiDirection } from '../text/textMetrics.ts';

const gidHex = (id: number) => id.toString(16).toUpperCase().padStart(4, '0');

function remapGlyphForSubset(pdfFont: PDFFont, glyph: { id: number }): number {
  const embedder = (pdfFont as unknown as {
    embedder?: {
      subset?: { includeGlyph: (glyph: unknown) => number };
      glyphs?: unknown[];
      glyphIdMap?: Map<number, number>;
      glyphCache?: { invalidate: () => void };
    };
  }).embedder;
  if (embedder?.subset) {
    if (!embedder.glyphs || !embedder.glyphIdMap || !embedder.glyphCache) {
      throw new Error('drawShapedRun found a subset-embedded font whose glyph bookkeeping (glyphs/glyphIdMap/glyphCache) is missing - @cantoo/pdf-lib\'s CustomFontSubsetEmbedder internals have changed shape. Emitting raw glyph ids here would silently draw the wrong glyphs.');
    }
    const subsetGlyphId = embedder.subset.includeGlyph(glyph);
    embedder.glyphs[subsetGlyphId - 1] = glyph;
    embedder.glyphIdMap.set(glyph.id, subsetGlyphId);
    embedder.glyphCache.invalidate();
    return subsetGlyphId;
  }
  return glyph.id;
}

const fontDictionaryKeysByPage = new WeakMap<PDFPage, Map<string, PDFName>>();

function fontDictionaryKey(page: PDFPage, pdfFont: PDFFont): PDFName {
  let keysForPage = fontDictionaryKeysByPage.get(page);
  if (!keysForPage) {
    keysForPage = new Map();
    fontDictionaryKeysByPage.set(page, keysForPage);
  }
  const refTag = pdfFont.ref.toString();
  const cached = keysForPage.get(refTag);
  if (cached) return cached;
  const key = page.node.newFontDictionary(pdfFont.name, pdfFont.ref);
  keysForPage.set(refTag, key);
  return key;
}

/** Emits individual positioned glyphs, preserving shaping and extraction text. */
export function drawShapedRun(page: PDFPage, { text, pdfFont, size, x, y, color, direction }: { text: string; pdfFont: PDFFont; size: number; x: number; y: number; color: Color; direction?: BidiDirection }): void {
  const fk = fontkitFont(pdfFont);
  if (!fk) throw new Error('drawShapedRun requires a font with a reachable fontkit instance');
  const composedText = composeHebrewClusters(text, (cp) => fk.hasGlyphForCodePoint(cp));
  const { glyphs, positions } = fk.layout(composedText, undefined, undefined, undefined, direction);
  const scale = size / fk.unitsPerEm;
  const fontKey = fontDictionaryKey(page, pdfFont);
  const actualText = direction === 'rtl' ? Array.from(text).reverse().join('') : text;
  const actualTextProps = page.doc.context.obj({ ActualText: PDFHexString.fromText(actualText) });
  const beginSpan = PDFOperator.of(
    PDFOperatorNames.BeginMarkedContentSequence,
    [PDFName.of('Span'), actualTextProps] as unknown as Parameters<typeof PDFOperator.of>[1],
  );
  const ops = [pushGraphicsState(), beginSpan, beginText(), setFillingColor(color), setFontAndSize(fontKey, size)];
  let pen = x;
  glyphs.forEach((glyph, i) => {
    const { xOffset, yOffset, xAdvance } = positions[i];
    const rise = yOffset * scale;
    ops.push(setTextMatrix(1, 0, 0, 1, pen + xOffset * scale, y));
    if (rise) ops.push(setTextRise(rise));
    ops.push(showText(PDFHexString.of(gidHex(remapGlyphForSubset(pdfFont, glyph)))));
    if (rise) ops.push(setTextRise(0));
    pen += xAdvance * scale;
  });
  ops.push(endText(), endMarkedContent(), popGraphicsState());
  page.pushOperators(...ops);
}

function toShapingSegments(run: { text: string; direction: BidiDirection }): { text: string; direction: BidiDirection }[] {
  const parts = run.text.split(/( )/).filter((part) => part !== '');
  const ordered = run.direction === 'rtl' ? [...parts].reverse() : parts;
  return ordered.map((text) => ({ text, direction: run.direction }));
}

export async function serializeText(element: TextElement, { page, pdfWidth, pdfX, pdfY, loadCustomFont, baselineOffset }: SerializeContext): Promise<void> {
  const { text, fontSize, fontFamily, fontWeight, fontStyle, color } = element;
  const textValue = text || '';
  if (!textValue) return;
  const typography = resolveTypography(fontFamily, textValue, fontWeight, fontStyle, fontSize);
  const fontSizeInPoints = typography.size;
  const resolvedFont = (await loadCustomFont(typography.family, typography.weight, typography.style))
    || (await loadCustomFont('Arimo', 'normal', 'normal'));
  if (!resolvedFont) throw new Error('Unable to load a PDF font for text export');
  const { r, g, b } = hexToRgbFractions(color);
  const baselineAdjustedY = pdfY - fontSizeInPoints * (baselineOffset(resolvedFont) + typography.paddingEm);
  const lineHeight = fontSizeInPoints * DEFAULT_LINE_HEIGHT_EM;
  const isRtl = getEffectiveTextDirection(element) === 'rtl';

  if (isComb(element)) {
    const widthPoints = ((element.width || 0) / 100) * pdfWidth;
    const cellCount = combCellCount(element);
    const boxLeft = isRtl ? pdfX - widthPoints : pdfX;
    combCharacters(element).slice(0, cellCount).forEach((rawChar, index) => {
      const char = stripInvisibleFormatting(rawChar);
      if (!char.trim()) return;
      const center = boxLeft + combCellCenterFraction(index, cellCount, isRtl) * widthPoints;
      const cellWidth = shapedWidth(resolvedFont, char, fontSizeInPoints);
      if (cellWidth === null) {
        const charWidth = resolvedFont.widthOfTextAtSize(char, fontSizeInPoints);
        page.drawText(char, { x: center - charWidth / 2, y: baselineAdjustedY, size: fontSizeInPoints, font: resolvedFont, color: rgb(r, g, b) });
        return;
      }
      drawShapedRun(page, { text: char, pdfFont: resolvedFont, size: fontSizeInPoints, x: center - cellWidth / 2, y: baselineAdjustedY, color: rgb(r, g, b) });
    });
    return;
  }

  const paragraphDirection: BidiDirection = isRtl ? 'rtl' : 'ltr';
  textValue.split(/\r?\n/).forEach((rawLine, lineIndex) => {
    const line = normalizeTabsForBidi(rawLine);
    const y = baselineAdjustedY - lineIndex * lineHeight;
    const runs = resolveBidiRuns(line, paragraphDirection)
      .map((run) => ({ ...run, text: stripInvisibleFormatting(run.text) }))
      .filter((run) => run.text !== '')
      .flatMap(toShapingSegments);
    const runWidths = runs.map((run) => shapedWidth(resolvedFont, run.text, fontSizeInPoints, run.direction));
    if (runWidths.some((runWidth) => runWidth === null)) {
      const fallbackLine = stripInvisibleFormatting(line);
      const width = resolvedFont.widthOfTextAtSize(fallbackLine, fontSizeInPoints);
      page.drawText(fallbackLine, { x: isRtl ? pdfX - width : pdfX, y, size: fontSizeInPoints, font: resolvedFont, color: rgb(r, g, b) });
      return;
    }
    const lineWidth = (runWidths as number[]).reduce((sum, runWidth) => sum + runWidth, 0);
    let pen = isRtl ? pdfX - lineWidth : pdfX;
    runs.forEach((run, runIndex) => {
      const runWidth = runWidths[runIndex] as number;
      drawShapedRun(page, { text: run.text, pdfFont: resolvedFont, size: fontSizeInPoints, x: pen, y, color: rgb(r, g, b), direction: run.direction });
      pen += runWidth;
    });
  });
}
