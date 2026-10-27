import {
  PDFName,
  PDFArray,
  PDFStream,
  StandardFontEmbedder,
  decodePDFRawStream,
} from '@cantoo/pdf-lib';
import { lookupDict, numberAt } from './dictReads.js';

/** Default vertical extent as a fraction of font size, when the font omits them. */
export const FALLBACK_ASCENT = 0.75;
export const FALLBACK_DESCENT = -0.25;

/**
 * The Wingdings family a BaseFont names, or undefined: the `/ABCDEE+` subset tag, `#20` escapes and a
 * `,Bold` style are not part of it.
 */
function symbolFontFamily(baseFont) {
  const name = baseFont
    .replace(/^\//, '')
    .replace(/#([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/^[A-Z]{6}\+/, '');
  const match = /^Wingdings\s*(2)?(?:[,-].*)?$/i.exec(name);
  if (!match) return undefined;
  return match[1] ? 'wingdings2' : 'wingdings';
}

/**
 * Parses a `ToUnicode` CMap far enough to recognise a checkbox glyph
 * (`isCheckboxGlyph`), the one thing this module still needs a code's Unicode
 * value for. What a text object says is no longer decoded here: Delete's
 * preview comes from the glyph read (RED-16, `deletePreviews.ts`).
 *
 * Only `bfchar` and `bfrange` are handled. A miss means the code is not taken
 * for a checkbox.
 */
function parseToUnicode(bytes) {
  const map = new Map();
  if (!bytes) return map;

  let text = '';
  for (let i = 0; i < bytes.length; i += 1) text += String.fromCharCode(bytes[i]);

  const toStr = (hex) => {
    let out = '';
    for (let i = 0; i + 3 < hex.length + 1; i += 4) {
      const unit = parseInt(hex.slice(i, i + 4), 16);
      if (Number.isFinite(unit)) out += String.fromCharCode(unit);
    }
    return out;
  };

  const charBlocks = text.match(/beginbfchar([\s\S]*?)endbfchar/g) || [];
  for (const block of charBlocks) {
    const pairs = block.match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g) || [];
    for (const pair of pairs) {
      const [, src, dst] = pair.match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/);
      map.set(parseInt(src, 16), toStr(dst));
    }
  }

  const rangeBlocks = text.match(/beginbfrange([\s\S]*?)endbfrange/g) || [];
  for (const block of rangeBlocks) {
    const simple =
      block.match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g) || [];
    for (const entry of simple) {
      const [, lo, hi, dst] = entry.match(
        /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/,
      );
      const start = parseInt(lo, 16);
      const end = parseInt(hi, 16);
      const base = parseInt(dst, 16);
      if (!Number.isFinite(base) || end - start > 0xffff) continue;
      for (let code = start; code <= end; code += 1) {
        map.set(code, String.fromCharCode(base + (code - start)));
      }
    }
  }

  return map;
}

const STANDARD_14 = new Set([
  'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique',
  'Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic',
  'Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique',
  'Symbol', 'ZapfDingbats',
]);

/** A Type1/TrueType font's name without its `ABCDEF+` subset tag, when it is one of the standard 14. */
function standardFontName(baseFont) {
  const name = baseFont.replace(/^\//, '').replace(/^[A-Z]{6}\+/, '');
  return STANDARD_14.has(name) ? name : undefined;
}

/** The /Differences of an /Encoding dictionary as code -> glyph name. */
function readDifferences(context, encoding) {
  const names = new Map();
  const differences = context.lookup(encoding?.get?.(PDFName.of('Differences')));
  if (!(differences instanceof PDFArray)) return names;
  let code = 0;
  for (let i = 0; i < differences.size(); i += 1) {
    const item = context.lookup(differences.get(i));
    if (item instanceof PDFName) {
      names.set(code, item.asString().slice(1));
      code += 1;
    } else if (typeof item?.asNumber === 'function') {
      code = item.asNumber();
    }
  }
  return names;
}

/**
 * Per-code widths (1/1000 em) of a standard-14 font from the AFM metrics pdf-lib ships. A code's
 * glyph is its /Differences name, else the built-in name (Symbol, ZapfDingbats) or the WinAnsi
 * name, which is what StandardEncoding and MacRoman share for printable ASCII.
 */
function standardFontWidths(context, name, encoding) {
  const embedder = StandardFontEmbedder.for(name);
  const { font } = embedder;
  const differences = readDifferences(context, encoding);
  // The embedder's own encoding table: code -> glyph name for WinAnsi, Symbol and ZapfDingbats.
  const builtIn = new Map();
  for (const codePoint of embedder.encoding.supportedCodePoints) {
    const { code, name: glyph } = embedder.encoding.encodeUnicodeCodePoint(codePoint);
    if (!builtIn.has(code)) builtIn.set(code, glyph);
  }
  const widths = new Map();
  for (let code = 0; code < 256; code += 1) {
    const glyph = differences.get(code) ?? builtIn.get(code);
    const width = glyph ? font.getWidthOfGlyph(glyph) : undefined;
    if (typeof width === 'number') widths.set(code, width);
  }
  return widths;
}

/** True when an /Encoding CMap stream declares vertical writing. */
function isVerticalCMap(context, encoding) {
  if (!(encoding instanceof PDFStream)) return false;
  if (numberAt(context, encoding.dict, 'WMode') === 1) return true;
  try {
    return /\/WMode\s+1\s+def/.test(
      new TextDecoder('latin1').decode(decodePDFRawStream(encoding).decode()),
    );
  } catch { // expected: an undecodable CMap stream is simply not vertical
    return false;
  }
}

/** Every `[first [w1 w2 ...]]` and `[first last w]` entry of a CIDFont /W array, into `widths`. */
function readCidWidths(context, w, widths) {
  let i = 0;
  while (i < w.size()) {
    const first = context.lookup(w.get(i))?.asNumber?.();
    const second = context.lookup(w.get(i + 1));
    if (second instanceof PDFArray) {
      // `c [w1 w2 ...]`: consecutive codes starting at c.
      for (let k = 0; k < second.size(); k += 1) {
        const width = context.lookup(second.get(k))?.asNumber?.();
        if (Number.isFinite(width)) widths.set(first + k, width);
      }
      i += 2;
    } else {
      // `cFirst cLast w`: one width across an inclusive range.
      const last = second?.asNumber?.();
      const width = context.lookup(w.get(i + 2))?.asNumber?.();
      if (Number.isFinite(last) && Number.isFinite(width) && last - first <= 0xffff) {
        for (let code = first; code <= last; code += 1) widths.set(code, width);
      }
      i += 3;
    }
  }
}

/**
 * The metrics of a composite (Type0) font.
 *
 * Assumes Identity-H style 2-byte codes, which is what every subsetting
 * producer we have seen emits. A non-identity CMap would need its own
 * codespace walk; widths then fall back to /DW, which keeps the box roughly
 * right instead of collapsing it.
 */
function readType0Metrics(context, fontDict) {
  const widths = new Map();
  const encoding = context.lookup(fontDict.get(PDFName.of('Encoding')));
  const vertical = /-V$/.test(encoding?.asString?.() ?? '') || isVerticalCMap(context, encoding);
  const metrics = { twoByte: true, vertical, widths, defaultWidth: 500, widthScale: 0.001, descriptor: undefined };
  const descendants = context.lookup(fontDict.get(PDFName.of('DescendantFonts')));
  const descendant =
    descendants instanceof PDFArray ? lookupDict(context, descendants.get(0)) : undefined;
  if (!descendant) return metrics;

  metrics.defaultWidth = numberAt(context, descendant, 'DW') ?? 1000;
  metrics.descriptor = lookupDict(context, descendant.get(PDFName.of('FontDescriptor')));
  const w = context.lookup(descendant.get(PDFName.of('W')));
  if (w instanceof PDFArray) readCidWidths(context, w, widths);
  return metrics;
}

/** The /Widths array of a simple font, `firstChar` onward, into `widths`. */
function readWidthsArray(context, widthArray, firstChar, widths) {
  for (let i = 0; i < widthArray.size(); i += 1) {
    const width = context.lookup(widthArray.get(i))?.asNumber?.();
    if (Number.isFinite(width)) widths.set(firstChar + i, width);
  }
}

/** A Type3 font's glyph-space-to-text-space scale from /FontMatrix, 0.001 when it gives none. */
function type3WidthScale(context, fontDict) {
  const matrix = context.lookup(fontDict.get(PDFName.of('FontMatrix')));
  const scale = matrix instanceof PDFArray ? context.lookup(matrix.get(0))?.asNumber?.() : undefined;
  return Number.isFinite(scale) && scale > 0 ? scale : 0.001;
}

/** The metrics of a simple (single-byte) font: Type1, TrueType, Type3. */
function readSimpleMetrics(context, fontDict, subtype, baseFont) {
  const widths = new Map();
  const descriptor = lookupDict(context, fontDict.get(PDFName.of('FontDescriptor')));
  const widthArray = context.lookup(fontDict.get(PDFName.of('Widths')));
  if (widthArray instanceof PDFArray) {
    readWidthsArray(context, widthArray, numberAt(context, fontDict, 'FirstChar') ?? 0, widths);
  }
  const missingWidth = numberAt(context, descriptor, 'MissingWidth');
  const standardName = standardFontName(baseFont);
  let defaultWidth = missingWidth ?? 500;
  if (widthArray instanceof PDFArray) {
    // A code outside the array has no width of its own (PDF 32000-1, 9.6.2.1).
    defaultWidth = missingWidth ?? 0;
  } else if (standardName && subtype !== '/Type3') {
    const encoding = context.lookup(fontDict.get(PDFName.of('Encoding')));
    for (const [code, width] of standardFontWidths(context, standardName, encoding)) {
      widths.set(code, width);
    }
  }
  // Type3 widths are in glyph space, which /FontMatrix maps to text space.
  const widthScale = subtype === '/Type3' ? type3WidthScale(context, fontDict) : 0.001;
  return { twoByte: false, vertical: false, widths, defaultWidth, widthScale, descriptor };
}

/** The ToUnicode CMap of a font as code -> string, empty when it has none. */
function readToUnicode(context, fontDict) {
  const stream = context.lookup(fontDict.get(PDFName.of('ToUnicode')));
  return stream instanceof PDFStream ? parseToUnicode(decodePDFRawStream(stream).decode()) : new Map();
}

/**
 * Reads the metrics we need to advance the text cursor: per-code widths, the
 * code size, and the vertical extent of a line.
 */
function readFont(context, fontDict) {
  const subtype = context.lookup(fontDict.get(PDFName.of('Subtype')))?.asString?.();
  const baseFont = context.lookup(fontDict.get(PDFName.of('BaseFont')))?.asString?.() || '';
  const toUnicode = readToUnicode(context, fontDict);
  const { descriptor, ...metrics } = subtype === '/Type0'
    ? readType0Metrics(context, fontDict)
    : readSimpleMetrics(context, fontDict, subtype, baseFont);

  const ascent = numberAt(context, descriptor, 'Ascent');
  const descent = numberAt(context, descriptor, 'Descent');

  return {
    ...metrics,
    toUnicode,
    isZapfDingbats: /ZapfDingbats/i.test(baseFont),
    symbolFamily: symbolFontFamily(baseFont),
    ascent: Number.isFinite(ascent) ? ascent / 1000 : FALLBACK_ASCENT,
    descent: Number.isFinite(descent) ? descent / 1000 : FALLBACK_DESCENT,
  };
}

export function buildFontTable(context, resources) {
  const table = new Map();
  const fonts = lookupDict(context, resources?.get(PDFName.of('Font')));
  if (!fonts) return table;
  for (const [key, value] of fonts.entries()) {
    const dict = lookupDict(context, value);
    if (dict) table.set(key.asString(), readFont(context, dict));
  }
  return table;
}

/** Splits a shown string into character codes for this font. */
export function decodeCodes(bytes, font) {
  const codes = [];
  if (font?.twoByte) {
    for (let i = 0; i + 1 < bytes.length; i += 2) codes.push((bytes[i] << 8) | bytes[i + 1]);
  } else {
    for (let i = 0; i < bytes.length; i += 1) codes.push(bytes[i]);
  }
  return codes;
}
