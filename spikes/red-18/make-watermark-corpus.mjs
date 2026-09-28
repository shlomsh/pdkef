// RED-18 spike: generates a small corpus of multi-page watermark PDFs -
// content shared across pages from ONE object (image or form XObject),
// an annotation-based watermark, and a "must be deleted, not boxed" case -
// for measuring true (content-level) redaction of watermarks specifically,
// on top of RED-01's single-page single-secret corpus.
//
// Each fixture gets an entry in corpus.json, a superset of RED-01's shape:
//   { file, page, rect: [left, top, width, height] in % of the page
//     (top-left origin, 0-100 scale, matching src/editor/geometry/coords.ts)
//     or null for a "delete, not a box" fixture,
//     removalMethod: "box" | "delete",
//     secret, keepText, feature                                   (RED-01)
//     annotationOnly, annotationSubtype                           (new)
//     imageSecretColor, imageKeepColor, imageAssertions           (new)
//     sharedAcrossPages, deleteTarget                             (new) }
//
// See the top of this file's sibling checks.mjs for how each field is used.
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
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = path.resolve(__dirname, 'corpus');
fs.mkdirSync(CORPUS_DIR, { recursive: true });

const PAGE_W = 300;
const PAGE_H = 400;
const NUM_PAGES = 5;

const entries = [];

// ---------------------------------------------------------------------------
// pdf.js helpers, copied from spikes/red-01/make-corpus.mjs (kept local so
// this spike's files stand alone) - locate a text item's rendered bounding
// box as % of the page, top-left-origin, same convention as the editor.
// ---------------------------------------------------------------------------
async function loadPdfjs(bytes) {
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false, isEvalSupported: false });
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
  return pdfBBoxToPercent(bbox, viewport, padPt);
}

function rectFromPointsPercent(pageWidth, pageHeight, x, yTop, w, h) {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const left = clamp(x, 0, pageWidth);
  const top = clamp(yTop, 0, pageHeight);
  const right = clamp(x + w, 0, pageWidth);
  const bottom = clamp(yTop + h, 0, pageHeight);
  return [(left / pageWidth) * 100, (top / pageHeight) * 100, ((right - left) / pageWidth) * 100, ((bottom - top) / pageHeight) * 100];
}

async function save(doc, name) {
  const bytes = await doc.save();
  fs.writeFileSync(path.join(CORPUS_DIR, name), bytes);
  return bytes;
}

function bodyTextFor(i) {
  // Kept short enough to stay inside the page's width at this font size:
  // pdf.js's getTextContent() truncates a text item whose advance runs the
  // glyphs past the page's MediaBox, silently dropping the tail (confirmed
  // via page.getOperatorList()'s showText args, which DO carry the full
  // string - this is a getTextContent()-only quirk, not a content-stream
  // bug). Fits well inside 300pt at 9pt Helvetica from x=20.
  return `Page ${i}: body text that must survive redaction untouched.`;
}

// ---------------------------------------------------------------------------
// PNG helper, copied from spikes/red-01/make-corpus.mjs: a hand-rolled RGBA
// PNG, left half a secretColor/black checker (exact-match pixels for a
// pixel-level count), right half solid keepColor.
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

function makeCheckerKeepPng(w, h, secretColor, keepColor) {
  const raw = Buffer.alloc((1 + w * 4) * h);
  for (let y = 0; y < h; y++) {
    const rowStart = y * (1 + w * 4);
    raw[rowStart] = 0;
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
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/** Solid single-color RGBA PNG, for the diagonal watermark (whole-image delete, no "keep" half needed). */
function makeSolidPng(w, h, color) {
  const raw = Buffer.alloc((1 + w * 4) * h);
  for (let y = 0; y < h; y++) {
    const rowStart = y * (1 + w * 4);
    raw[rowStart] = 0;
    for (let x = 0; x < w; x++) {
      const off = rowStart + 1 + x * 4;
      raw[off] = color[0];
      raw[off + 1] = color[1];
      raw[off + 2] = color[2];
      raw[off + 3] = 255;
    }
  }
  const idat = zlib.deflateSync(raw);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const LOGO_SECRET_COLOR = [255, 0, 0];
const LOGO_KEEP_COLOR = [0, 0, 255];

// ---------------------------------------------------------------------------
// 1 & 2. shared-header-image: one image XObject (small PNG "logo") drawn at
// the top of every page from the SAME object (doc.embedPng() once, drawImage
// per page - pdf-lib reuses the same indirect ref). Case A (full file):
// box on page 1 fully covers the logo. Case B (half file): box on page 1
// covers only its left (secretColor) half, leaving the right (keepColor)
// half visible on page 1 too. Both files share identical bytes - only the
// corpus.json box differs - so the same build is saved under both names.
// ---------------------------------------------------------------------------
async function buildSharedHeaderImage() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const imgW = 120;
  const imgH = 40;
  const imgX = (PAGE_W - imgW) / 2;
  const imgY = PAGE_H - 20 - imgH;
  const png = makeCheckerKeepPng(imgW, imgH, LOGO_SECRET_COLOR, LOGO_KEEP_COLOR);
  const img = await doc.embedPng(png);

  for (let i = 1; i <= NUM_PAGES; i++) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    page.drawImage(img, { x: imgX, y: imgY, width: imgW, height: imgH });
    page.drawText(bodyTextFor(i), { x: 20, y: imgY - 40, size: 9, font, color: rgb(0, 0, 0) });
  }

  const bytes = await doc.save();
  const pad = 2;
  const fullRect = rectFromPointsPercent(PAGE_W, PAGE_H, imgX - pad, PAGE_H - (imgY + imgH) - pad, imgW + pad * 2, imgH + pad * 2);
  const halfRect = rectFromPointsPercent(PAGE_W, PAGE_H, imgX - pad, PAGE_H - (imgY + imgH) - pad, imgW / 2 + pad, imgH + pad * 2);

  const otherPagesAssertions = () =>
    [2, 3, 4, 5].map((p) => ({ page: p, secretColorRemaining: '>0', keepColorRemaining: '>0' }));

  fs.writeFileSync(path.join(CORPUS_DIR, 'shared-header-image-full.pdf'), bytes);
  entries.push({
    file: 'shared-header-image-full.pdf',
    page: 1,
    rect: fullRect,
    removalMethod: 'box',
    secret: null,
    keepText: bodyTextFor(1),
    imageSecretColor: LOGO_SECRET_COLOR,
    imageKeepColor: LOGO_KEEP_COLOR,
    imageAssertions: [{ page: 1, secretColorRemaining: 0, keepColorRemaining: 0 }, ...otherPagesAssertions()],
    sharedAcrossPages: [2, 3, 4, 5],
    feature: 'one image XObject (logo) drawn at the top of every page from the same object; box on page 1 fully covers it',
  });

  fs.writeFileSync(path.join(CORPUS_DIR, 'shared-header-image-half.pdf'), bytes);
  entries.push({
    file: 'shared-header-image-half.pdf',
    page: 1,
    rect: halfRect,
    removalMethod: 'box',
    secret: null,
    keepText: bodyTextFor(1),
    imageSecretColor: LOGO_SECRET_COLOR,
    imageKeepColor: LOGO_KEEP_COLOR,
    imageAssertions: [{ page: 1, secretColorRemaining: 0, keepColorRemaining: '>0' }, ...otherPagesAssertions()],
    sharedAcrossPages: [2, 3, 4, 5],
    feature: 'one image XObject (logo) drawn at the top of every page from the same object; box on page 1 covers only half of it',
  });
}

// ---------------------------------------------------------------------------
// 3. text-watermark-form: "CONFIDENTIAL" drawn at the top of every page from
// ONE shared Form XObject (registered once, invoked with Do on every page -
// same technique as red-01's form-xobject-text.pdf). Box on page 1 only.
// ---------------------------------------------------------------------------
async function buildTextWatermarkForm() {
  const doc = await PDFDocument.create();
  const bodyFont = await doc.embedFont(StandardFonts.Helvetica);
  const wmFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const secret = 'CONFIDENTIAL';
  const size = 18;
  const fontKey = PDFName.of('F1');
  const xObjDict = doc.context.obj({
    Type: 'XObject',
    Subtype: 'Form',
    FormType: 1,
    BBox: [0, 0, 200, 24],
    Resources: { Font: { F1: wmFont.ref } },
  });
  const contentStream = PDFContentStream.of(
    xObjDict,
    [
      PDFOperator.of('BT', []),
      PDFOperator.of('Tf', [fontKey, PDFNumber.of(size)]),
      PDFOperator.of('Td', [PDFNumber.of(0), PDFNumber.of(0)]),
      PDFOperator.of('Tj', [wmFont.encodeText(secret)]),
      PDFOperator.of('ET', []),
    ],
    false,
  );
  const xObjRef = doc.context.register(contentStream);

  const wmX = (PAGE_W - wmFont.widthOfTextAtSize(secret, size)) / 2;
  const wmY = PAGE_H - 40;
  for (let i = 1; i <= NUM_PAGES; i++) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    const xObjName = page.node.newXObject('Fx', xObjRef);
    page.pushOperators(
      PDFOperator.of('q', []),
      PDFOperator.of('cm', [PDFNumber.of(1), PDFNumber.of(0), PDFNumber.of(0), PDFNumber.of(1), PDFNumber.of(wmX), PDFNumber.of(wmY)]),
      PDFOperator.of('Do', [xObjName]),
      PDFOperator.of('Q', []),
    );
    page.drawText(bodyTextFor(i), { x: 20, y: wmY - 60, size: 9, font: bodyFont, color: rgb(0, 0, 0) });
  }

  const name = 'text-watermark-form.pdf';
  const bytes = await save(doc, name);
  const rect = await locateExactItemRect(bytes, 1, secret);
  entries.push({
    file: name,
    page: 1,
    rect,
    removalMethod: 'box',
    secret,
    keepText: bodyTextFor(1),
    sharedAcrossPages: [2, 3, 4, 5],
    feature: '"CONFIDENTIAL" drawn at the top of every page from one shared Form XObject; box on page 1 only',
  });
}

// ---------------------------------------------------------------------------
// 4. watermark-annotation: a /Watermark annotation with text on each page
// (independent annotation objects, same text); box on page 1 over its
// annotation. Watermark annotation text never appears in getTextContent(),
// same reasoning as red-01's freetext-annotation.pdf.
// ---------------------------------------------------------------------------
async function buildWatermarkAnnotation() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const secret = 'WATERMARK-ANNOTATION-SECRET';
  const rectPts = [(PAGE_W - 200) / 2, PAGE_H - 60, (PAGE_W - 200) / 2 + 200, PAGE_H - 30];

  for (let i = 1; i <= NUM_PAGES; i++) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    page.drawText(bodyTextFor(i), { x: 20, y: PAGE_H - 120, size: 9, font, color: rgb(0, 0, 0) });
    const annotDict = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Watermark',
      Rect: rectPts,
      Contents: PDFString.of(secret),
      DA: PDFString.of('(Helv) Tf 0 g'),
      F: 4,
    });
    const annotRef = doc.context.register(annotDict);
    page.node.addAnnot(annotRef);
  }

  const name = 'watermark-annotation.pdf';
  await save(doc, name);
  const [x, yBottom, x2, yTop] = rectPts;
  const pad = 2;
  const rect = rectFromPointsPercent(PAGE_W, PAGE_H, x - pad, PAGE_H - yTop - pad, x2 - x + pad * 2, yTop - yBottom + pad * 2);
  entries.push({
    file: name,
    page: 1,
    rect,
    removalMethod: 'box',
    secret,
    annotationOnly: true,
    annotationSubtype: 'Watermark',
    keepText: bodyTextFor(1),
    sharedAcrossPages: [2, 3, 4, 5],
    feature: '/Watermark annotation with text on each page (independent objects, same text); box on page 1 over its annotation',
  });
}

// ---------------------------------------------------------------------------
// 5. diagonal-behind-text: a semi-transparent diagonal "DRAFT" image drawn
// BEHIND body text (image painted first, text painted on top). Not a box
// target - this one must be removed by Delete (selecting the whole image
// element), so removalMethod is "delete" and rect is null.
// ---------------------------------------------------------------------------
async function buildDiagonalBehindText() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([PAGE_W, PAGE_H]);

  const DRAFT_COLOR = [200, 0, 200];
  const png = makeSolidPng(160, 60, DRAFT_COLOR);
  const img = await doc.embedPng(png);
  // Painted first (so it sits behind the text drawn after it), semi-
  // transparent via the `opacity` graphics-state alpha (not per-pixel PNG
  // alpha, so the pixel-level check below still sees exact DRAFT_COLOR
  // texels in the image's own decoded data).
  page.drawImage(img, {
    x: (PAGE_W - 160) / 2,
    y: (PAGE_H - 60) / 2,
    width: 160,
    height: 60,
    rotate: degrees(30),
    opacity: 0.25,
  });

  const bodyLines = [
    'This document has several lines of ordinary body text.',
    'A diagonal DRAFT watermark image sits behind all of it.',
    'None of these words are secret; every one must survive.',
    'Only the watermark image itself is the removal target.',
  ];
  bodyLines.forEach((line, i) => {
    page.drawText(line, { x: 20, y: PAGE_H - 60 - i * 16, size: 10, font, color: rgb(0, 0, 0) });
  });

  const name = 'diagonal-behind-text.pdf';
  await save(doc, name);
  entries.push({
    file: name,
    page: 1,
    rect: null,
    removalMethod: 'delete',
    deleteTarget: 'diagonal DRAFT watermark image (semi-transparent, drawn behind body text)',
    secret: null,
    keepText: bodyLines[0],
    imageSecretColor: DRAFT_COLOR,
    imageAssertions: [{ page: 1, secretColorRemaining: 0 }],
    feature: 'semi-transparent diagonal "DRAFT" image drawn behind body text; removed by Delete, not a box',
  });
}

async function main() {
  await buildSharedHeaderImage();
  await buildTextWatermarkForm();
  await buildWatermarkAnnotation();
  await buildDiagonalBehindText();

  fs.writeFileSync(path.join(CORPUS_DIR, 'corpus.json'), JSON.stringify(entries, null, 2) + '\n');
  console.log(`Wrote ${entries.length} corpus entries to ${path.join(CORPUS_DIR, 'corpus.json')}`);
  for (const e of entries) {
    console.log(` - ${e.file}: ${e.feature}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
