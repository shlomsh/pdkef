// RED-01 spike: generates a small corpus of PDFs, one interesting feature
// each, for measuring true (content-level) redaction against rasterization.
//
// Each fixture gets an entry in corpus.json:
//   { file, page, rect: [left, top, width, height] in % of the page
//     (top-left origin, 0-100 scale, matching src/editor/geometry/coords.ts),
//     secret, keepText }
//
// Rects for generated text are derived from the ACTUAL rendered position
// (via pdfjs-dist, same library the app parses with), not hand-computed
// PDF-space math, so rotation/CTM/page-rotate fixtures get correct boxes
// without re-deriving pdf.js's coordinate transforms by hand.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import {
  PDFDocument,
  PDFContentStream,
  PDFOperator,
  PDFName,
  PDFArray,
  PDFNumber,
  PDFString,
  StandardFonts,
  rgb,
  degrees,
} from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = path.resolve(__dirname, 'corpus');
const FONTS_DIR = path.resolve(__dirname, '../../public/fonts');
const REPO_ROOT = path.resolve(__dirname, '../..');

fs.mkdirSync(CORPUS_DIR, { recursive: true });

const entries = [];

// ---------------------------------------------------------------------------
// pdfjs helpers: locate a text item's rendered bounding box as % of the page,
// in the editor's top-left-origin convention.
// ---------------------------------------------------------------------------

async function loadPdfjs(bytes) {
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useWorkerFetch: false,
    isEvalSupported: false,
  });
  return loadingTask.promise;
}

function applyMatrix([a, b, c, d, e, f], x, y) {
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

/** Axis-aligned bbox (in PDF user space) of a pdf.js text item's glyph box. */
function itemPdfSpaceBBox(item) {
  const [a, b, c, d, e, f] = item.transform;
  // item.transform's (a,b) and (c,d) columns carry the font-size scale, but
  // item.width/height are already absolute PDF-user-space lengths along
  // those directions - so the multiplier must use unit vectors, not the raw
  // matrix columns, or the box comes out ~fontSize times too big.
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

/** PDF-space bbox -> top-left-origin % of the rendered (post-rotation) page. */
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

/** Finds the first text item whose string is exactly `needle`, returns its % rect. */
async function locateExactItemRect(bytes, pageNumber, needle, padPt = 2) {
  const pdf = await loadPdfjs(bytes);
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1, rotation: page.rotate });
  const content = await page.getTextContent();
  const item = content.items.find((it) => it.str === needle);
  if (!item) {
    const all = content.items.map((it) => it.str);
    throw new Error(`No exact text item "${needle}" on page ${pageNumber}. Items: ${JSON.stringify(all)}`);
  }
  const bbox = itemPdfSpaceBBox(item);
  const rect = pdfBBoxToPercent(bbox, viewport, padPt);
  // no explicit cleanup needed for short-lived scripts
  return rect;
}

function rectFromPointsPercent(pageWidth, pageHeight, x, yTop, w, h) {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const left = clamp(x, 0, pageWidth);
  const top = clamp(yTop, 0, pageHeight);
  const right = clamp(x + w, 0, pageWidth);
  const bottom = clamp(yTop + h, 0, pageHeight);
  return [(left / pageWidth) * 100, (top / pageHeight) * 100, ((right - left) / pageWidth) * 100, ((bottom - top) / pageHeight) * 100];
}

/**
 * Rect for a known, unrotated baseline-anchored text run (x, baseline y,
 * advance width, font size), padded generously. Used instead of
 * locateExactItemRect() when pdf.js's text layer merges adjacent same-style
 * runs into one item (e.g. prefix+secret+suffix on one line), so there is no
 * distinct item to look up by exact string.
 */
function rectFromKnownRun(pageWidth, pageHeight, x, yBaseline, width, size, padPt = 3) {
  const ascent = size * 0.8;
  const descent = size * 0.25;
  const yTop = pageHeight - (yBaseline + ascent) - padPt;
  const h = ascent + descent + padPt * 2;
  return rectFromPointsPercent(pageWidth, pageHeight, x - padPt, yTop, width + padPt * 2, h);
}

async function save(doc, name) {
  const bytes = await doc.save();
  fs.writeFileSync(path.join(CORPUS_DIR, name), bytes);
  return bytes;
}

// ---------------------------------------------------------------------------
// 1. Plain Helvetica line.
// ---------------------------------------------------------------------------
async function makePlainHelvetica() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([300, 150]);
  const secret = 'PLAIN-SECRET-1234';
  const keepText = 'This line must survive redaction.';
  page.drawText(secret, { x: 40, y: 100, size: 14, font, color: rgb(0, 0, 0) });
  page.drawText(keepText, { x: 40, y: 60, size: 12, font, color: rgb(0, 0, 0) });
  const name = 'plain-helvetica-line.pdf';
  const bytes = await save(doc, name);
  const rect = await locateExactItemRect(bytes, 1, secret);
  entries.push({ file: name, page: 1, rect, secret, keepText, feature: 'plain Helvetica line, single Tj' });
}

// ---------------------------------------------------------------------------
// 2. Partial overlap: secret is the middle "word" of one visual line, drawn
//    as its own Tj run (adjacent to prefix/suffix runs) so pdf.js reports it
//    as a distinct text item and the redaction rect can target it precisely
//    without touching the prefix/suffix.
// ---------------------------------------------------------------------------
async function makePartialOverlap() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([300, 150]);
  const prefix = 'Account: ';
  const secret = 'ACC-99887766';
  const suffix = ' (checking)';
  const size = 14;
  const y = 100;
  let x = 30;
  const secretX = x + font.widthOfTextAtSize(prefix, size);
  const secretWidth = font.widthOfTextAtSize(secret, size);
  page.drawText(prefix, { x, y, size, font, color: rgb(0, 0, 0) });
  page.drawText(secret, { x: secretX, y, size, font, color: rgb(0, 0, 0) });
  page.drawText(suffix, { x: secretX + secretWidth, y, size, font, color: rgb(0, 0, 0) });
  page.drawText('[keep-marker] the prefix/suffix on this line must survive', {
    x: 30,
    y: 60,
    size: 10,
    font,
    color: rgb(0, 0, 0),
  });
  const name = 'partial-overlap-word.pdf';
  const bytes = await save(doc, name);
  const rect = rectFromKnownRun(300, 150, secretX, y, secretWidth, size);
  void bytes;
  entries.push({
    file: name,
    page: 1,
    rect,
    secret,
    keepText: '[keep-marker] the prefix/suffix on this line must survive',
    feature: 'secret is the middle run of one visual line (partial overlap); prefix/suffix must survive',
  });
}

// ---------------------------------------------------------------------------
// 3. TJ array with kerning: a single low-level `TJ` operator with numeric
//    kerning adjustments between glyphs, instead of pdf-lib's simple `Tj`.
// ---------------------------------------------------------------------------
async function makeTjArrayKerning() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([300, 150]);
  const secret = 'KERN-SECRET-42';
  const size = 16;

  const keepText = 'kept text below the kerned line';
  page.drawText(keepText, { x: 30, y: 60, size: 12, font: await doc.embedFont(StandardFonts.Helvetica), color: rgb(0, 0, 0) });

  const fontKey = page.node.newFontDictionary(font.name, font.ref);
  const tjArray = PDFArray.withContext(doc.context);
  // Interleave hex-encoded single characters with kerning numbers, exactly
  // like a real word-processor's TJ output.
  for (const ch of secret) {
    tjArray.push(font.encodeText(ch));
    tjArray.push(PDFNumber.of(-20));
  }
  page.pushOperators(
    PDFOperator.of('BT', []),
    PDFOperator.of('Tf', [fontKey, PDFNumber.of(size)]),
    PDFOperator.of('Td', [PDFNumber.of(30), PDFNumber.of(100)]),
    PDFOperator.of('TJ', [tjArray]),
    PDFOperator.of('ET', []),
  );
  const name = 'tj-array-kerning.pdf';
  const bytes = await save(doc, name);
  const rect = await locateExactItemRect(bytes, 1, secret);
  entries.push({ file: name, page: 1, rect, secret, keepText, feature: 'single TJ operator with per-glyph kerning numbers' });
}

// ---------------------------------------------------------------------------
// 4. Embedded subset TrueType font (Latin).
// ---------------------------------------------------------------------------
async function makeEmbeddedSubsetLatin() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const ttf = fs.readFileSync(path.join(FONTS_DIR, 'Arimo-Regular.ttf'));
  const font = await doc.embedFont(ttf, { subset: true });
  const page = doc.addPage([300, 150]);
  const secret = 'SUBSET-LATIN-SECRET';
  const keepText = 'Arimo body text stays';
  page.drawText(secret, { x: 30, y: 100, size: 14, font, color: rgb(0, 0, 0) });
  page.drawText(keepText, { x: 30, y: 60, size: 12, font, color: rgb(0, 0, 0) });
  const name = 'embedded-subset-truetype-latin.pdf';
  const bytes = await save(doc, name);
  const rect = await locateExactItemRect(bytes, 1, secret);
  entries.push({ file: name, page: 1, rect, secret, keepText, feature: 'embedded subset TrueType font (Latin, Arimo)' });
}

// ---------------------------------------------------------------------------
// 5. Hebrew font line, RTL secret.
// ---------------------------------------------------------------------------
async function makeHebrewRtl() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const ttf = fs.readFileSync(path.join(FONTS_DIR, 'Heebo-Regular.ttf'));
  const font = await doc.embedFont(ttf, { subset: true });
  const page = doc.addPage([300, 150]);
  // Visual order for RTL rendering without a shaping engine: reverse the
  // logical string so glyphs read right-to-left, same trick used elsewhere
  // in this repo's non-shaped fixtures.
  // No digits/hyphens: pdf.js applies its own bidi reordering to embedded
  // LTR runs (digits), so a pure-Hebrew-letters string is the only one that
  // round-trips exactly through our own naive visual-order reversal.
  const secretLogical = 'סודישראלי';
  const secret = [...secretLogical].reverse().join('');
  const keepLogical = 'טקסטשנשאר';
  const keepText = [...keepLogical].reverse().join('');
  page.drawText(secret, { x: 30, y: 100, size: 16, font, color: rgb(0, 0, 0) });
  page.drawText(keepText, { x: 30, y: 60, size: 14, font, color: rgb(0, 0, 0) });
  const name = 'hebrew-rtl-line.pdf';
  const bytes = await save(doc, name);
  const rect = await locateExactItemRect(bytes, 1, secret);
  entries.push({
    file: name,
    page: 1,
    rect,
    secret,
    keepText,
    feature: 'embedded Hebrew font, RTL secret (visual order, no shaping)',
  });
}

// ---------------------------------------------------------------------------
// 6. Text inside a Form XObject.
// ---------------------------------------------------------------------------
async function makeFormXObjectText() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([300, 150]);
  const keepText = 'outside the xobject, on the page directly';
  page.drawText(keepText, { x: 30, y: 60, size: 12, font, color: rgb(0, 0, 0) });

  const secret = 'XOBJECT-SECRET-77';
  const size = 14;
  const fontKey = PDFName.of('F1');
  const xObjDict = doc.context.obj({
    Type: 'XObject',
    Subtype: 'Form',
    FormType: 1,
    BBox: [0, 0, 200, 40],
    Resources: { Font: { F1: font.ref } },
  });
  const contentStream = PDFContentStream.of(
    xObjDict,
    [
      PDFOperator.of('BT', []),
      PDFOperator.of('Tf', [fontKey, PDFNumber.of(size)]),
      PDFOperator.of('Td', [PDFNumber.of(0), PDFNumber.of(0)]),
      PDFOperator.of('Tj', [font.encodeText(secret)]),
      PDFOperator.of('ET', []),
    ],
    false,
  );
  const xObjRef = doc.context.register(contentStream);
  const xObjName = page.node.newXObject('Fx', xObjRef);
  page.pushOperators(
    PDFOperator.of('q', []),
    PDFOperator.of('cm', [PDFNumber.of(1), PDFNumber.of(0), PDFNumber.of(0), PDFNumber.of(1), PDFNumber.of(30), PDFNumber.of(100)]),
    PDFOperator.of('Do', [xObjName]),
    PDFOperator.of('Q', []),
  );
  const name = 'form-xobject-text.pdf';
  const bytes = await save(doc, name);
  const rect = await locateExactItemRect(bytes, 1, secret);
  entries.push({ file: name, page: 1, rect, secret, keepText, feature: 'text drawn inside a Form XObject invoked via Do' });
}

// ---------------------------------------------------------------------------
// 7. Text with a rotated CTM (drawText's `rotate` option issues a `cm`
//    rotation around the text origin before the `Tj`).
// ---------------------------------------------------------------------------
async function makeRotatedCtmText() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([300, 200]);
  const secret = 'ROTATED-SECRET-30';
  const keepText = 'unrotated keep line';
  page.drawText(keepText, { x: 30, y: 30, size: 12, font, color: rgb(0, 0, 0) });
  page.drawText(secret, { x: 60, y: 60, size: 16, font, color: rgb(0, 0, 0), rotate: degrees(30) });
  const name = 'rotated-ctm-text.pdf';
  const bytes = await save(doc, name);
  const rect = await locateExactItemRect(bytes, 1, secret);
  entries.push({ file: name, page: 1, rect, secret, keepText, feature: 'text drawn with a 30deg rotated CTM' });
}

// ---------------------------------------------------------------------------
// 8. Page with /Rotate 90.
// ---------------------------------------------------------------------------
async function makePageRotate90() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([300, 150]);
  const secret = 'PAGE-ROTATE-90-SECRET';
  const keepText = 'kept text on rotated page';
  page.drawText(secret, { x: 30, y: 100, size: 14, font, color: rgb(0, 0, 0) });
  page.drawText(keepText, { x: 30, y: 40, size: 12, font, color: rgb(0, 0, 0) });
  page.setRotation(degrees(90));
  const name = 'page-rotate-90.pdf';
  const bytes = await save(doc, name);
  const rect = await locateExactItemRect(bytes, 1, secret);
  entries.push({ file: name, page: 1, rect, secret, keepText, feature: 'page dictionary /Rotate 90; text unrotated in PDF space' });
}

// ---------------------------------------------------------------------------
// 9 & 10. Raster image (PNG), partly and fully covered by the redaction box.
//    The image itself carries the interesting property: a 200x100 PNG whose
//    left half is a red/black checker (the "secret" pixels, distinct so a
//    pixel-level check can count exact matches) and whose right half is
//    solid pure blue (the "keep" pixels, which must survive when the box
//    covers only the left half). A text caption still records a `secret`
//    string for check-extractable.mjs's uniform text-based probe; the pixel
//    check is done separately by check-images.mjs via imageSecretColor /
//    imageKeepColor.
// ---------------------------------------------------------------------------
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  const crcValue = zlib.crc32(Buffer.concat([typeBuf, data]));
  crc.writeUInt32BE(crcValue >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/**
 * Hand-rolled RGBA PNG (no new deps): raw scanlines (filter byte 0 + 4
 * bytes/pixel) deflated straight into one IDAT. Left half is a 10x10-cell
 * red/black checker (secretColor cells are exact `secretColor` matches, so a
 * pixel-level count is unambiguous); right half is solid `keepColor`.
 */
function makeCheckerKeepPng(w, h, secretColor, keepColor) {
  const raw = Buffer.alloc((1 + w * 4) * h);
  for (let y = 0; y < h; y++) {
    const rowStart = y * (1 + w * 4);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const off = rowStart + 1 + x * 4;
      let r, g, b;
      if (x < w / 2) {
        const cell = Math.floor(x / 10) + Math.floor(y / 10);
        [r, g, b] = cell % 2 === 0 ? secretColor : [0, 0, 0];
      } else {
        [r, g, b] = keepColor;
      }
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = 255;
    }
  }
  const idat = zlib.deflateSync(raw);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const IMAGE_SECRET_COLOR = [255, 0, 0];
const IMAGE_KEEP_COLOR = [0, 0, 255];

async function makeRasterImage({ name, secretLabel, boxCoversAll }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([300, 150]);
  const keepText = 'caption stays outside the box';
  page.drawText(keepText, { x: 30, y: 20, size: 10, font, color: rgb(0, 0, 0) });

  const png = makeCheckerKeepPng(200, 100, IMAGE_SECRET_COLOR, IMAGE_KEEP_COLOR);
  const img = await doc.embedPng(png);
  const imgX = 30;
  const imgY = 40;
  const imgW = 140;
  const imgH = 70;
  page.drawImage(img, { x: imgX, y: imgY, width: imgW, height: imgH });

  const secret = secretLabel;
  // Caption drawn over the image (white, so invisible) so the fixture's
  // secret is real text pdf.js can find; the interesting redaction target
  // for the pixel check is the image itself.
  page.drawText(secret, { x: imgX + 4, y: imgY + imgH / 2, size: 10, font, color: rgb(1, 1, 1) });

  const bytes = await save(doc, name);
  // The box must track the image's own geometry (not the caption text): it
  // covers either the whole image or exactly its left (secret-colored) half,
  // in PDF space converted to the editor's top-left-origin percent rect.
  const boxWidthPdf = boxCoversAll ? imgW : imgW / 2;
  const pad = 2;
  const rect = rectFromPointsPercent(
    300,
    150,
    imgX - pad,
    150 - (imgY + imgH) - pad,
    boxWidthPdf + pad * 2,
    imgH + pad * 2,
  );
  entries.push({
    file: name,
    page: 1,
    rect,
    secret,
    keepText,
    imageSecretColor: IMAGE_SECRET_COLOR,
    imageKeepColor: IMAGE_KEEP_COLOR,
    feature: boxCoversAll ? 'raster PNG fully covered by the box' : 'raster PNG partly covered by the box',
  });
}

// ---------------------------------------------------------------------------
// 11. Vector path: a filled rectangle (highlight) drawn behind real text,
//     both must be removed by a true redaction of the box.
// ---------------------------------------------------------------------------
async function makeVectorPath() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([300, 150]);
  const keepText = 'plain text, no path underneath';
  page.drawText(keepText, { x: 30, y: 40, size: 12, font, color: rgb(0, 0, 0) });

  const secret = 'PATH-HIGHLIGHT-SECRET';
  page.drawRectangle({ x: 28, y: 96, width: 160, height: 18, color: rgb(1, 1, 0) }); // vector path highlight
  page.drawText(secret, { x: 30, y: 100, size: 14, font, color: rgb(0, 0, 0) });
  const name = 'vector-path-highlight.pdf';
  const bytes = await save(doc, name);
  const rect = await locateExactItemRect(bytes, 1, secret);
  entries.push({
    file: name,
    page: 1,
    rect,
    secret,
    keepText,
    feature: 'filled vector-path rectangle (highlight) drawn behind real text',
  });
}

// ---------------------------------------------------------------------------
// 12. Annotation (FreeText) whose /Contents is the secret. Not part of the
//     page content stream, so a text-content-only redaction would miss it.
// ---------------------------------------------------------------------------
async function makeFreeTextAnnotation() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([300, 150]);
  const keepText = 'ordinary page text, not an annotation';
  page.drawText(keepText, { x: 30, y: 100, size: 12, font, color: rgb(0, 0, 0) });

  const secret = 'FREETEXT-ANNOTATION-SECRET';
  const rectPts = [30, 40, 220, 60]; // llx, lly, urx, ury
  const annotDict = doc.context.obj({
    Type: 'Annot',
    Subtype: 'FreeText',
    Rect: rectPts,
    Contents: PDFString.of(secret),
    DA: PDFString.of('(Helv) Tf 0 g'),
    F: 4, // Print flag
  });
  const annotRef = doc.context.register(annotDict);
  page.node.addAnnot(annotRef);

  const [x, yBottom, x2, yTop] = rectPts;
  const rect = rectFromPointsPercent(300, 150, x - 2, 150 - yTop - 2, x2 - x + 4, yTop - yBottom + 4);
  const name = 'freetext-annotation.pdf';
  await save(doc, name);
  entries.push({
    file: name,
    page: 1,
    rect,
    secret,
    keepText,
    feature: 'FreeText annotation whose /Contents is the secret (outside the content stream)',
  });
}

// ---------------------------------------------------------------------------
// 13. 3-line paragraph, box covers line 2 only.
// ---------------------------------------------------------------------------
async function makeParagraphLine2() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([300, 150]);
  const line1 = 'First line stays visible.';
  const secret = 'Second line is the SECRET-LINE-2 to remove.';
  const line3 = 'Third line stays visible.';
  page.drawText(line1, { x: 30, y: 110, size: 12, font, color: rgb(0, 0, 0) });
  page.drawText(secret, { x: 30, y: 90, size: 12, font, color: rgb(0, 0, 0) });
  page.drawText(line3, { x: 30, y: 70, size: 12, font, color: rgb(0, 0, 0) });
  const name = 'paragraph-line2-only.pdf';
  const bytes = await save(doc, name);
  const rect = await locateExactItemRect(bytes, 1, secret);
  entries.push({
    file: name,
    page: 1,
    rect,
    secret,
    // Two separate items with no separating space in pdf.js's join(''), so
    // keepText must match one item's exact string, not a concatenation.
    keepText: line1,
    feature: '3-line paragraph, box covers line 2 only; lines 1 and 3 must survive',
  });
}

// ---------------------------------------------------------------------------
// Real-world PDFs copied from the repo, with a hand-picked secret/rect found
// via pdfjs on the actual file.
// ---------------------------------------------------------------------------
async function copyRealWorldPdf({ src, name, pageNumber, wordIndexHint, feature }) {
  const srcPath = path.join(REPO_ROOT, src);
  const bytes = fs.readFileSync(srcPath);
  const pdf = await loadPdfjs(bytes);
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1, rotation: page.rotate });
  const content = await page.getTextContent();
  // Pick a reasonably long, distinctive text item as the "secret", and a
  // different one as text that must survive.
  const candidates = content.items
    .map((it, idx) => ({ it, idx }))
    .filter(({ it }) => it.str.trim().length >= 4 && /[a-zA-Z֐-׿]/.test(it.str));
  if (candidates.length < 2) {
    throw new Error(`${src}: not enough distinctive text items on page ${pageNumber} to pick a secret`);
  }
  const secretPick = candidates[Math.min(wordIndexHint, candidates.length - 1)];
  const keepPick = candidates[(Math.min(wordIndexHint, candidates.length - 1) + 5) % candidates.length];
  const secret = secretPick.it.str.trim();
  const keepText = keepPick.it.str.trim();
  const bbox = itemPdfSpaceBBox(secretPick.it);
  const rect = pdfBBoxToPercent(bbox, viewport, 2);
  // no explicit cleanup needed for short-lived scripts

  fs.writeFileSync(path.join(CORPUS_DIR, name), bytes);
  entries.push({ file: name, page: pageNumber, rect, secret, keepText, feature });
}

async function main() {
  await makePlainHelvetica();
  await makePartialOverlap();
  await makeTjArrayKerning();
  await makeEmbeddedSubsetLatin();
  await makeHebrewRtl();
  await makeFormXObjectText();
  await makeRotatedCtmText();
  await makePageRotate90();
  await makeRasterImage({ name: 'raster-image-partial.pdf', secretLabel: 'IMG-PARTIAL-SECRET', boxCoversAll: false });
  await makeRasterImage({ name: 'raster-image-full.pdf', secretLabel: 'IMG-FULL-SECRET', boxCoversAll: true });
  await makeVectorPath();
  await makeFreeTextAnnotation();
  await makeParagraphLine2();

  await copyRealWorldPdf({
    src: 'src/tools/sign/fields/corpus/scoring/forms/irs-1040-2024.pdf',
    name: 'real-world-irs-1040-2024.pdf',
    pageNumber: 1,
    wordIndexHint: 2,
    feature: 'real-world form PDF (IRS 1040 2024), page 1',
  });
  await copyRealWorldPdf({
    src: 'src/tools/sign/fields/corpus/scoring/forms/uscis-i9-2025-01-20.pdf',
    name: 'real-world-uscis-i9-2025.pdf',
    pageNumber: 1,
    wordIndexHint: 3,
    feature: 'real-world form PDF (USCIS I-9 2025), page 1',
  });
  await copyRealWorldPdf({
    src: 'src/tools/sign/fields/corpus/scoring/forms/health-declaration-2021.pdf',
    name: 'real-world-health-declaration-2021.pdf',
    pageNumber: 1,
    wordIndexHint: 4,
    feature: 'real-world form PDF (health declaration 2021), page 1',
  });

  fs.writeFileSync(path.join(CORPUS_DIR, 'corpus.json'), JSON.stringify(entries, null, 2) + '\n');
  console.log(`Wrote ${entries.length} corpus entries to ${path.join(CORPUS_DIR, 'corpus.json')}`);
  for (const e of entries) {
    console.log(` - ${e.file}: ${e.feature}`);
  }
}

// ---------------------------------------------------------------------------
// RED-01 gap-fill: no corpus case had the secret in the MIDDLE of one single
// text-showing operator (partial-overlap-word.pdf's pdf-lib drawText calls
// emit three separate Tj objects for prefix/secret/suffix), so PDFium's
// per-glyph split of a single text object was never exercised. These five
// fixtures put the secret mid-run inside ONE Tj/TJ, across the encodings
// that matter (standard font, TJ-kerned, embedded Identity-H, RTL Hebrew,
// and two independent secrets in one run).
// ---------------------------------------------------------------------------

/** Locates `secret` inside `fullString`, rendered as ONE Tj/TJ run starting
 * at (x0, yBaseline), using cumulative glyph widths (font.widthOfTextAtSize).
 * Works for standard, embedded-subset and RTL-visual-order strings alike,
 * since it never needs a distinct pdf.js text item for the secret alone -
 * pdf.js reports the whole run as one item when it's one Tj. */
function rectForSubstringInRun(font, size, x0, yBaseline, fullString, secret, pageWidth, pageHeight, padPt = 3) {
  const idx = fullString.indexOf(secret);
  if (idx < 0) throw new Error(`"${secret}" not found in "${fullString}"`);
  const prefixWidth = font.widthOfTextAtSize(fullString.slice(0, idx), size);
  const secretWidth = font.widthOfTextAtSize(secret, size);
  return rectFromKnownRun(pageWidth, pageHeight, x0 + prefixWidth, yBaseline, secretWidth, size, padPt);
}

// ---------------------------------------------------------------------------
// 14. Mid-run Helvetica: ONE Tj holds "Name: Jane SECRETWORD Example"; the
//     box covers only SECRETWORD.
// ---------------------------------------------------------------------------
async function makeMidRunHelvetica() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([300, 150]);
  const fullString = 'Name: Jane SECRETWORD Example';
  const secret = 'SECRETWORD';
  const keepText = 'kept text below the mid-run line';
  const size = 14;
  const x0 = 30;
  const y = 100;
  page.drawText(fullString, { x: x0, y, size, font, color: rgb(0, 0, 0) });
  page.drawText(keepText, { x: 30, y: 60, size: 12, font, color: rgb(0, 0, 0) });
  const name = 'mid-run-helvetica.pdf';
  await save(doc, name);
  const rect = rectForSubstringInRun(font, size, x0, y, fullString, secret, 300, 150);
  entries.push({
    file: name,
    page: 1,
    rect,
    secret,
    keepText,
    feature: 'secret is the middle substring of ONE Tj (not a separate run); exercises per-glyph split of a single text object',
  });
}

// ---------------------------------------------------------------------------
// 15. Mid-run TJ with kerning: ONE TJ array (interleaved kerning numbers,
//     same technique as tj-array-kerning.pdf) holds the whole line; the
//     secret sits in the middle of that single array/object.
// ---------------------------------------------------------------------------
async function makeMidRunTjKerned() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([300, 150]);
  const fullString = 'Name: Jane SECRETWORD Example';
  const secret = 'SECRETWORD';
  const keepText = 'kept text below the kerned mid-run line';
  const size = 16;
  const x0 = 20;
  const y = 100;
  const kern = -20;

  page.drawText(keepText, {
    x: 20,
    y: 60,
    size: 12,
    font: await doc.embedFont(StandardFonts.Helvetica),
    color: rgb(0, 0, 0),
  });

  const fontKey = page.node.newFontDictionary(font.name, font.ref);
  const tjArray = PDFArray.withContext(doc.context);
  const perCharX = [];
  let cursor = x0;
  for (const ch of fullString) {
    perCharX.push(cursor);
    tjArray.push(font.encodeText(ch));
    tjArray.push(PDFNumber.of(kern));
    cursor += font.widthOfTextAtSize(ch, size) + (-kern / 1000) * size;
  }
  page.pushOperators(
    PDFOperator.of('BT', []),
    PDFOperator.of('Tf', [fontKey, PDFNumber.of(size)]),
    PDFOperator.of('Td', [PDFNumber.of(x0), PDFNumber.of(y)]),
    PDFOperator.of('TJ', [tjArray]),
    PDFOperator.of('ET', []),
  );
  const name = 'mid-run-tj-kerned.pdf';
  await save(doc, name);

  const startIdx = fullString.indexOf(secret);
  const endIdx = startIdx + secret.length - 1;
  const secretStartX = perCharX[startIdx];
  const lastCh = fullString[endIdx];
  const secretEndX = perCharX[endIdx] + font.widthOfTextAtSize(lastCh, size);
  const rect = rectFromKnownRun(300, 150, secretStartX, y, secretEndX - secretStartX, size);

  entries.push({
    file: name,
    page: 1,
    rect,
    secret,
    keepText,
    feature: 'one TJ array with per-glyph kerning holds the whole line; secret is the middle run of that single array',
  });
}

// ---------------------------------------------------------------------------
// 16. Mid-run embedded subset TrueType (Identity-H): ONE Tj (hex glyph
//     string) holds the whole line.
// ---------------------------------------------------------------------------
async function makeMidRunEmbedded() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const ttf = fs.readFileSync(path.join(FONTS_DIR, 'Arimo-Regular.ttf'));
  const font = await doc.embedFont(ttf, { subset: true });
  const page = doc.addPage([300, 150]);
  const fullString = 'Name: Jane SECRETWORD Example';
  const secret = 'SECRETWORD';
  const keepText = 'kept text below the embedded mid-run line';
  const size = 14;
  const x0 = 30;
  const y = 100;
  page.drawText(fullString, { x: x0, y, size, font, color: rgb(0, 0, 0) });
  page.drawText(keepText, { x: 30, y: 60, size: 12, font, color: rgb(0, 0, 0) });
  const name = 'mid-run-embedded.pdf';
  await save(doc, name);
  const rect = rectForSubstringInRun(font, size, x0, y, fullString, secret, 300, 150);
  entries.push({
    file: name,
    page: 1,
    rect,
    secret,
    keepText,
    feature: 'embedded subset TrueType (Identity-H hex Tj); secret is the middle substring of ONE Tj',
  });
}

// ---------------------------------------------------------------------------
// 17. Mid-run Hebrew: ONE Tj holds three RTL-visual-order "words"; the box
//     covers only the middle (secret) word. keepText checks one of the two
//     surviving outer words (the shared checker takes a single string; both
//     outer words live in the same Tj and both must survive in practice).
// ---------------------------------------------------------------------------
async function makeMidRunHebrew() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const ttf = fs.readFileSync(path.join(FONTS_DIR, 'Heebo-Regular.ttf'));
  const font = await doc.embedFont(ttf, { subset: true });
  const page = doc.addPage([300, 150]);
  const outer1Logical = 'טקסטשנשאר';
  const secretLogical = 'סודישראלי';
  const outer2Logical = 'עודטקסט';
  const fullLogical = `${outer1Logical} ${secretLogical} ${outer2Logical}`;
  const fullVisual = [...fullLogical].reverse().join('');
  const secret = [...secretLogical].reverse().join('');
  const keepText = [...outer1Logical].reverse().join('');
  const size = 16;
  const x0 = 30;
  const y = 100;
  page.drawText(fullVisual, { x: x0, y, size, font, color: rgb(0, 0, 0) });
  const name = 'mid-run-hebrew.pdf';
  await save(doc, name);
  // Tighter pad (1pt, vs. the usual 3pt default) - Hebrew glyph advances are
  // narrow enough at this size that a 3pt pad on each side ate into the
  // neighbouring outer words' innermost characters.
  const rect = rectForSubstringInRun(font, size, x0, y, fullVisual, secret, 300, 150, 1);
  entries.push({
    file: name,
    page: 1,
    rect,
    secret,
    keepText,
    feature: 'embedded Hebrew font, ONE Tj holds three RTL-visual-order words; box covers only the middle (secret) word',
  });
}

// ---------------------------------------------------------------------------
// 18. Two boxes, one line: ONE Tj holds two distinct secrets; two separate
//     rects target each independently - the embedpdf #801 class of bug (does
//     clearing the first redaction target corrupt the reads needed for the
//     second, inside the same text object?).
// ---------------------------------------------------------------------------
async function makeTwoBoxesOneLine() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([300, 150]);
  const fullString = 'SSN: SECRETSSN12345 DL: SECRETDL67890';
  const secretA = 'SECRETSSN12345';
  const secretB = 'SECRETDL67890';
  const keepText = 'kept text below the two-secret line';
  const size = 13;
  const x0 = 20;
  const y = 100;
  page.drawText(fullString, { x: x0, y, size, font, color: rgb(0, 0, 0) });
  page.drawText(keepText, { x: 20, y: 60, size: 12, font, color: rgb(0, 0, 0) });
  const name = 'two-boxes-one-line.pdf';
  await save(doc, name);
  const rectA = rectForSubstringInRun(font, size, x0, y, fullString, secretA, 300, 150);
  const rectB = rectForSubstringInRun(font, size, x0, y, fullString, secretB, 300, 150);
  entries.push({
    file: name,
    page: 1,
    rects: [rectA, rectB],
    secrets: [secretA, secretB],
    secret: secretA,
    keepText,
    feature: 'ONE Tj holds two distinct secrets; two rects target each independently (embedpdf #801 class: does clearing the first corrupt the second read?)',
  });
}

async function appendGapFillFixtures() {
  await makeMidRunHelvetica();
  await makeMidRunTjKerned();
  await makeMidRunEmbedded();
  await makeMidRunHebrew();
  await makeTwoBoxesOneLine();
}

// Splices newly generated entries into the EXISTING corpus.json's raw text,
// rather than JSON.parse + re-stringify-ing the whole array, so every
// existing entry stays byte-identical (the file on disk has some
// hand-touched compact-array formatting - e.g. "imageSecretColor": [255, 0,
// 0] on one line - that plain JSON.stringify(parsed, null, 2) would not
// reproduce).
async function mainAppend() {
  const jsonPath = path.join(CORPUS_DIR, 'corpus.json');
  const originalText = fs.readFileSync(jsonPath, 'utf8');
  const existingCount = JSON.parse(originalText).length;

  await appendGapFillFixtures();

  const newEntriesText = entries.map((e) => JSON.stringify(e, null, 2).replace(/^/gm, '  ')).join(',\n');
  const trimmed = originalText.replace(/\s*\]\s*\n?$/, '');
  const spliced = `${trimmed},\n${newEntriesText}\n]\n`;
  // Sanity: re-parse before writing, so a malformed splice never lands.
  const parsed = JSON.parse(spliced);
  if (parsed.length !== existingCount + entries.length) {
    throw new Error(`splice produced ${parsed.length} entries, expected ${existingCount + entries.length}`);
  }
  fs.writeFileSync(jsonPath, spliced);
  console.log(`Wrote ${parsed.length} corpus entries (added ${entries.length} gap-fill fixtures).`);
  for (const e of entries) {
    console.log(` - ${e.file}: ${e.feature}`);
  }
}

if (process.argv.includes('--append')) {
  mainAppend().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
