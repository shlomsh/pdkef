// @ts-check
import { PDFName } from '@cantoo/pdf-lib';
import { tokenize, multiplyMatrix, applyMatrix } from './contentStream.js';
import { lookupDict } from './dictReads.js';
import { getPageContentBytes } from './pageContent.js';
import { buildFontTable, decodeCodes, FALLBACK_ASCENT, FALLBACK_DESCENT } from './pdfFonts.js';
import {
  initialTextState,
  applyTextStateOperator,
  beginText,
  moveToNextLine,
  advanceText,
  setQuoteSpacing,
  glyphAdvance,
  kernShift,
  operandNumber,
} from './textState.js';

/**
 * @typedef {import('./contentStream.js').Matrix} Matrix
 * @typedef {import('./contentStream.js').Box} Box
 * @typedef {import('./pdfFonts.js').FontEntry} FontEntry
 * @typedef {[number, number, number, number]} GlyphSquare `[x0, y0, x1, y1]` in glyph space (1000/em)
 */

/** @type {Matrix} */
const IDENTITY = [1, 0, 0, 1, 0, 0];

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
/** @type {Record<'wingdings' | 'wingdings2', Set<number>>} */
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
/** @type {Map<number, GlyphSquare>} */
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
/** @type {Record<'wingdings' | 'wingdings2', Map<number, GlyphSquare>>} */
const SYMBOL_FONT_CHECKBOX_SQUARES = {
  wingdings: new Map([
    [0x6f, [181, 96, 711, 626]],
    [0x71, [133, 145, 663, 675]],
  ]),
  wingdings2: new Map([[0x2a, [84, 0, 615, 530]]]),
};

// The Wingdings code of each box that some producers map to its real Unicode character instead of
// the private-use range (FORM-37: BL/1500 maps its glyph for 0x71 to U+2751, BL/211 to U+F071).
const WINGDINGS_BOX_UNICODE_CODES = new Map([[0x274f, 0x6f], [0x2751, 0x71]]);

/**
 * The character a symbol font means by `code`: a single-byte code is itself, and a two-byte font
 * reports it through its ToUnicode map in the private-use range U+F020-F0FF (Word's way of
 * embedding Wingdings), where the low byte is the Wingdings code, or as the box's own Unicode
 * character.
 *
 * @param {FontEntry} font
 * @param {number} code
 * @returns {number | undefined}
 */
function symbolCode(font, code) {
  const unicode = font.toUnicode.get(code)?.codePointAt(0);
  if (unicode !== undefined && unicode >= 0xf020 && unicode <= 0xf0ff) return unicode - 0xf000;
  if (font.symbolFamily === 'wingdings' && unicode !== undefined && WINGDINGS_BOX_UNICODE_CODES.has(unicode)) {
    return WINGDINGS_BOX_UNICODE_CODES.get(unicode);
  }
  return font.twoByte ? undefined : code;
}

/**
 * The square inside a symbol-font box glyph, when `code` is one.
 *
 * @param {FontEntry | null | undefined} font
 * @param {number} code
 * @returns {GlyphSquare | undefined}
 */
function symbolSquare(font, code) {
  if (!font?.symbolFamily) return undefined;
  const symbol = symbolCode(font, code);
  return symbol === undefined ? undefined : SYMBOL_FONT_CHECKBOX_SQUARES[font.symbolFamily].get(symbol);
}

/**
 * @param {FontEntry | null | undefined} font
 * @param {number} code
 * @returns {boolean}
 */
function isCheckboxGlyph(font, code) {
  if (font?.symbolFamily) {
    const symbol = symbolCode(font, code);
    if (symbol !== undefined && SYMBOL_FONT_CHECKBOX_CODES[font.symbolFamily].has(symbol)) return true;
  }
  const character = font?.toUnicode.get(code);
  return Boolean(font?.isZapfDingbats && ZAPF_DINGBATS_CHECKBOX_CODES.has(code))
    || (character !== undefined && CHECKBOX_GLYPHS.has(character));
}

/**
 * Axis-aligned PDF-space bounds of a text-space rectangle under the current
 * text and graphics transforms.
 *
 * @param {Matrix} tm
 * @param {Matrix} ctm
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @returns {Box}
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
 * @returns {Box[]}
 */
export function collectCheckboxGlyphs(page) {
  const context = page.doc.context;
  const resources = lookupDict(context, page.node.get(PDFName.of('Resources')));
  const fonts = buildFontTable(context, resources);
  const tokens = tokenize(getPageContentBytes(page));
  /** @type {Box[]} */
  const boxes = [];

  let ctm = IDENTITY;
  /** @type {Matrix[]} */
  const ctmStack = [];
  /** @type {import('./contentStream.js').Token[]} */
  let operands = [];
  let inText = false;
  let ts = initialTextState();

  /** @param {number} index */
  const num = (index) => operandNumber(operands, index);
  /** @param {Uint8Array} bytes */
  const showString = (bytes) => {
    const { font, fontSize, rise } = ts;
    const ascent = (font?.ascent ?? FALLBACK_ASCENT) * fontSize + rise;
    const descent = (font?.descent ?? FALLBACK_DESCENT) * fontSize + rise;
    for (const code of decodeCodes(bytes, font)) {
      const advance = glyphAdvance(ts, code);
      const square = font?.isZapfDingbats
        ? ZAPF_DINGBATS_CHECKBOX_SQUARES.get(code)
        : symbolSquare(font, code);
      if (square) {
        const [x0, y0, x1, y1] = square;
        const sx = (fontSize * ts.horizontalScale) / 1000;
        const sy = fontSize / 1000;
        boxes.push(textGlyphBox(ts.tm, ctm, x0 * sx, y0 * sy + rise, x1 * sx, y1 * sy + rise));
      } else if (isCheckboxGlyph(font, code)) {
        boxes.push(textGlyphBox(ts.tm, ctm, 0, descent, advance, ascent));
      }
      ts = advanceText(ts, advance);
    }
  };

  /** @param {string} op */
  const showOperator = (op) => {
    if (!inText) return;
    if (op === 'TJ') {
      const array = operands[operands.length - 1];
      if (array?.type !== 'array') return;
      for (const item of array.value) {
        if (item.type === 'number') ts = advanceText(ts, kernShift(ts, item.value));
        else if (item.type === 'string' || item.type === 'hexstring') showString(item.value);
      }
      return;
    }
    if (op !== 'Tj') ts = moveToNextLine(ts);
    if (op === '"') ts = setQuoteSpacing(ts, operands);
    const string = operands[operands.length - 1];
    if (string?.type === 'string' || string?.type === 'hexstring') showString(string.value);
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
        ts = beginText(ts);
        break;
      case 'ET':
        inText = false;
        break;
      case 'Tj':
      case "'":
      case '"':
      case 'TJ':
        showOperator(token.value);
        break;
      default:
        ts = applyTextStateOperator(ts, token.value, operands, fonts);
        break;
    }
    operands = [];
  }

  return boxes;
}
