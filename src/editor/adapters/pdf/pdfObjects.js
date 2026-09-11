import { PDFName, PDFArray, PDFDict, PDFStream, decodePDFRawStream } from '@cantoo/pdf-lib';
import {
  tokenize,
  multiplyMatrix,
  applyMatrix,
  transformedUnitBox,
} from './contentStream.js';

/**
 * Finds the discrete drawing operations on a page and where they live in its
 * content stream, so a single one can be deleted without disturbing the rest.
 *
 * Two kinds are reported, and only these two, because they are the ones a PDF
 * genuinely stores as self-contained units:
 *   - `image`: one `cm ... /Name Do` placement of an image XObject.
 *   - `text`:  one `BT ... ET` block.
 *
 * A `BT`/`ET` block is whatever the producing tool chose to emit, which is
 * often but not always a word. That is a real limit of the format and the UI
 * must show the caller what it is about to remove rather than promise a
 * semantic unit the file does not contain.
 */

const IDENTITY = [1, 0, 0, 1, 0, 0];

/** Default vertical extent as a fraction of font size, when the font omits them. */
const FALLBACK_ASCENT = 0.75;
const FALLBACK_DESCENT = -0.25;

// A checkbox is often a text glyph rather than a painted rectangle. These are
// the Unicode characters fonts commonly expose for that job. Zapf Dingbats is
// a special case below because many real PDFs omit its ToUnicode map entirely.
const CHECKBOX_GLYPHS = new Set(['\u2610', '\u25a1', '\u274f', '\u2751']);
// In the standard Zapf Dingbats encoding these are ❏ and ❑ respectively.
const ZAPF_DINGBATS_CHECKBOX_CODES = new Set([0x6f, 0x71]);

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
 * Parses a `ToUnicode` CMap far enough to preview what a run says.
 *
 * Only `bfchar` and `bfrange` are handled. A miss yields no preview rather than
 * a wrong one, which matters: the preview is what the user checks before
 * deleting, so a plausible-but-wrong string is worse than none.
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

/**
 * Reads the metrics we need to advance the text cursor: per-code widths, the
 * code size, and the vertical extent of a line.
 */
function readFont(context, fontDict) {
  const subtype = context.lookup(fontDict.get(PDFName.of('Subtype')))?.asString?.();
  const baseFont = context.lookup(fontDict.get(PDFName.of('BaseFont')))?.asString?.() || '';
  const widths = new Map();
  let defaultWidth = 500;
  let twoByte = false;

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
    defaultWidth = numberAt(context, descriptor, 'MissingWidth') ?? 500;
  }

  const ascent = numberAt(context, descriptor, 'Ascent');
  const descent = numberAt(context, descriptor, 'Descent');

  return {
    twoByte,
    widths,
    defaultWidth,
    toUnicode,
    isZapfDingbats: /ZapfDingbats/i.test(baseFont),
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
    table.set(key.asString(), { isImage: subtype === '/Image' });
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

function isCheckboxGlyph(font, code) {
  return (font?.isZapfDingbats && ZAPF_DINGBATS_CHECKBOX_CODES.has(code))
    || CHECKBOX_GLYPHS.has(font?.toUnicode.get(code));
}

/** Axis-aligned PDF-space bounds of a text glyph under its current transform. */
function textGlyphBox(tm, ctm, advance, ascent, descent) {
  const trm = multiplyMatrix(tm, ctm);
  const corners = [
    applyMatrix(trm, 0, descent),
    applyMatrix(trm, advance, descent),
    applyMatrix(trm, 0, ascent),
    applyMatrix(trm, advance, ascent),
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
      const glyphWidth = (font?.widths.get(code) ?? font?.defaultWidth ?? 500) / 1000;
      const applyWordSpacing = !font?.twoByte && code === 32;
      const advance = (
        glyphWidth * fontSize + charSpacing + (applyWordSpacing ? wordSpacing : 0)
      ) * horizontalScale;
      if (isCheckboxGlyph(font, code)) {
        boxes.push(textGlyphBox(tm, ctm, advance, ascent, descent));
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

/** True when a widget inherits the PDF button field type from itself or a parent. */
function isButtonWidget(context, widget) {
  let field = widget;
  const seen = new Set();
  while (field instanceof PDFDict && !seen.has(field)) {
    seen.add(field);
    const type = context.lookup(field.get(PDFName.of('FT')))?.asString?.();
    if (type === '/Btn') return true;
    field = context.lookup(field.get(PDFName.of('Parent')));
  }
  return false;
}

/**
 * Collects native PDF button widgets from the page annotation tree.
 *
 * Checkboxes are `/Btn` fields. The same field type also covers radio buttons;
 * a symbol mark is a useful placement target for either, and their exact
 * printed rectangle comes from the annotation rather than a visual heuristic.
 *
 * @param {import('@cantoo/pdf-lib').PDFPage} page
 * @returns {Array<{x: number, y: number, width: number, height: number}>}
 */
export function collectCheckboxWidgets(page) {
  const context = page.doc.context;
  const annotations = context.lookup(page.node.get(PDFName.of('Annots')));
  if (!(annotations instanceof PDFArray)) return [];

  const boxes = [];
  for (let index = 0; index < annotations.size(); index += 1) {
    const widget = context.lookup(annotations.get(index));
    if (!(widget instanceof PDFDict)) continue;
    const subtype = context.lookup(widget.get(PDFName.of('Subtype')))?.asString?.();
    if (subtype !== '/Widget' || !isButtonWidget(context, widget)) continue;
    const rect = context.lookup(widget.get(PDFName.of('Rect')))?.asRectangle?.();
    if (rect?.width > 0 && rect?.height > 0) boxes.push(rect);
  }
  return boxes;
}

/**
 * Reports every deletable drawing operation on a page.
 *
 * @param {import('@cantoo/pdf-lib').PDFPage} page
 * @param {number} pageIndex
 * @returns {{objects: Array, bytes: Uint8Array}}
 */
export function extractPageObjects(page, pageIndex = 0) {
  const context = page.doc.context;
  const bytes = getPageContentBytes(page);
  const tokens = tokenize(bytes);

  const resources = lookupDict(context, page.node.get(PDFName.of('Resources')));
  const fonts = buildFontTable(context, resources);
  const xobjects = buildXObjectTable(context, resources);

  const { width: pageWidth, height: pageHeight } = page.getSize();
  const objects = [];

  let ctm = IDENTITY;
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
  let preview = '';

  const num = (index) => {
    const token = operands[index];
    return token?.type === 'number' ? token.value : 0;
  };

  const noteBox = (box) => {
    if (!runMin) {
      runMin = [box.x, box.y];
      runMax = [box.x + box.width, box.y + box.height];
      return;
    }
    runMin[0] = Math.min(runMin[0], box.x);
    runMin[1] = Math.min(runMin[1], box.y);
    runMax[0] = Math.max(runMax[0], box.x + box.width);
    runMax[1] = Math.max(runMax[1], box.y + box.height);
  };

  const showString = (bytesOfString) => {
    const codes = decodeCodes(bytesOfString, font);
    const ascent = (font?.ascent ?? FALLBACK_ASCENT) * fontSize + rise;
    const descent = (font?.descent ?? FALLBACK_DESCENT) * fontSize + rise;

    for (const code of codes) {
      const glyphWidth = (font?.widths.get(code) ?? font?.defaultWidth ?? 500) / 1000;
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

      const mapped = font?.toUnicode.get(code);
      if (mapped !== undefined) preview += mapped;
      else if (!font?.twoByte) preview += String.fromCharCode(code);

      tm = multiplyMatrix([1, 0, 0, 1, advance, 0], tm);
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
        break;
      case 'Q':
        ctm = ctmStack.pop() ?? IDENTITY;
        break;
      case 'cm':
        ctm = multiplyMatrix(
          [num(0), num(1), num(2), num(3), num(4), num(5)],
          ctm,
        );
        break;

      case 'Do': {
        const name = operands[operands.length - 1];
        const key = name?.type === 'name' ? `/${name.value}` : null;
        if (key && xobjects.get(key)?.isImage) {
          // Span covers the `/Name` operand as well as `Do`, so no orphan name
          // is left behind. The preceding `cm` stays: it sits inside the
          // enclosing q/Q and is undone by the `Q` regardless.
          const box = transformedUnitBox(ctm);
          objects.push({
            kind: 'image',
            pageIndex,
            name: key,
            bbox: box,
            start: name.start,
            end: token.end,
          });
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
        preview = '';
        break;

      case 'ET':
        if (inText && runMin && runMax) {
          objects.push({
            kind: 'text',
            pageIndex,
            preview,
            bbox: {
              x: runMin[0],
              y: runMin[1],
              width: runMax[0] - runMin[0],
              height: runMax[1] - runMin[1],
            },
            start: textStart,
            end: token.end,
          });
        }
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
        if (op !== 'Tj') nextLine(0, -leading);
        if (op === '"') {
          wordSpacing = num(operands.length - 3);
          charSpacing = num(operands.length - 2);
        }
        const str = operands[operands.length - 1];
        if (str?.type === 'string' || str?.type === 'hexstring') showString(str.value);
        break;
      }

      case 'TJ': {
        const arr = operands[operands.length - 1];
        if (arr?.type === 'array') {
          for (const item of arr.value) {
            if (item.type === 'number') {
              // A kern: shifts the cursor without drawing.
              const shift = (-item.value / 1000) * fontSize * horizontalScale;
              tm = multiplyMatrix([1, 0, 0, 1, shift, 0], tm);
            } else if (item.type === 'string' || item.type === 'hexstring') {
              showString(item.value);
            }
          }
        }
        break;
      }

      default:
        break;
    }

    operands = [];
  }

  // Add page-relative percentages with a top-left origin, matching how the
  // editor stores every other element so the UI needs no second convention.
  for (const [index, object] of objects.entries()) {
    object.id = `obj-${pageIndex}-${index}`;
    object.rect = {
      left: (object.bbox.x / pageWidth) * 100,
      top: ((pageHeight - object.bbox.y - object.bbox.height) / pageHeight) * 100,
      width: (object.bbox.width / pageWidth) * 100,
      height: (object.bbox.height / pageHeight) * 100,
    };
  }

  return { objects, bytes };
}
