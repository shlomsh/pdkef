import { PDFName, PDFString } from '@cantoo/pdf-lib';

/**
 * RED-12: writes invisible text (render mode 3) over a covered page's
 * picture, so the words no box touches can still be selected, searched and
 * read aloud. The words and their places come from the caller; this module
 * only encodes and writes them.
 *
 * The font is a "glyphless" one, the way OCR tools write their text layer:
 * a Type0 font whose codes are numbered in order of first use and mapped
 * back to Unicode through ToUnicode. The text is never drawn, so no script
 * needs a font of its own; any script, Hebrew and Arabic included, costs the
 * same. Its program is a single glyph (`spikes/red-12/make-glyphless-font.py`),
 * embedded because macOS PDFKit swaps a font with no program for Courier and
 * then places every glyph at Courier's advance, not ours.
 */
const GLYPHLESS_TTF_BASE64 =
  'AAEAAAAKAIAAAwAgT1MvMkTeRSAAAAEoAAAAYGNtYXAADABGAAABkAAAACxnbHlmKOMxFAAAAcQAAAAYaGVhZC7I22AAAACsAAAANmhoZWEF3QH2AAAA5AAAACRobXR4AfQAAAAAAYgAAAAGbG9jYQAMAAAAAAG8AAAABm1heHAABAAGAAABCAAAACBuYW1lGZ8ZNAAAAdwAAABycG9zdABOAAAAAAJQAAAAJgABAAAAAQAAKM/C0V8PPPUAAwPoAAAAAObfS0wAAAAA5t9LTAAAAAAB9APoAAAAAwACAAAAAAAAAAEAAAPoAAAAAAH0AAAAAAH0AAEAAAAAAAAAAAAAAAAAAAABAAEAAAACAAQAAQAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAwH0AZAABQAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPz8/PwAAAAAAAAPoAAAAAAPoAAAAAAAAAAAAAAAAAAAAAAAgAAAB9AAAAAAAAAAAAAIAAAADAAAAFAADAAEAAAAUAAQAGAAAAAIAAgAAAAD//wAA//8AAQAAAAAAAAAMAAAAAQAAAAAB9APoAAMAADERIREB9APo/BgAAAAEADYAAQAAAAAAAQANAAAAAQAAAAAAAgAHAA0AAwABBAkAAQAaABQAAwABBAkAAgAOAC5HbHlwaExlc3NGb250UmVndWxhcgBHAGwAeQBwAGgATABlAHMAcwBGAG8AbgB0AFIAZQBnAHUAbABhAHIAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAABKAAA=';

/** The font's default advance, in thousandths of an em. Every code the layer
 * writes carries its own width in `/W`; this only fills the font's metrics. */
const GLYPH_WIDTH = 500;
const FONT_KEY = 'PdkefText';

function base64Bytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
const FLIP_Y = (height) => [1, 0, 0, -1, 0, height];

function compose([a1, b1, c1, d1, e1, f1], [a2, b2, c2, d2, e2, f2]) {
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, '0');
const num = (n) => (Math.abs(n) < 1e-9 ? '0' : Number(n.toFixed(4)).toString());

/** UTF-16BE hex of one code point, as ToUnicode wants it. */
function utf16Hex(char) {
  let out = '';
  for (let i = 0; i < char.length; i += 1) out += hex4(char.charCodeAt(i));
  return out;
}

function toUnicodeCMap(chars) {
  const lines = [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<0000> <FFFF>',
    'endcodespacerange',
  ];
  for (let i = 0; i < chars.length; i += 100) {
    const block = chars.slice(i, i + 100);
    lines.push(`${block.length} beginbfchar`);
    block.forEach((char, j) => lines.push(`<${hex4(i + j + 1)}> <${utf16Hex(char)}>`));
    lines.push('endbfchar');
  }
  lines.push('endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end');
  return lines.join('\n');
}

/**
 * One invisible font per document. A code stands for one character at one
 * width, so every glyph gets its original advance through `/W` and an
 * extractor's box for each letter matches the picture. `finish` writes the
 * widths, the ToUnicode map and the glyph map, and must run before
 * `doc.save()`.
 */
export function createInvisibleFont(doc) {
  const { context } = doc;
  const codes = new Map();
  const entries = [];
  const toUnicodeRef = context.nextRef();
  const cidToGidRef = context.nextRef();
  const widthsRef = context.nextRef();

  const descriptor = context.obj({
    Type: 'FontDescriptor',
    FontName: 'GlyphLessFont',
    Flags: 5,
    FontBBox: [0, -200, GLYPH_WIDTH, 1000],
    ItalicAngle: 0,
    Ascent: 1000,
    // CoreText rejects the font without a descent ("Failed to determine
    // ascent and decent") and PDFKit then reads no text from the page.
    Descent: -200,
    CapHeight: 1000,
    StemV: 80,
    FontFile2: context.register(context.flateStream(base64Bytes(GLYPHLESS_TTF_BASE64))),
  });
  const cidFont = context.obj({
    Type: 'Font',
    Subtype: 'CIDFontType2',
    BaseFont: 'GlyphLessFont',
    CIDSystemInfo: { Registry: PDFString.of('Adobe'), Ordering: PDFString.of('Identity'), Supplement: 0 },
    FontDescriptor: context.register(descriptor),
    DW: GLYPH_WIDTH,
    W: widthsRef,
    CIDToGIDMap: cidToGidRef,
  });
  const font = context.obj({
    Type: 'Font',
    Subtype: 'Type0',
    BaseFont: 'GlyphLessFont',
    Encoding: 'Identity-H',
    DescendantFonts: [context.register(cidFont)],
    ToUnicode: toUnicodeRef,
  });
  const ref = context.register(font);

  return {
    ref,
    /** The code for one character at `width` (in thousandths of an em), or
     * null once the font is full. */
    code(unicode, width) {
      const key = `${width}|${unicode}`;
      let code = codes.get(key);
      if (code === undefined) {
        if (entries.length >= 0xfffe) return null;
        entries.push({ unicode, width });
        code = entries.length;
        codes.set(key, code);
      }
      return code;
    },
    finish() {
      context.assign(toUnicodeRef, context.flateStream(toUnicodeCMap(entries.map((entry) => entry.unicode))));
      context.assign(widthsRef, context.obj([1, entries.map((entry) => entry.width)]));
      // Every code draws glyph 1, the font's only real glyph.
      const map = new Uint8Array(2 * (entries.length + 1));
      for (let code = 1; code <= entries.length; code += 1) map[2 * code + 1] = 1;
      context.assign(cidToGidRef, context.flateStream(map));
    },
  };
}

/**
 * Appends one content stream to `page` with every run in `runs` written
 * invisibly, each glyph at its own place (`TJ` closes the gap between one
 * glyph's advance and the next glyph's start). `runs` are in the page's
 * top-left-origin viewport (see `planTextLayer`), and the page is that
 * viewport's size.
 */
export function drawInvisibleText(doc, page, font, runs) {
  if (runs.length === 0) return;
  const flip = FLIP_Y(page.getHeight());
  const ops = ['q', 'BT', '3 Tr', `/${FONT_KEY} 1 Tf`];
  for (const run of runs) {
    const parts = [];
    let pen = 0;
    for (const glyph of run.glyphs) {
      const width = Math.round(glyph.width * 1000);
      const code = font.code(glyph.unicode, width);
      if (code === null) continue;
      const gap = Math.round((glyph.x - pen) * 1000);
      if (gap !== 0) parts.push(` ${-gap} `);
      parts.push(`<${hex4(code)}>`);
      pen = glyph.x + width / 1000;
    }
    if (parts.length === 0) continue;
    ops.push(`${compose(flip, run.matrix).map(num).join(' ')} Tm`, `[${parts.join('')}] TJ`);
  }
  ops.push('ET', 'Q');

  page.node.setFontDictionary(PDFName.of(FONT_KEY), font.ref);
  page.node.addContentStream(doc.context.register(doc.context.flateStream(ops.join('\n'))));
}
