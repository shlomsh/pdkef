// RED-18 spike: a second, harder corpus for align.mjs - the constructs the
// first corpus (spikes/red-18/corpus, spikes/red-01/corpus) never exercised:
// a Type3 font, a Type0 font with a non-Identity (embedded, mixed 1-/2-byte)
// CMap, an inline image whose raw data contains a whitespace-bounded "EI"
// byte sequence, Form XObjects nested two and three levels deep, the same
// Form XObject drawn twice on one page, text inside a tiling pattern's own
// content stream, and text in an annotation's appearance stream.
//
// Same corpus.json shape as spikes/red-01/corpus/corpus.json (file, page,
// rect [left, top, width, height] in % of the page, top-left origin, secret,
// keepText, feature), with a few additive fields per fixture noted inline.
//
// Not part of the app; measures, does not touch src/ or spikes/red-18's
// existing align.mjs/corpus/.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, PDFName, StandardFonts } from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;

const PAGE_W = 300;
const PAGE_H = 400;

const entries = [];

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------
function hexOf(bytes) {
  return '<' + Buffer.from(bytes).toString('hex') + '>';
}
function asciiBytes(str) {
  return Buffer.from(str, 'latin1');
}
async function save(doc, name) {
  const bytes = await doc.save();
  fs.writeFileSync(path.join(OUT_DIR, name), bytes);
  return bytes;
}

function rectFromPointsPercent(pageWidth, pageHeight, x, yTop, w, h) {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const left = clamp(x, 0, pageWidth);
  const top = clamp(yTop, 0, pageHeight);
  const right = clamp(x + w, 0, pageWidth);
  const bottom = clamp(yTop + h, 0, pageHeight);
  return [(left / pageWidth) * 100, (top / pageHeight) * 100, ((right - left) / pageWidth) * 100, ((bottom - top) / pageHeight) * 100];
}

// pdf.js text-item geometry helpers, copied from spikes/red-18/make-watermark-corpus.mjs
// (itself copied from spikes/red-01/make-corpus.mjs) so this spike's files
// stand alone.
async function loadPdfjs(bytes) {
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false, isEvalSupported: false, useSystemFonts: false });
  return loadingTask.promise;
}
function applyMatrix([a, b, c, d, e, f], x, y) {
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}
function itemPdfSpaceBBox(item) {
  const [a, b, c, d, e, f] = item.transform;
  const abLen = Math.hypot(a, b) || 1;
  const cdLen = Math.hypot(c, d) || 1;
  const ux = a / abLen;
  const uy = b / abLen;
  const vx = c / cdLen;
  const vy = d / cdLen;
  const w = item.width;
  const h = item.height || cdLen || 1;
  const corner = (u, v) => ({ x: e + ux * u + vx * v, y: f + uy * u + vy * v });
  const corners = [corner(0, 0), corner(w, 0), corner(0, h), corner(w, h)];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
function pdfBBoxToPercent(bbox, viewport, padPt = 2) {
  const [a, b, c, d, e, f] = viewport.transform;
  const corners = [
    applyMatrix([a, b, c, d, e, f], bbox.minX - padPt, bbox.minY - padPt),
    applyMatrix([a, b, c, d, e, f], bbox.maxX + padPt, bbox.minY - padPt),
    applyMatrix([a, b, c, d, e, f], bbox.minX - padPt, bbox.maxY + padPt),
    applyMatrix([a, b, c, d, e, f], bbox.maxX + padPt, bbox.maxY + padPt),
  ];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const left = clamp(Math.min(...xs), 0, viewport.width);
  const top = clamp(Math.min(...ys), 0, viewport.height);
  const right = clamp(Math.max(...xs), 0, viewport.width);
  const bottom = clamp(Math.max(...ys), 0, viewport.height);
  return [
    (left / viewport.width) * 100,
    (top / viewport.height) * 100,
    ((right - left) / viewport.width) * 100,
    ((bottom - top) / viewport.height) * 100,
  ];
}
/** Locates a text item by its index into page.getTextContent()'s items
 * (rather than by exact string match, since several fixtures here render
 * codes that pdf.js decodes to something other than the ASCII secret - a
 * garbled CID-to-Unicode guess with no ToUnicode map, for example). Returns
 * null (with the item list, for diagnostics) if the index doesn't exist -
 * expected for the pattern and annotation-AP fixtures, whose secret text
 * never reaches getTextContent() at all (see results-extra.md). */
async function locateItemRectByIndex(bytes, pageNumber, index, padPt = 2) {
  const pdf = await loadPdfjs(bytes);
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1, rotation: page.rotate });
  const content = await page.getTextContent();
  const item = content.items[index];
  if (!item) return { rect: null, items: content.items.map((it) => it.str) };
  const bbox = itemPdfSpaceBBox(item);
  return { rect: pdfBBoxToPercent(bbox, viewport, padPt), items: content.items.map((it) => it.str), decodedStr: item.str };
}
/** Same as above, but picks the LAST item with a non-empty `.str`, skipping
 * any empty-string "line break" marker items pdf.js's text-content builder
 * inserts between runs (observed for the Type3 and CMap fixtures, whose
 * secret text sits at index 2, not 1, once such a marker is inserted -
 * fixed-index lookup silently grabbed the wrong, near-zero-size item until
 * this was caught by comparing the resulting rect against the known Td
 * position). */
async function locateLastNonEmptyItemRect(bytes, pageNumber, padPt = 2) {
  const pdf = await loadPdfjs(bytes);
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1, rotation: page.rotate });
  const content = await page.getTextContent();
  for (let i = content.items.length - 1; i >= 0; i--) {
    const item = content.items[i];
    if (item.str && item.str.length > 0) {
      const bbox = itemPdfSpaceBBox(item);
      return { rect: pdfBBoxToPercent(bbox, viewport, padPt), items: content.items.map((it) => it.str), decodedStr: item.str, index: i };
    }
  }
  return { rect: null, items: content.items.map((it) => it.str) };
}

/** Renders the page's operator list and text content once, purely to prove
 * the file opens and pdf.js can walk it without throwing (this script's own
 * "no errors" check - independent of align.mjs, which is run separately by
 * run-align-extra.mjs and may legitimately report mismatches for some of
 * these fixtures on purpose). */
async function verifyOpensCleanly(bytes, label) {
  const pdf = await loadPdfjs(bytes);
  const page = await pdf.getPage(1);
  let opError = null;
  let opCount = null;
  try {
    const opList = await page.getOperatorList({ annotationMode: pdfjs.AnnotationMode.DISABLE });
    opCount = opList.fnArray.length;
  } catch (e) {
    opError = e.message;
  }
  const tc = await page.getTextContent();
  return { label, opCount, opError, textItems: tc.items.map((it) => it.str) };
}

// ---------------------------------------------------------------------------
// 1. Type3 font. A hand-built Type3 font (shared glyph proc drawing a filled
// box; a real Type3 font can draw anything - a letterform is not required
// for this to be a valid, renderable Type3 font). classifyFont() in
// align.mjs sets isType3 but decodeCodes() only branches on isType0, so a
// Type3 font's codes are decoded the same as a simple font's: one raw byte
// per code. Codes chosen as plain ASCII so the secret is literally readable
// in the content stream and in pdf.js's originalCharCode/getTextContent.
// ---------------------------------------------------------------------------
async function buildType3() {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  page.node.setFontDictionary(PDFName.of('FH'), helv.ref);

  const glyphProcBytes = asciiBytes('600 0 d0\n50 0 500 650 re f\n');
  const glyphProcRef = doc.context.register(doc.context.stream(glyphProcBytes, {}));

  const secret = 'TYPE3SECRET';
  const uniqueChars = [...new Set(secret.split(''))];
  const glyphName = (ch) => `g${ch.charCodeAt(0)}`;
  const charProcs = {};
  const differences = [];
  for (const ch of uniqueChars) {
    charProcs[glyphName(ch)] = glyphProcRef;
    differences.push(ch.charCodeAt(0), PDFName.of(glyphName(ch)));
  }
  const codes = uniqueChars.map((c) => c.charCodeAt(0));
  const firstChar = Math.min(...codes);
  const lastChar = Math.max(...codes);
  const widths = Array.from({ length: lastChar - firstChar + 1 }, () => 600);

  const type3Ref = doc.context.register(doc.context.obj({
    Type: 'Font',
    Subtype: 'Type3',
    FontBBox: [0, 0, 600, 700],
    FontMatrix: [0.001, 0, 0, 0.001, 0, 0],
    CharProcs: charProcs,
    Encoding: { Type: 'Encoding', Differences: differences },
    FirstChar: firstChar,
    LastChar: lastChar,
    Widths: widths,
  }));
  page.node.setFontDictionary(PDFName.of('FT3'), type3Ref);

  const keepText = 'Type3 body text that must survive';
  const content = asciiBytes(
    `BT /FH 12 Tf 20 350 Td (${keepText}) Tj ET\n` +
    `BT /FT3 24 Tf 20 250 Td ${hexOf(asciiBytes(secret))} Tj ET\n`,
  );
  page.node.addContentStream(doc.context.register(doc.context.stream(content, {})));

  const name = 'type3-font.pdf';
  const bytes = await save(doc, name);
  const loc = await locateLastNonEmptyItemRect(bytes, 1);
  entries.push({
    file: name,
    page: 1,
    rect: loc.rect,
    secret,
    keepText,
    feature: 'Type3 font: shared glyph proc (filled box) per code, plain-ASCII Differences encoding; every code is a raw byte, same decoding path as a simple font',
  });
  return { bytes, name };
}

// ---------------------------------------------------------------------------
// 2. Type0 font with a non-Identity CMap: an EMBEDDED CMap stream (not a
// predefined name like UniJIS-UCS2-H, which needs pdf.js's bundled cmaps/
// resource directory via cMapUrl - align.mjs's own pdfjsShowOps() doesn't set
// one). The embedded CMap declares two codespace ranges, one 1-byte
// (<00>-<7f>) and one 2-byte (<8000>-<ffff>), and cidchar entries for six
// codes: three 1-byte, three 2-byte. No FontFile (non-embedded descendant
// font) - pdf.js substitutes a fallback font for painting, but codes/CIDs
// resolve from the CMap alone, independent of glyph availability.
// ---------------------------------------------------------------------------
async function buildCMapEmbedded() {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  page.node.setFontDictionary(PDFName.of('FH'), helv.ref);

  const cmapProgram = `%!PS-Adobe-3.0 Resource-CMap
%%DocumentNeededResources: ProcSet (CIDInit)
%%IncludeResource: ProcSet (CIDInit)
%%BeginResource: CMap (Custom-CID-H)
%%Title: (Custom-CID-H Custom CID 0)
%%Version: 1.000
%%EndComments
/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Custom) /Ordering (CID) /Supplement 0 >> def
/CMapName /Custom-CID-H def
/CMapType 1 def
2 begincodespacerange
<00> <7f>
<8000> <ffff>
endcodespacerange
6 begincidchar
<43> 1
<8049> 2
<44> 3
<804d> 4
<58> 5
endcidchar
endcmap
CMapName currentdict /CMap defineresource pop
end
end
%%EndResource
%%EOF
`;
  const cmapRef = doc.context.register(doc.context.stream(asciiBytes(cmapProgram), {
    Type: 'CMap',
    CMapName: 'Custom-CID-H',
    CIDSystemInfo: { Registry: 'Custom', Ordering: 'CID', Supplement: 0 },
  }));

  const descFontRef = doc.context.register(doc.context.obj({
    Type: 'Font',
    Subtype: 'CIDFontType2',
    BaseFont: 'CustomCIDFont',
    CIDSystemInfo: { Registry: 'Custom', Ordering: 'CID', Supplement: 0 },
    FontDescriptor: {
      Type: 'FontDescriptor', FontName: 'CustomCIDFont', Flags: 32,
      FontBBox: [0, 0, 1000, 1000], ItalicAngle: 0, Ascent: 800, Descent: -200, CapHeight: 700, StemV: 80,
    },
    DW: 1000,
    CIDToGIDMap: 'Identity',
  }));
  const type0Ref = doc.context.register(doc.context.obj({
    Type: 'Font', Subtype: 'Type0', BaseFont: 'CustomCIDFont', Encoding: cmapRef, DescendantFonts: [descFontRef],
  }));
  page.node.setFontDictionary(PDFName.of('FCID'), type0Ref);

  // "CIDMIX": C=1-byte 0x43, I=2-byte 0x8049, D=1-byte 0x44, M=2-byte
  // 0x804d, I=2-byte 0x8049 (reused), X=1-byte 0x58.
  const secretBytes = Buffer.from([0x43, 0x80, 0x49, 0x44, 0x80, 0x4d, 0x80, 0x49, 0x58]);
  const secretCodes = [0x43, 0x8049, 0x44, 0x804d, 0x8049, 0x58];
  const keepText = 'CMap body text that must survive';
  const content = asciiBytes(
    `BT /FH 12 Tf 20 350 Td (${keepText}) Tj ET\n` +
    `BT /FCID 24 Tf 20 250 Td ${hexOf(secretBytes)} Tj ET\n`,
  );
  page.node.addContentStream(doc.context.register(doc.context.stream(content, {})));

  const name = 'cmap-embedded-mixed-width.pdf';
  const bytes = await save(doc, name);
  const loc = await locateLastNonEmptyItemRect(bytes, 1);
  entries.push({
    file: name,
    page: 1,
    rect: loc.rect,
    secret: 'CIDMIX',
    secretCodes,
    secretBytesHex: secretBytes.toString('hex'),
    keepText,
    feature: 'Type0 font, embedded (non-predefined) CMap with one 1-byte and one 2-byte codespace range; 6 raw bytes decode to codes [0x43, 0x8049, 0x44, 0x804d, 0x8049, 0x58]',
  });
  return { bytes, name };
}

// ---------------------------------------------------------------------------
// 3. Inline image whose raw (unfiltered) data contains a whitespace + "EI" +
// whitespace byte sequence in the middle - the exact pattern align.mjs's own
// heuristic (and, it turns out, pdf.js's) uses to find the end of an inline
// image lacking a /L length key. Real body text before and after, so a
// mis-parse shows up as a lost/garbled show op, not just a lost image.
// ---------------------------------------------------------------------------
async function buildInlineImageTrap() {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  page.node.setFontDictionary(PDFName.of('FH'), helv.ref);

  const w = 6;
  const h = 4;
  const px = Buffer.alloc(w * h);
  for (let i = 0; i < px.length; i++) px[i] = 0x30 + (i % 10); // '0'..'9', all non-ws/non-EI bytes
  // The trap: ' EI ' (0x20,0x45,0x49,0x20) well inside the 24-byte payload.
  px[10] = 0x20; px[11] = 0x45; px[12] = 0x49; px[13] = 0x20;

  const keepBefore = 'Before inline image';
  const secret = 'INLINEIMAGESECRET';
  const head = asciiBytes(
    `BT /FH 12 Tf 20 350 Td (${keepBefore}) Tj ET\n` +
    'q 100 0 0 20 50 300 cm\n' +
    `BI /W ${w} /H ${h} /BPC 8 /CS /G ID\n`,
  );
  const idTail = asciiBytes('\nEI\nQ\n');
  const after = asciiBytes(`BT /FH 12 Tf 20 250 Td ${hexOf(asciiBytes(secret))} Tj ET\n`);
  const content = Buffer.concat([head, px, idTail, after]);
  page.node.addContentStream(doc.context.register(doc.context.stream(content, {})));

  const name = 'inline-image-ei-trap.pdf';
  const bytes = await save(doc, name);
  const loc = await locateLastNonEmptyItemRect(bytes, 1);
  entries.push({
    file: name,
    page: 1,
    rect: loc.rect,
    secret,
    keepText: keepBefore,
    feature: '6x4 8bpc DeviceGray inline image (no /L), raw data contains a whitespace-bounded "EI" 10 bytes into a 24-byte payload, ahead of the real terminator; body text before and after',
  });
  return { bytes, name };
}

// ---------------------------------------------------------------------------
// 4 & 5. Form XObjects nested two and three levels deep: page -> F1 -> F2
// (-> F3), only the innermost form draws the secret text.
// ---------------------------------------------------------------------------
async function buildNestedForms(depth) {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  page.node.setFontDictionary(PDFName.of('FH'), helv.ref);

  const secret = `NESTED${depth}DEEP`;
  let innerRef = doc.context.register(doc.context.stream(
    asciiBytes(`BT /FH 14 Tf 5 5 Td ${hexOf(asciiBytes(secret))} Tj ET\n`),
    { Type: 'XObject', Subtype: 'Form', FormType: 1, BBox: [0, 0, 200, 20], Resources: { Font: { FH: helv.ref } } },
  ));
  let name = 'Fi';
  for (let d = depth - 1; d >= 1; d--) {
    const wrapperRef = doc.context.register(doc.context.stream(
      asciiBytes(`q 1 0 0 1 0 0 cm /${name} Do Q\n`),
      { Type: 'XObject', Subtype: 'Form', FormType: 1, BBox: [0, 0, 200, 20], Resources: { XObject: { [name]: innerRef } } },
    ));
    innerRef = wrapperRef;
    name = `Fw${d}`;
  }
  page.node.setXObject(PDFName.of(name), innerRef);

  const keepText = 'Nested body text that must survive';
  const content = asciiBytes(
    `BT /FH 12 Tf 20 350 Td (${keepText}) Tj ET\n` +
    `q 1 0 0 1 20 250 cm /${name} Do Q\n`,
  );
  page.node.addContentStream(doc.context.register(doc.context.stream(content, {})));

  const fileName = `nested-form-${depth}deep.pdf`;
  const bytes = await save(doc, fileName);
  const loc = await locateLastNonEmptyItemRect(bytes, 1);
  entries.push({
    file: fileName,
    page: 1,
    rect: loc.rect,
    secret,
    keepText,
    formDepth: depth,
    feature: `Form XObject nested ${depth} level${depth === 1 ? '' : 's'} deep (page -> ${depth === 2 ? 'F1 -> F2' : 'F1 -> F2 -> F3'}); only the innermost form draws the secret text`,
  });
  return { bytes, name: fileName };
}

// ---------------------------------------------------------------------------
// 6. The same Form XObject drawn twice on one page (two top-level `Do`
// calls from the page's own content, not nested) - tests whether
// align.mjs's cyclic-reference guard (seenRefs, add-on-descend/delete-on-
// return) is scoped to a single recursion chain, or wrongly treats the
// second top-level invocation as a repeat.
// ---------------------------------------------------------------------------
async function buildSharedFormTwice() {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  page.node.setFontDictionary(PDFName.of('FH'), helv.ref);

  const secret = 'SHAREDFORM';
  const formRef = doc.context.register(doc.context.stream(
    asciiBytes(`BT /FH 14 Tf 5 5 Td ${hexOf(asciiBytes(secret))} Tj ET\n`),
    { Type: 'XObject', Subtype: 'Form', FormType: 1, BBox: [0, 0, 200, 20], Resources: { Font: { FH: helv.ref } } },
  ));
  page.node.setXObject(PDFName.of('Fshared'), formRef);

  const keepText = 'Shared-twice body text that must survive';
  const content = asciiBytes(
    `BT /FH 12 Tf 20 350 Td (${keepText}) Tj ET\n` +
    'q 1 0 0 1 20 250 cm /Fshared Do Q\n' +
    'q 1 0 0 1 20 200 cm /Fshared Do Q\n',
  );
  page.node.addContentStream(doc.context.register(doc.context.stream(content, {})));

  const name = 'shared-form-drawn-twice.pdf';
  const bytes = await save(doc, name);
  const loc1 = await locateItemRectByIndex(bytes, 1, 1);
  const loc2 = await locateItemRectByIndex(bytes, 1, 2);
  entries.push({
    file: name,
    page: 1,
    rect: loc1.rect,
    secret,
    keepText,
    secondOccurrenceRect: loc2.rect,
    feature: 'one Form XObject (/Fshared), same indirect ref, invoked with Do twice from the page content at different positions; both occurrences must be counted',
  });
  return { bytes, name };
}

// ---------------------------------------------------------------------------
// 7. Text inside a tiling pattern's own content stream: the fill area
// exactly matches one pattern cell (BBox == XStep/YStep), so the pattern's
// Tj runs exactly once as far as content goes, but (see results-extra.md)
// neither pdf.js's operator list nor its getTextContent() descend into a
// pattern cell's content stream at all - the secret text is invisible to
// both sides of align.mjs, not just the raw tokenizer (which also has no
// `scn`/Pattern handling). rect is computed from the known fill geometry,
// since pdf.js's text APIs never report an item for it.
// ---------------------------------------------------------------------------
async function buildTilingPatternText() {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([PAGE_W, PAGE_H]);

  const secret = 'TILEPATTERN';
  const patternRef = doc.context.register(doc.context.stream(
    asciiBytes(`BT /FH 10 Tf 2 5 Td ${hexOf(asciiBytes(secret))} Tj ET\n`),
    {
      Type: 'Pattern', PatternType: 1, PaintType: 1, TilingType: 1,
      BBox: [0, 0, 120, 20], XStep: 120, YStep: 20, Matrix: [1, 0, 0, 1, 0, 0],
      Resources: { Font: { FH: helv.ref } },
    },
  ));
  // Full Resources dict set in one shot (Font + XObject + ExtGState +
  // Pattern): PDFPageLeaf.normalize() only backfills missing XObject/
  // ExtGState entries once (a `normalized` guard flag), so replacing
  // Resources wholesale after any earlier node call has already normalized
  // it would leave those entries missing, and a later addContentStream()/
  // addAnnot() call (which also calls normalizedEntries()) throws.
  page.node.set(PDFName.of('Resources'), doc.context.obj({
    Font: { FH: helv.ref },
    XObject: {},
    ExtGState: {},
    Pattern: { P1: patternRef },
  }));

  const keepText = 'Pattern body text that must survive';
  const fillRect = { x: 20, yBottom: 250, w: 120, h: 20 }; // pts, matches the pattern cell exactly
  const content = asciiBytes(
    `BT /FH 12 Tf 20 350 Td (${keepText}) Tj ET\n` +
    `q /Pattern cs /P1 scn ${fillRect.x} ${fillRect.yBottom} ${fillRect.w} ${fillRect.h} re f Q\n`,
  );
  page.node.addContentStream(doc.context.register(doc.context.stream(content, {})));

  const name = 'tiling-pattern-text.pdf';
  const bytes = await save(doc, name);
  const pad = 2;
  const rect = rectFromPointsPercent(
    PAGE_W, PAGE_H,
    fillRect.x - pad, PAGE_H - (fillRect.yBottom + fillRect.h) - pad,
    fillRect.w + pad * 2, fillRect.h + pad * 2,
  );
  entries.push({
    file: name,
    page: 1,
    rect,
    rectSource: 'computed from the known fill geometry, not from a pdf.js text item (none is ever reported - see results-extra.md)',
    secret,
    keepText,
    feature: 'text drawn inside a PatternType 1 (tiling) pattern cell, filled once into a rectangle exactly matching one cell (BBox == XStep/YStep)',
  });
  return { bytes, name };
}

// ---------------------------------------------------------------------------
// 8. Text in an annotation's /AP /N appearance stream. align.mjs's pdfjsShowOps()
// hardcodes annotationMode: DISABLE, and its raw side only walks the page's
// own Contents/Resources (never Annots), so this text is out of scope for
// BOTH sides of the comparison by construction - see results-extra.md for
// why that makes "aligned" here a vacuous result, not a working one. rect is
// computed from the known annotation /Rect, since neither side's text-item
// list ever contains it (default AnnotationMode).
// ---------------------------------------------------------------------------
async function buildAnnotationAppearance() {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  page.node.setFontDictionary(PDFName.of('FH'), helv.ref);

  const secret = 'ANNOTAPSECRET';
  const apRef = doc.context.register(doc.context.stream(
    asciiBytes(`BT /FH 12 Tf 2 4 Td ${hexOf(asciiBytes(secret))} Tj ET\n`),
    { Type: 'XObject', Subtype: 'Form', FormType: 1, BBox: [0, 0, 150, 16], Resources: { Font: { FH: helv.ref } } },
  ));
  const rectPts = [20, 300, 170, 316];
  const annotRef = doc.context.register(doc.context.obj({
    Type: 'Annot', Subtype: 'FreeText', Rect: rectPts, Contents: secret, DA: '(Helv) Tf 0 g', AP: { N: apRef },
  }));
  page.node.addAnnot(annotRef);

  const keepText = 'Annot body text that must survive';
  const content = asciiBytes(`BT /FH 12 Tf 20 350 Td (${keepText}) Tj ET\n`);
  page.node.addContentStream(doc.context.register(doc.context.stream(content, {})));

  const name = 'annotation-appearance-text.pdf';
  const bytes = await save(doc, name);
  const [x, yBottom, x2, yTop] = rectPts;
  const pad = 2;
  const rect = rectFromPointsPercent(PAGE_W, PAGE_H, x - pad, PAGE_H - yTop - pad, x2 - x + pad * 2, yTop - yBottom + pad * 2);
  entries.push({
    file: name,
    page: 1,
    rect,
    rectSource: 'computed from the annotation /Rect, not from a pdf.js text item (none is ever reported under the default AnnotationMode.DISABLE - see results-extra.md)',
    secret,
    annotationOnly: true,
    annotationSubtype: 'FreeText',
    keepText,
    feature: 'text drawn only inside a /FreeText annotation\'s /AP /N appearance stream Form XObject, never in the page\'s own content stream',
  });
  return { bytes, name };
}

// ---------------------------------------------------------------------------
async function main() {
  const built = [];
  built.push(await buildType3());
  built.push(await buildCMapEmbedded());
  built.push(await buildInlineImageTrap());
  built.push(await buildNestedForms(2));
  built.push(await buildNestedForms(3));
  built.push(await buildSharedFormTwice());
  built.push(await buildTilingPatternText());
  built.push(await buildAnnotationAppearance());

  fs.writeFileSync(path.join(OUT_DIR, 'corpus-extra.json'), JSON.stringify(entries, null, 2) + '\n');
  console.log(`Wrote ${entries.length} corpus entries to ${path.join(OUT_DIR, 'corpus-extra.json')}`);

  console.log('\n--- verifyOpensCleanly (independent of align.mjs) ---');
  const verifications = [];
  for (const { bytes, name } of built) {
    const v = await verifyOpensCleanly(bytes, name);
    verifications.push(v);
    console.log(`${name}: opCount=${v.opCount} opError=${v.opError ?? 'none'} textItems=${JSON.stringify(v.textItems)}`);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'verify-open.json'), JSON.stringify(verifications, null, 2) + '\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
