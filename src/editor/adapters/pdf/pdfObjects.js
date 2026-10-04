import {
  PDFName,
  PDFArray,
  PDFDict,
  PDFRef,
  PDFStream,
  StandardFontEmbedder,
  decodePDFRawStream,
} from '@cantoo/pdf-lib';
import {
  tokenize,
  multiplyMatrix,
  applyMatrix,
  transformedUnitBox,
} from './contentStream.js';
import { reportError } from '../../../lib/errorReport.ts';

/**
 * Finds the discrete drawing operations on a page and where they live in its
 * content stream, so a single one can be deleted without disturbing the rest.
 *
 * Two kinds are reported, and only these two, because they are the ones a PDF
 * genuinely stores as self-contained units:
 *   - `image`: one `cm ... /Name Do` placement of an image XObject, carrying
 *     `imageRef` ("12 0 R") so the same picture drawn on several pages can be
 *     recognised as one object. Inline images are not reported.
 *   - `text`:  one show-text operation (`Tj`, `TJ`, `'` or `"`) and its operands
 *     (RED-54). Carries `replacement`, the advance-only `TJ` that stands in for
 *     it when deleted so what follows in the text object keeps its position.
 *
 * A `BT`/`ET` block is whatever the producing tool chose to emit, and a form
 * can draw a whole table in one, so it is not the unit. Blocks are reported
 * separately as `blocks`, only so a deletion saved when the block was the
 * unit still matches. A vertical-writing font keeps the whole block as its unit.
 */

const IDENTITY = [1, 0, 0, 1, 0, 0];

/** Default vertical extent as a fraction of font size, when the font omits them. */
const FALLBACK_ASCENT = 0.75;
const FALLBACK_DESCENT = -0.25;

// A checkbox is often a text glyph rather than a painted rectangle. These are
// the Unicode characters fonts commonly expose for that job. Zapf Dingbats is
// a special case below because many real PDFs omit its ToUnicode map entirely.
const CHECKBOX_GLYPHS = new Set(['\u2610', '\u25a1', '\u274f', '\u2751']);
// Wingdings prints its checkboxes as ordinary characters, so the character alone says nothing:
// 0x6F draws a box in Wingdings and is a letter in Times. These are the codes that draw an empty
// box, by symbol-font family (FORM-20); a bullet (Wingdings 0x6C) or any other code is not here.
// Wingdings: the square family (0x6F, 0x71, and the plain 0xA8). Wingdings 2 0x2A is the box
// สปส.1-10 prints its four checkboxes with, confirmed against the embedded glyph's outline (two
// nested rectangles, 1086 x 1086 of 2048 em), not assumed from a table.
const SYMBOL_FONT_CHECKBOX_CODES = {
  wingdings: new Set([0x6f, 0x71, 0xa8]),
  wingdings2: new Set([0x2a]),
};
// In the standard Zapf Dingbats encoding these are ❏ and ❑ respectively.
const ZAPF_DINGBATS_CHECKBOX_CODES = new Set([0x6f, 0x71]);
// The square a person sees inside each of those glyphs, in glyph space
// (1000/em) as [x0, y0, x1, y1]. The font-wide ascent/descent box is wrong
// for them: it runs from the descender to the ascender across the whole
// advance, so a tick centred on it lands low and to the right, over the drop
// shadow (SNG-09, measured 2026-09-26: ~0.6pt right, ~0.6pt low on form 101).
// Provenance: the inner (hole) contour of a74/a75 in the ZapfDingbats subset
// embedded in income-tax-101-2024.pdf (UIVCMF+ZapfDingbats, read with
// @pdf-lib/fontkit). The outer contour, x[35,725] y[0,692] for ❑, includes
// the shadow. pdf.js's FoxitDingbats, drawn when a file does not embed the
// font, agrees: ❑ exactly, ❏ within 8/1000 em (x[64,597] y[126,662]).
const ZAPF_DINGBATS_CHECKBOX_SQUARES = new Map([
  [0x6f, [64, 134, 590, 662]],
  [0x71, [66, 123, 598, 660]],
]);

// The square a person sees inside each Wingdings box glyph that has one, in glyph space (1000/em)
// as [x0, y0, x1, y1], by family and code (FORM-31). The font-wide ascent/descent box is wrong for
// them as it is for Zapf's: for 0x71 it is 12.6 x 9.7pt around a 10.1pt glyph, 2.2pt high.
// Provenance: contours of the glyphs embedded in btl-bl211-2015.pdf (Wingdings 0x71, subset gid 137)
// and thai-sso-1-10.pdf (Wingdings 2 0x2A, gid 13), and of Wingdings.ttf for 0x6F, which no scored
// form embeds (the two fonts agree on 0x71 and 0x2A exactly). 0x6F and 0x71 are boxes with a drop
// shadow, so the box is the inner (hole) contour: the outer contour, x[84,807] y[0,723], includes the
// shadow. 0x2A is a ring, whose hole is only the paper inside the stroke, so the box is its outer
// edge. 0xA8 is one contour with no hole to read a square from, so it keeps the line box.
const SYMBOL_FONT_CHECKBOX_SQUARES = {
  wingdings: new Map([
    [0x6f, [181, 96, 711, 626]],
    [0x71, [133, 145, 663, 675]],
  ]),
  wingdings2: new Map([[0x2a, [84, 0, 615, 530]]]),
};

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

/** A number as a content stream may write it: plain decimal, never exponent notation. */
const pdfNumber = (n) => String(Number(n.toFixed(4)));

/** Baseline drift allowed between joined show ops, as a fraction of the font size. */
const JOIN_BASELINE_TOLERANCE = 0.1;
/** Gap allowed between one op's end and the next op's start, as a fraction of the font size. */
const JOIN_GAP_TOLERANCE = 0.3;

const unionBox = (a, b) => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
};

/** The byte range of an inline BDC dict that may carry the text it marks, else null. */
function textDictRange(token) {
  const carries = token?.type === 'dict'
    && token.value.some((t) => t.type === 'name' && ['ActualText', 'Alt', 'E'].includes(t.value));
  return carries ? { start: token.start, end: token.end } : null;
}

/** The distinct dict ranges among several units' `strip` lists. */
const unionStrips = (lists) => {
  const byStart = new Map();
  for (const range of lists.flat().filter(Boolean)) byStart.set(range.start, range);
  return [...byStart.values()];
};

/**
 * Joins the show ops of one text object that read as a single run (RED-54): a producer that places
 * one glyph per op (`Tm (x) Tj`) would otherwise offer one Delete target per character. Ops join
 * when they share a font and size, sit on one baseline, and the next starts within a small gap of
 * where the previous ended (plain distance, so visual-order RTL glyphs placed left to right join).
 * A joined unit carries `parts`, the replacement of each op, so a delete keeps the positioning
 * operators between them. A lone op keeps its own `replacement` and has no `parts`.
 *
 * @param {Array<{run: {fontKey, size, scale, from: number[], to: number[]}}>} ops units in stream order
 */
function joinRuns(ops) {
  const groups = [];
  for (const op of ops) {
    const group = groups[groups.length - 1];
    const prev = group?.[group.length - 1];
    const { run } = op;
    const unit = run.size * run.scale;
    const joins = prev
      && prev.run.fontKey === run.fontKey
      && prev.run.size === run.size
      && Math.abs(run.from[1] - prev.run.from[1]) <= JOIN_BASELINE_TOLERANCE * unit
      && Math.hypot(run.from[0] - prev.run.to[0], run.from[1] - prev.run.to[1]) <= JOIN_GAP_TOLERANCE * unit;
    if (joins) group.push(op);
    else groups.push([op]);
  }
  return groups.map((group) => {
    const withoutRun = ({ run, ...unit }) => unit;
    if (group.length === 1) return withoutRun(group[0]);
    const { replacement, ...first } = withoutRun(group[0]);
    const strips = unionStrips(group.map((op) => op.strip));
    return {
      ...first,
      ...(strips.length ? { strip: strips } : {}),
      bbox: group.reduce((box, op) => unionBox(box, op.bbox), group[0].bbox),
      end: group[group.length - 1].end,
      parts: group.map((op) => ({ start: op.start, end: op.end, replacement: op.replacement })),
    };
  });
}

function lookupDict(context, value) {
  const resolved = context.lookup(value);
  return resolved instanceof PDFDict ? resolved : undefined;
}

function numberAt(context, dict, key) {
  const value = context.lookup(dict?.get(PDFName.of(key)));
  const n = value?.asNumber?.();
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

/**
 * Concatenates a page's content streams into one buffer.
 *
 * A page may carry an array of streams that are logically joined; offsets we
 * report are into this joined buffer, and `applyDeletions` writes back a single
 * merged stream so the two stay consistent.
 */
export function getPageContentBytes(page) {
  const context = page.doc.context;
  const contents = context.lookup(page.node.get(PDFName.of('Contents')));

  const streams = [];
  if (contents instanceof PDFStream) {
    streams.push(contents);
  } else if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i += 1) {
      const entry = context.lookup(contents.get(i));
      if (entry instanceof PDFStream) streams.push(entry);
    }
  }

  const parts = streams.map((stream) => decodePDFRawStream(stream).decode());
  if (parts.length === 0) return new Uint8Array(0);
  if (parts.length === 1) return parts[0];

  // Streams are joined with a newline: the spec allows a lexical token to end
  // at a stream boundary, so butting them together could fuse two operators.
  const total = parts.reduce((sum, part) => sum + part.length + 1, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
    joined[offset] = 0x0a;
    offset += 1;
  }
  return joined;
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

/**
 * Reads the metrics we need to advance the text cursor: per-code widths, the
 * code size, and the vertical extent of a line.
 */
function readFont(context, fontDict) {
  const subtype = context.lookup(fontDict.get(PDFName.of('Subtype')))?.asString?.();
  const baseFont = context.lookup(fontDict.get(PDFName.of('BaseFont')))?.asString?.() || '';
  const widths = new Map();
  let defaultWidth = 500;
  let widthScale = 0.001;
  let twoByte = false;
  let vertical = false;

  const toUnicodeStream = context.lookup(fontDict.get(PDFName.of('ToUnicode')));
  const toUnicode =
    toUnicodeStream instanceof PDFStream
      ? parseToUnicode(decodePDFRawStream(toUnicodeStream).decode())
      : new Map();

  let descriptor;

  if (subtype === '/Type0') {
    // Assumes Identity-H style 2-byte codes, which is what every subsetting
    // producer we have seen emits. A non-identity CMap would need its own
    // codespace walk; widths then fall back to /DW, which keeps the box roughly
    // right instead of collapsing it.
    twoByte = true;
    const encoding = context.lookup(fontDict.get(PDFName.of('Encoding')));
    vertical = /-V$/.test(encoding?.asString?.() ?? '') || isVerticalCMap(context, encoding);
    const descendants = context.lookup(fontDict.get(PDFName.of('DescendantFonts')));
    const descendant =
      descendants instanceof PDFArray ? lookupDict(context, descendants.get(0)) : undefined;

    if (descendant) {
      defaultWidth = numberAt(context, descendant, 'DW') ?? 1000;
      descriptor = lookupDict(context, descendant.get(PDFName.of('FontDescriptor')));

      const w = context.lookup(descendant.get(PDFName.of('W')));
      if (w instanceof PDFArray) {
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
    }
  } else {
    descriptor = lookupDict(context, fontDict.get(PDFName.of('FontDescriptor')));
    const firstChar = numberAt(context, fontDict, 'FirstChar') ?? 0;
    const widthArray = context.lookup(fontDict.get(PDFName.of('Widths')));
    if (widthArray instanceof PDFArray) {
      for (let i = 0; i < widthArray.size(); i += 1) {
        const width = context.lookup(widthArray.get(i))?.asNumber?.();
        if (Number.isFinite(width)) widths.set(firstChar + i, width);
      }
    }
    const missingWidth = numberAt(context, descriptor, 'MissingWidth');
    const standardName = standardFontName(baseFont);
    if (widthArray instanceof PDFArray) {
      // A code outside the array has no width of its own (PDF 32000-1, 9.6.2.1).
      defaultWidth = missingWidth ?? 0;
    } else if (standardName && subtype !== '/Type3') {
      const encoding = context.lookup(fontDict.get(PDFName.of('Encoding')));
      for (const [code, width] of standardFontWidths(context, standardName, encoding)) {
        widths.set(code, width);
      }
      defaultWidth = missingWidth ?? 500;
    } else {
      defaultWidth = missingWidth ?? 500;
    }
    if (subtype === '/Type3') {
      // Type3 widths are in glyph space, which /FontMatrix maps to text space.
      const matrix = context.lookup(fontDict.get(PDFName.of('FontMatrix')));
      const scale = matrix instanceof PDFArray ? context.lookup(matrix.get(0))?.asNumber?.() : undefined;
      if (Number.isFinite(scale) && scale > 0) widthScale = scale;
    }
  }

  const ascent = numberAt(context, descriptor, 'Ascent');
  const descent = numberAt(context, descriptor, 'Descent');

  return {
    twoByte,
    vertical,
    widths,
    defaultWidth,
    widthScale,
    toUnicode,
    isZapfDingbats: /ZapfDingbats/i.test(baseFont),
    symbolFamily: symbolFontFamily(baseFont),
    ascent: Number.isFinite(ascent) ? ascent / 1000 : FALLBACK_ASCENT,
    descent: Number.isFinite(descent) ? descent / 1000 : FALLBACK_DESCENT,
  };
}

function buildFontTable(context, resources) {
  const table = new Map();
  const fonts = lookupDict(context, resources?.get(PDFName.of('Font')));
  if (!fonts) return table;
  for (const [key, value] of fonts.entries()) {
    const dict = lookupDict(context, value);
    if (dict) table.set(key.asString(), readFont(context, dict));
  }
  return table;
}

function buildXObjectTable(context, resources) {
  const table = new Map();
  const xobjects = lookupDict(context, resources?.get(PDFName.of('XObject')));
  if (!xobjects) return table;
  for (const [key, value] of xobjects.entries()) {
    const stream = context.lookup(value);
    if (!(stream instanceof PDFStream)) continue;
    const subtype = context.lookup(stream.dict.get(PDFName.of('Subtype')))?.asString?.();
    table.set(key.asString(), {
      isImage: subtype === '/Image',
      // A Form XObject is walked in place (RED-29). Only an indirect one can
      // be named in a `formPath`, and a direct stream is not legal PDF anyway.
      form: subtype === '/Form' && value instanceof PDFRef ? { ref: value, stream } : undefined,
      // The indirect reference as "12 0 R", the same on every page that draws
      // this one image (RED-26). Absent for a direct (inline-in-dict) stream.
      imageRef: value instanceof PDFRef ? value.tag : undefined,
    });
  }
  return table;
}

/** Splits a shown string into character codes for this font. */
function decodeCodes(bytes, font) {
  const codes = [];
  if (font?.twoByte) {
    for (let i = 0; i + 1 < bytes.length; i += 2) codes.push((bytes[i] << 8) | bytes[i + 1]);
  } else {
    for (let i = 0; i < bytes.length; i += 1) codes.push(bytes[i]);
  }
  return codes;
}

/**
 * The character a symbol font means by `code`: a single-byte code is itself, and a two-byte font
 * reports it through its ToUnicode map in the private-use range U+F020-F0FF (Word's way of
 * embedding Wingdings), where the low byte is the Wingdings code.
 */
function symbolCode(font, code) {
  const unicode = font.toUnicode.get(code)?.codePointAt(0);
  if (unicode !== undefined && unicode >= 0xf020 && unicode <= 0xf0ff) return unicode - 0xf000;
  return font.twoByte ? undefined : code;
}

function isCheckboxGlyph(font, code) {
  if (font?.symbolFamily && SYMBOL_FONT_CHECKBOX_CODES[font.symbolFamily].has(symbolCode(font, code))) return true;
  return (font?.isZapfDingbats && ZAPF_DINGBATS_CHECKBOX_CODES.has(code))
    || CHECKBOX_GLYPHS.has(font?.toUnicode.get(code));
}

/**
 * Axis-aligned PDF-space bounds of a text-space rectangle under the current
 * text and graphics transforms.
 */
function textGlyphBox(tm, ctm, x0, y0, x1, y1) {
  const trm = multiplyMatrix(tm, ctm);
  const corners = [
    applyMatrix(trm, x0, y0),
    applyMatrix(trm, x1, y0),
    applyMatrix(trm, x0, y1),
    applyMatrix(trm, x1, y1),
  ];
  const xs = corners.map((corner) => corner[0]);
  const ys = corners.map((corner) => corner[1]);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

/**
 * Collects checkbox glyph bounds from a page's text layer.
 *
 * A surprising number of official forms use Zapf Dingbats characters for
 * their checkboxes. They look like rectangles on screen, but are emitted with
 * `Tj`, not `re`, so the vector-ink collector quite correctly cannot see
 * them. We intentionally recognize only the standard checkbox codes and
 * Unicode-mapped checkbox glyphs, never arbitrary square-ish text, so an
 * ordinary letter cannot become a false target.
 *
 * @param {import('@cantoo/pdf-lib').PDFPage} page
 * @returns {Array<{x: number, y: number, width: number, height: number}>}
 */
export function collectCheckboxGlyphs(page) {
  const context = page.doc.context;
  const resources = lookupDict(context, page.node.get(PDFName.of('Resources')));
  const fonts = buildFontTable(context, resources);
  const tokens = tokenize(getPageContentBytes(page));
  const boxes = [];

  let ctm = IDENTITY;
  const ctmStack = [];
  let operands = [];
  let inText = false;
  let tm = IDENTITY;
  let tlm = IDENTITY;
  let font = null;
  let fontSize = 0;
  let charSpacing = 0;
  let wordSpacing = 0;
  let horizontalScale = 1;
  let leading = 0;
  let rise = 0;

  const num = (index) => {
    const token = operands[index];
    return token?.type === 'number' ? token.value : 0;
  };
  const nextLine = (tx, ty) => {
    tlm = multiplyMatrix([1, 0, 0, 1, tx, ty], tlm);
    tm = tlm;
  };
  const showString = (bytes) => {
    const codes = decodeCodes(bytes, font);
    const ascent = (font?.ascent ?? FALLBACK_ASCENT) * fontSize + rise;
    const descent = (font?.descent ?? FALLBACK_DESCENT) * fontSize + rise;
    for (const code of codes) {
      const glyphWidth = (font?.widths.get(code) ?? font?.defaultWidth ?? 500) * (font?.widthScale ?? 0.001);
      const applyWordSpacing = !font?.twoByte && code === 32;
      const advance = (
        glyphWidth * fontSize + charSpacing + (applyWordSpacing ? wordSpacing : 0)
      ) * horizontalScale;
      const square = font?.isZapfDingbats
        ? ZAPF_DINGBATS_CHECKBOX_SQUARES.get(code)
        : font?.symbolFamily && SYMBOL_FONT_CHECKBOX_SQUARES[font.symbolFamily].get(symbolCode(font, code));
      if (square) {
        const [x0, y0, x1, y1] = square;
        const sx = (fontSize * horizontalScale) / 1000;
        const sy = fontSize / 1000;
        boxes.push(textGlyphBox(tm, ctm, x0 * sx, y0 * sy + rise, x1 * sx, y1 * sy + rise));
      } else if (isCheckboxGlyph(font, code)) {
        boxes.push(textGlyphBox(tm, ctm, 0, descent, advance, ascent));
      }
      tm = multiplyMatrix([1, 0, 0, 1, advance, 0], tm);
    }
  };

  for (const token of tokens) {
    if (token.type !== 'operator') {
      operands.push(token);
      continue;
    }

    switch (token.value) {
      case 'q':
        ctmStack.push(ctm);
        break;
      case 'Q':
        ctm = ctmStack.pop() ?? IDENTITY;
        break;
      case 'cm':
        ctm = multiplyMatrix([num(0), num(1), num(2), num(3), num(4), num(5)], ctm);
        break;
      case 'BT':
        inText = true;
        tm = IDENTITY;
        tlm = IDENTITY;
        break;
      case 'ET':
        inText = false;
        break;
      case 'Tf': {
        const name = operands[operands.length - 2];
        font = name?.type === 'name' ? fonts.get(`/${name.value}`) ?? null : null;
        fontSize = num(operands.length - 1);
        break;
      }
      case 'Tc':
        charSpacing = num(operands.length - 1);
        break;
      case 'Tw':
        wordSpacing = num(operands.length - 1);
        break;
      case 'Tz':
        horizontalScale = num(operands.length - 1) / 100;
        break;
      case 'TL':
        leading = num(operands.length - 1);
        break;
      case 'Ts':
        rise = num(operands.length - 1);
        break;
      case 'Tm':
        tlm = [num(0), num(1), num(2), num(3), num(4), num(5)];
        tm = tlm;
        break;
      case 'Td':
        nextLine(num(operands.length - 2), num(operands.length - 1));
        break;
      case 'TD':
        leading = -num(operands.length - 1);
        nextLine(num(operands.length - 2), num(operands.length - 1));
        break;
      case 'T*':
        nextLine(0, -leading);
        break;
      case 'Tj':
      case "'":
      case '"': {
        if (!inText) break;
        if (token.value !== 'Tj') nextLine(0, -leading);
        if (token.value === '"') {
          wordSpacing = num(operands.length - 3);
          charSpacing = num(operands.length - 2);
        }
        const string = operands[operands.length - 1];
        if (string?.type === 'string' || string?.type === 'hexstring') showString(string.value);
        break;
      }
      case 'TJ': {
        if (!inText) break;
        const array = operands[operands.length - 1];
        if (array?.type !== 'array') break;
        for (const item of array.value) {
          if (item.type === 'number') {
            const shift = (-item.value / 1000) * fontSize * horizontalScale;
            tm = multiplyMatrix([1, 0, 0, 1, shift, 0], tm);
          } else if (item.type === 'string' || item.type === 'hexstring') {
            showString(item.value);
          }
        }
        break;
      }
      default:
        break;
    }
    operands = [];
  }

  return boxes;
}

/**
 * Cheaply reports whether a document carries an AcroForm with at least one
 * field, for the MOBI-02 export-flatten decision in sign.js.
 *
 * This deliberately goes through `pdfDoc.catalog.getAcroForm()` - a plain
 * dict lookup - rather than `pdfDoc.getForm()`. `getForm()` strips a
 * document's XFA data as a side effect unless it was loaded with
 * `preserveXFA`, so merely *checking* whether a form exists must not itself
 * be the thing that degrades a hybrid XFA/AcroForm document. This check is
 * also the fast path for the common case of no form at all (both fixtures
 * in `__fixtures__/` have none, per MOBI-03): no widget resolution, no
 * appearance-stream work, just one dict read.
 *
 * @param {import('@cantoo/pdf-lib').PDFDocument} pdfDoc
 * @returns {boolean}
 */
export function hasFillableAcroForm(pdfDoc) {
  const acroForm = pdfDoc.catalog.getAcroForm();
  if (!acroForm) return false;
  return (acroForm.getFields()?.length ?? 0) > 0;
}

/**
 * A field entry as the widget sees it: its own, or the nearest ancestor's.
 *
 * Field attributes are inheritable, and a writer is free to put them anywhere
 * on the chain. `@cantoo/pdf-lib` writes a widget as a child of its field
 * dict rather than merging the two, so on a form it generated `/FT`, `/Ff`,
 * `/T` and `/MaxLen` all sit on the parent and the widget dict carries only
 * `/Rect`, `/F` and `/AP` - reading the widget alone finds nothing at all.
 */
export function inheritedEntry(context, widget, key) {
  let field = widget;
  const seen = new Set();
  while (field instanceof PDFDict && !seen.has(field)) {
    seen.add(field);
    const entry = context.lookup(field.get(PDFName.of(key)));
    if (entry !== undefined) return entry;
    field = context.lookup(field.get(PDFName.of('Parent')));
  }
  return undefined;
}


/** Every `/Widget` annotation on the page, in annotation order. */
export function pageWidgets(page) {
  const context = page.doc.context;
  const annotations = context.lookup(page.node.get(PDFName.of('Annots')));
  if (!(annotations instanceof PDFArray)) return [];
  const widgets = [];
  for (let index = 0; index < annotations.size(); index += 1) {
    const widget = context.lookup(annotations.get(index));
    if (!(widget instanceof PDFDict)) continue;
    if (context.lookup(widget.get(PDFName.of('Subtype')))?.asString?.() !== '/Widget') continue;
    widgets.push(widget);
  }
  return widgets;
}

/**
 * What one widget annotation says about itself, as plain values - the shape
 * `formWidgets.js` (tool:sign) decides on. Defined here, not there: this is
 * the module that actually produces it, and an editor module may not import
 * a tool's type even for documentation only (ARCH-24 step D moved
 * `formWidgets.js` out of editor/adapters/pdf/; `formWidgets.js` now points
 * back at this typedef instead of the other way around).
 *
 * `fieldType`, `fieldFlags` and `maxLen` are *inheritable* field attributes
 * and may come from an ancestor rather than the widget (see `widgetEntries`);
 * `annotationFlags` and `rect` are the widget's own and are never inherited.
 *
 * @typedef {object} WidgetEntry
 * @property {string} [fieldType] `/FT`, as pdf-lib renders a name: `'/Tx'`.
 * @property {number} [annotationFlags] `/F`.
 * @property {number} [fieldFlags] `/Ff`.
 * @property {number} [maxLen] `/MaxLen`.
 * @property {{x: number, y: number, width: number, height: number}} [rect] `/Rect`, normalized.
 */

/**
 * The five entries a widget states about itself, as plain values, for
 * `formWidgets.js` to decide on.
 *
 * `/FT`, `/Ff` and `/MaxLen` are inheritable and go through `inheritedEntry`;
 * `/F` and `/Rect` are the widget's own and are read straight off it. This
 * reads, it does not judge - which widget is worth offering is a pure
 * decision made on the result.
 *
 * @param {import('@cantoo/pdf-lib').PDFContext} context
 * @param {import('@cantoo/pdf-lib').PDFDict} widget
 * @returns {WidgetEntry}
 */
export function widgetEntries(context, widget) {
  return {
    fieldType: inheritedEntry(context, widget, 'FT')?.asString?.(),
    annotationFlags: context.lookup(widget.get(PDFName.of('F')))?.asNumber?.(),
    fieldFlags: inheritedEntry(context, widget, 'Ff')?.asNumber?.(),
    maxLen: inheritedEntry(context, widget, 'MaxLen')?.asNumber?.(),
    rect: context.lookup(widget.get(PDFName.of('Rect')))?.asRectangle?.(),
  };
}

/** Form XObjects nested inside one another are followed this deep, no further. */
const MAX_FORM_DEPTH = 8;

/** A Form XObject's `/Matrix` as six numbers, identity when absent or malformed. */
function formMatrix(context, stream) {
  const array = context.lookup(stream.dict.get(PDFName.of('Matrix')));
  if (!(array instanceof PDFArray) || array.size() !== 6) return IDENTITY;
  const values = [];
  for (let i = 0; i < 6; i += 1) values.push(context.lookup(array.get(i))?.asNumber?.());
  return values.every((v) => Number.isFinite(v)) ? values : IDENTITY;
}

/**
 * Reports every deletable drawing operation on a page, including those the
 * page draws inside Form XObjects (RED-29).
 *
 * Every object carries `formPath`: the `PDFRef` tags ("12 0 R") of the Forms
 * from the page's content down to the stream that holds it, outermost first.
 * `[]` is the page's own content. `start`/`end` are byte offsets into the
 * decoded content of that holding stream (the page's concatenated content
 * for `[]`, else the last Form in `formPath`), and `rect`/`bbox` are always
 * in page space: the page CTM at the `Do`, times the Form's `/Matrix`, times
 * the Form's own `q`/`cm`/`Q` state.
 *
 * A Form drawn more than once on the page is reported for its first `Do`
 * only: a delete rewrites the Form's stream, which would remove every draw,
 * so offering the later ones would promise a deletion that is not local.
 *
 * @param {import('@cantoo/pdf-lib').PDFPage} page
 * @param {number} pageIndex
 * @returns {{objects: Array, bytes: Uint8Array, blocks: Array}} `blocks` are the
 *   `BT ... ET` spans (`start`, `end`, `formPath`, `bbox`), not offered as units
 */
export function extractPageObjects(page, pageIndex = 0) {
  const context = page.doc.context;
  const bytes = getPageContentBytes(page);
  const resources = lookupDict(context, page.node.get(PDFName.of('Resources')));
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const objects = [];
  const blocks = [];
  // Forms already walked on this page. Also the cycle guard: a Form that
  // (indirectly) draws itself finds itself here and stops.
  const walkedForms = new Set();
  // The `/PDkef` mark being read (RED-55), shared with nested Forms: what a
  // mark draws, wherever it draws it, folds into one box and one unit.
  // `owner` is the stream (formPath key) that opened it: only that stream's BMC/BDC/EMC count its depth.
  const closedMark = () => ({
    open: false, owner: '', depth: 0, start: 0, min: null, max: null, imageRefs: new Set(), units: [], drawsForm: false,
  });
  const mark = closedMark();

  walkStream(bytes, resources, IDENTITY, []);

  // Add page-relative percentages with a top-left origin, matching how the
  // editor stores every other element so the UI needs no second convention.
  for (const [index, object] of objects.entries()) {
    const owner = object.formPath.length
      ? `${object.formPath.map((tag) => tag.replace(/ /g, '_')).join('>')}-`
      : '';
    object.id = `obj-${pageIndex}-${owner}${index}`;
    object.rect = {
      left: (object.bbox.x / pageWidth) * 100,
      top: ((pageHeight - object.bbox.y - object.bbox.height) / pageHeight) * 100,
      width: (object.bbox.width / pageWidth) * 100,
      height: (object.bbox.height / pageHeight) * 100,
    };
  }

  return { objects, bytes, blocks };

  /**
   * Walks one content stream, pushing what it draws onto `objects`.
   *
   * @param {Uint8Array} streamBytes decoded content of the holding stream
   * @param {PDFDict|undefined} streamResources
   * @param {number[]} baseCtm matrix mapping this stream's space to the page
   * @param {string[]} formPath
   */
  function walkStream(streamBytes, streamResources, baseCtm, formPath) {
    const tokens = tokenize(streamBytes);
    const fonts = buildFontTable(context, streamResources);
    const xobjects = buildXObjectTable(context, streamResources);

    let ctm = baseCtm;
    const ctmStack = [];
    let operands = [];

    // Text object state, live only between BT and ET.
    let inText = false;
    let textStart = 0;
    let tm = IDENTITY;
    let tlm = IDENTITY;
    let font = null;
    let fontKey = null;
    let fontSize = 0;
    let charSpacing = 0;
    let wordSpacing = 0;
    let horizontalScale = 1;
    let leading = 0;
    let rise = 0;
    let runMin = null;
    let runMax = null;
    // The same for the show operation being read, and the x shift it causes.
    let opMin = null;
    let opMax = null;
    let opShift = 0;
    let opFrom = [0, 0]; // where the show operation starts, in page space (RED-54 join)
    // Units of the open BT..ET, held until ET says whether a vertical font turns them into the block.
    let pending = [];
    let blockVertical = false;

    // Marked-content sequences open in this stream, innermost last. `strip` is the byte range of an
    // inline property dict that may hold a copy of the text (/ActualText, /Alt, /E), else null. A BDC
    // naming a /Properties resource instead is out of scope: its dict is not in the stream to cut.
    const key = formPath.join('>');
    const sequences = [];
    // A dict a show op sits in is read when the op runs: a BDC can open and close inside BT..ET.
    const openStrips = () => sequences.filter((s) => s.strip).map((s) => s.strip);

    // Every unit this stream reports goes through here, so a rule about which
    // units a page offers lives in one place.
    const emit = (object) => {
      if (object.kind === 'text') {
        const strip = unionStrips([object.strip, openStrips()]);
        if (strip.length) object.strip = strip;
      }
      if (mark.open) {
        foldIntoMark(object.bbox);
        if (object.imageRef) mark.imageRefs.add(object.imageRef);
        mark.units.push(object);
      } else objects.push(object);
    };

    // Current path (RED-55): its points in page space, kept only to size a
    // mark; outside a mark a path is never a unit.
    let pathPoints = [];
    let lineWidth = 1;
    const lineWidthStack = [];
    const notePoints = (...coords) => {
      for (let i = 0; i + 1 < coords.length; i += 2) pathPoints.push(applyMatrix(ctm, coords[i], coords[i + 1]));
    };
    const paintPath = () => {
      if (mark.open && pathPoints.length) {
        const xs = pathPoints.map((p) => p[0]);
        const ys = pathPoints.map((p) => p[1]);
        const [a, b, c, d] = ctm;
        const half = (lineWidth * (Math.hypot(a, b) + Math.hypot(c, d))) / 4;
        foldIntoMark({
          x: Math.min(...xs) - half,
          y: Math.min(...ys) - half,
          width: Math.max(...xs) - Math.min(...xs) + 2 * half,
          height: Math.max(...ys) - Math.min(...ys) + 2 * half,
        });
      }
      pathPoints = [];
    };

    const num = (index) => {
      const token = operands[index];
      return token?.type === 'number' ? token.value : 0;
    };

    const noteBox = (box) => {
      const lo = [box.x, box.y];
      const hi = [box.x + box.width, box.y + box.height];
      const grow = (min, max) => (min ? [
        [Math.min(min[0], lo[0]), Math.min(min[1], lo[1])],
        [Math.max(max[0], hi[0]), Math.max(max[1], hi[1])],
      ] : [lo, hi]);
      [runMin, runMax] = grow(runMin, runMax);
      [opMin, opMax] = grow(opMin, opMax);
    };

    const rectOf = (min, max) => ({ x: min[0], y: min[1], width: max[0] - min[0], height: max[1] - min[1] });

    // Ends one show operation: a unit when it showed a glyph. `prefix` is what a `'` or `"` does before
    // showing (it moves the line and, for `"`, sets spacing), which the replacement must repeat.
    const endShow = (firstOperand, token, prefix) => {
      if (font?.vertical) blockVertical = true;
      if (opMin) {
        const trm = multiplyMatrix(tm, ctm);
        const scale = fontSize * horizontalScale;
        const advance = scale ? `[${pdfNumber((-opShift * 1000) / scale)}] TJ` : '';
        pending.push({
          kind: 'text',
          pageIndex,
          formPath,
          bbox: rectOf(opMin, opMax),
          start: firstOperand.start,
          end: token.end,
          replacement: [...prefix, advance].filter(Boolean).join(' '),
          ...(openStrips().length ? { strip: openStrips() } : {}),
          run: {
            fontKey,
            size: fontSize,
            scale: Math.hypot(trm[0], trm[1]) || 1,
            from: opFrom,
            to: applyMatrix(trm, 0, 0),
          },
        });
      }
      opMin = null;
      opMax = null;
      opShift = 0;
    };

    const showString = (bytesOfString) => {
      const codes = decodeCodes(bytesOfString, font);
      const ascent = (font?.ascent ?? FALLBACK_ASCENT) * fontSize + rise;
      const descent = (font?.descent ?? FALLBACK_DESCENT) * fontSize + rise;

      for (const code of codes) {
        const glyphWidth = (font?.widths.get(code) ?? font?.defaultWidth ?? 500) * (font?.widthScale ?? 0.001);
        // Word spacing applies to single-byte code 32 only.
        const applyWordSpacing = !font?.twoByte && code === 32;
        const advance =
          (glyphWidth * fontSize + charSpacing + (applyWordSpacing ? wordSpacing : 0)) *
          horizontalScale;

        const trm = multiplyMatrix(tm, ctm);
        const corners = [
          applyMatrix(trm, 0, descent),
          applyMatrix(trm, advance, descent),
          applyMatrix(trm, 0, ascent),
          applyMatrix(trm, advance, ascent),
        ];
        const xs = corners.map((c) => c[0]);
        const ys = corners.map((c) => c[1]);
        noteBox({
          x: Math.min(...xs),
          y: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
        });

        tm = multiplyMatrix([1, 0, 0, 1, advance, 0], tm);
        opShift += advance;
      }
    };

    const nextLine = (tx, ty) => {
      tlm = multiplyMatrix([1, 0, 0, 1, tx, ty], tlm);
      tm = tlm;
    };

    for (const token of tokens) {
      if (token.type !== 'operator') {
        operands.push(token);
        continue;
      }

      const op = token.value;

      switch (op) {
        case 'q':
          ctmStack.push(ctm);
          lineWidthStack.push(lineWidth);
          break;
        case 'Q':
          ctm = ctmStack.pop() ?? baseCtm;
          lineWidth = lineWidthStack.pop() ?? 1;
          break;
        case 'cm':
          ctm = multiplyMatrix(
            [num(0), num(1), num(2), num(3), num(4), num(5)],
            ctm,
          );
          break;

        case 'w':
          lineWidth = num(operands.length - 1);
          break;
        case 'm':
        case 'l':
          notePoints(num(0), num(1));
          break;
        case 'c':
          notePoints(num(0), num(1), num(2), num(3), num(4), num(5));
          break;
        case 'v':
        case 'y':
          notePoints(num(0), num(1), num(2), num(3));
          break;
        case 're':
          notePoints(num(0), num(1), num(0) + num(2), num(1), num(0), num(1) + num(3), num(0) + num(2), num(1) + num(3));
          break;
        case 'S': case 's': case 'f': case 'F': case 'f*':
        case 'B': case 'B*': case 'b': case 'b*': case 'n':
          paintPath();
          break;

        case 'BMC':
        case 'BDC': {
          const tag = operands[operands.length - (op === 'BMC' ? 1 : 2)];
          sequences.push({ strip: op === 'BDC' ? textDictRange(operands[operands.length - 1]) : null });
          if (mark.open) {
            if (mark.owner === key) mark.depth += 1;
          } else if (tag?.type === 'name' && tag.value === 'PDkef') {
            Object.assign(mark, closedMark(), { open: true, owner: key, depth: 1, start: tag.start });
          }
          break;
        }
        case 'EMC':
          sequences.pop();
          if (mark.open && mark.owner === key && --mark.depth === 0) {
            const { min, max, units, drawsForm, start: markStart } = mark;
            const imageRefs = mark.imageRefs;
            Object.assign(mark, closedMark());
            // A mark that drew a Form could not be deleted whole: the Form's content would stay.
            if (drawsForm || !min) objects.push(...units);
            else objects.push({
              kind: 'mark',
              pageIndex,
              formPath,
              bbox: { x: min[0], y: min[1], width: max[0] - min[0], height: max[1] - min[1] },
              // The images it drew, so deleting the mark can drop them if nothing else does.
              ...(imageRefs.size ? { imageRefs: [...imageRefs] } : {}),
              start: markStart,
              end: token.end,
            });
          }
          break;

        case 'Do': {
          const name = operands[operands.length - 1];
          const key = name?.type === 'name' ? `/${name.value}` : null;
          const entry = key ? xobjects.get(key) : undefined;
          if (entry?.isImage) {
            // Span covers the `/Name` operand as well as `Do`, so no orphan name
            // is left behind. The preceding `cm` stays: it sits inside the
            // enclosing q/Q and is undone by the `Q` regardless.
            const box = transformedUnitBox(ctm);
            emit({
              kind: 'image',
              pageIndex,
              name: key,
              ...(entry.imageRef ? { imageRef: entry.imageRef } : {}),
              formPath,
              bbox: box,
              start: name.start,
              end: token.end,
            });
          } else if (entry?.form) {
            if (mark.open) mark.drawsForm = true;
            walkForm(entry.form, streamResources, ctm, formPath);
          }
          break;
        }

        case 'BT':
          inText = true;
          textStart = token.start;
          tm = IDENTITY;
          tlm = IDENTITY;
          runMin = null;
          runMax = null;
          pending = [];
          blockVertical = false;
          break;

        case 'ET':
          if (inText && runMin && runMax) {
            const block = { formPath, bbox: rectOf(runMin, runMax), start: textStart, end: token.end };
            blocks.push(block);
            if (blockVertical) emit({ kind: 'text', pageIndex, ...block });
            else joinRuns(pending).forEach(emit);
          }
          pending = [];
          inText = false;
          break;

        case 'Tf': {
          const name = operands[operands.length - 2];
          fontKey = name?.type === 'name' ? `/${name.value}` : null;
          font = fontKey ? fonts.get(fontKey) ?? null : null;
          fontSize = num(operands.length - 1);
          break;
        }
        case 'Tc':
          charSpacing = num(operands.length - 1);
          break;
        case 'Tw':
          wordSpacing = num(operands.length - 1);
          break;
        case 'Tz':
          horizontalScale = num(operands.length - 1) / 100;
          break;
        case 'TL':
          leading = num(operands.length - 1);
          break;
        case 'Ts':
          rise = num(operands.length - 1);
          break;

        case 'Tm':
          tlm = [num(0), num(1), num(2), num(3), num(4), num(5)];
          tm = tlm;
          break;
        case 'Td':
          nextLine(num(operands.length - 2), num(operands.length - 1));
          break;
        case 'TD':
          leading = -num(operands.length - 1);
          nextLine(num(operands.length - 2), num(operands.length - 1));
          break;
        case 'T*':
          nextLine(0, -leading);
          break;

        case 'Tj':
        case "'":
        case '"': {
          const prefix = [];
          if (op !== 'Tj') nextLine(0, -leading);
          if (op === '"') {
            wordSpacing = num(operands.length - 3);
            charSpacing = num(operands.length - 2);
            prefix.push(`${pdfNumber(wordSpacing)} Tw`, `${pdfNumber(charSpacing)} Tc`);
          }
          if (op !== 'Tj') prefix.push('T*');
          opFrom = applyMatrix(multiplyMatrix(tm, ctm), 0, 0);
          const str = operands[operands.length - 1];
          if (str?.type === 'string' || str?.type === 'hexstring') showString(str.value);
          endShow(operands[operands.length - (op === '"' ? 3 : 1)] ?? token, token, prefix);
          break;
        }

        case 'TJ': {
          const arr = operands[operands.length - 1];
          opFrom = applyMatrix(multiplyMatrix(tm, ctm), 0, 0);
          if (arr?.type === 'array') {
            for (const item of arr.value) {
              if (item.type === 'number') {
                // A kern: shifts the cursor without drawing.
                const shift = (-item.value / 1000) * fontSize * horizontalScale;
                tm = multiplyMatrix([1, 0, 0, 1, shift, 0], tm);
                opShift += shift;
              } else if (item.type === 'string' || item.type === 'hexstring') {
                showString(item.value);
              }
            }
          }
          endShow(arr ?? token, token, []);
          break;
        }

        default:
          break;
      }

      operands = [];
    }

    // The stream that opened a mark ended with it open: it is no mark, so what it held is offered as is.
    if (mark.open && mark.owner === key) {
      const { units } = mark;
      Object.assign(mark, closedMark());
      objects.push(...units);
    }
  }

  /** Grows the open mark's box to hold `box`. */
  function foldIntoMark(box) {
    if (!mark.min) {
      mark.min = [box.x, box.y];
      mark.max = [box.x + box.width, box.y + box.height];
      return;
    }
    mark.min[0] = Math.min(mark.min[0], box.x);
    mark.min[1] = Math.min(mark.min[1], box.y);
    mark.max[0] = Math.max(mark.max[0], box.x + box.width);
    mark.max[1] = Math.max(mark.max[1], box.y + box.height);
  }

  /**
   * Walks a Form XObject in place. A Form that cannot be read or lexed
   * contributes nothing; it never costs the page its other objects.
   */
  function walkForm({ ref, stream }, parentResources, ctmAtDo, parentPath) {
    if (parentPath.length >= MAX_FORM_DEPTH || walkedForms.has(ref.tag)) return;
    walkedForms.add(ref.tag);
    const before = objects.length;
    try {
      const ownResources = lookupDict(context, stream.dict.get(PDFName.of('Resources')));
      walkStream(
        decodePDFRawStream(stream).decode(),
        ownResources ?? parentResources,
        multiplyMatrix(formMatrix(context, stream), ctmAtDo),
        [...parentPath, ref.tag],
      );
    } catch (err) {
      reportError('redact', err, 'walk_form_stream');
      objects.length = before;
      console.error(`Could not read Form XObject ${ref.tag} on page ${pageIndex + 1}`, err);
    }
  }
}
