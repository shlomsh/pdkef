// One PDF fixture builder for the e2e specs (ARCH-77). Every spec used to carry
// its own makePdfBuffer; each variant is expressible through `opts`.
import fs from 'node:fs';
import { PDFDocument, PDFInvalidObject, PDFName, PDFString, StandardFonts, rgb } from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const publicFont = (name) => fs.readFileSync(new URL(`../../public/fonts/${name}`, import.meta.url));

/**
 * @param {string | null | undefined} label  Document title when `title` is on.
 * @param {object} [opts]
 * @param {number} [opts.pages=1]       Page count.
 * @param {[number, number]} [opts.size=[612, 792]]  Page size in points.
 * @param {boolean} [opts.title=true]   Set the PDF title metadata to `label`.
 * @param {Array | ((pageIndex: number, pageCount: number) => Array)} [opts.lines]
 *   Text drawn on every page (Helvetica). A line is
 *   `{ text, x = 72, y = 720, size = 18, gray = 0.1 }`; `gray: null` draws in
 *   the font's default colour. No lines means no font is embedded.
 * @returns {Promise<Buffer>}
 */
export async function makePdfBuffer(label, { pages = 1, size = [612, 792], title = true, lines = [] } = {}) {
  const document = await PDFDocument.create();
  const linesFor = typeof lines === 'function' ? lines : () => lines;
  const font = (typeof lines === 'function' || lines.length > 0) ? await document.embedFont(StandardFonts.Helvetica) : null;
  for (let i = 0; i < pages; i += 1) {
    const page = document.addPage(size);
    for (const { text, x = 72, y = 720, size: fontSize = 18, gray = 0.1 } of linesFor(i, pages)) {
      const options = { x, y, size: fontSize, font };
      if (gray !== null) options.color = rgb(gray, gray, gray);
      page.drawText(text, options);
    }
  }
  if (title) document.setTitle(label);
  return Buffer.from(await document.save());
}

// Named builders for fixtures whose shape is not a page-and-text list. Each is
// the pdf-lib code a spec used to carry, moved here verbatim (pure pdf-lib, no
// tool imports), so a spec that reads exact bytes keeps them.

/** Ten numbered pages, page 4 landscape, each a tinted sheet with a huge digit. */
export async function makeNumberedGridPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 1; i <= 10; i += 1) {
    const [w, h] = i === 4 ? [792, 612] : [612, 792];
    const page = doc.addPage([w, h]);
    page.drawRectangle({ x: 0, y: 0, width: w, height: h, color: rgb(0.93, 0.95, 1) });
    page.drawText(String(i), { x: w / 2 - 80, y: h / 2 - 100, size: 300, font, color: rgb(0.1, 0.2, 0.5) });
  }
  return Buffer.from(await doc.save());
}

/** One 400x200 page of Latin digits and Hebrew in Heebo Bold. */
export async function makeHebrewTextPdf() {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const heebo = await pdf.embedFont(publicFont('Heebo-Bold.ttf'), { subset: true });
  const page = pdf.addPage([400, 200]);
  // Visual order is what the content stream places; Latin and Hebrew both shift under rtl.
  page.drawText('0101/130', { x: 24, y: 150, size: 24, font: heebo });
  page.drawText('דבוע סיטרכ', { x: 160, y: 100, size: 32, font: heebo });
  return Buffer.from(await pdf.save());
}

/** `pageCount` copies of page 1 of `sourceBytes`. */
export async function makeCopiedPagesPdf(sourceBytes, pageCount) {
  const source = await PDFDocument.load(sourceBytes);
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) {
    const [page] = await doc.copyPages(source, [0]);
    doc.addPage(page);
  }
  return Buffer.from(await doc.save());
}

/** A 300x400 page with KEEP ME / SECRET 123, a text-annotation note and an attached original. */
export async function makeAnnotatedAttachmentPdf({ note, attachment }) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 400]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('KEEP ME', { x: 40, y: 320, size: 20, font });
  page.drawText('SECRET 123', { x: 40, y: 80, size: 20, font });
  page.node.addAnnot(doc.context.register(doc.context.obj({
    Type: 'Annot', Subtype: 'Text', Rect: [250, 360, 270, 380], Contents: PDFString.of(note),
  })));
  await doc.attach(new TextEncoder().encode('%PDF-1.7 the unredacted original'), attachment, { mimeType: 'application/pdf' });
  return Buffer.from(await doc.save());
}

/** Two 300x400 pages carrying document details, an embedded file and page thumbnails, saved without object streams. */
export async function makeHiddenTracesPdf({ attachment }) {
  const N = PDFName.of;
  const doc = await PDFDocument.create({ updateMetadata: false });
  const ctx = doc.context;
  const p1 = doc.addPage([300, 400]);
  const p2 = doc.addPage([300, 400]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  p1.drawText('KEEP ME', { x: 40, y: 320, size: 20, font });
  p1.drawText('SECRET 123', { x: 40, y: 80, size: 20, font });

  const thumb = () => ctx.register(ctx.stream(new Uint8Array(16), {
    Type: 'XObject', Subtype: 'Image', Width: 4, Height: 4, ColorSpace: 'DeviceGray', BitsPerComponent: 8,
  }));
  const spec = (name, payload) => ctx.register(ctx.obj({
    Type: 'Filespec', F: PDFString.of(name), UF: PDFString.of(name),
    EF: { F: ctx.register(ctx.stream(payload, { Type: 'EmbeddedFile' })) },
  }));

  const info = doc.getInfoDict();
  info.set(N('Title'), PDFString.of('Lease draft'));
  info.set(N('Author'), PDFString.of('Dana Levi'));
  info.set(N('Creator'), PDFString.of('CamScanner'));
  info.set(N('CreationDate'), PDFString.of("D:20261007091400+03'00'"));

  doc.catalog.set(N('Names'), ctx.obj({
    EmbeddedFiles: { Names: [PDFString.of(attachment), spec(attachment, '%PDF-1.7 the unredacted original')] },
  }));
  p1.node.set(N('Thumb'), thumb());
  p2.node.set(N('Thumb'), thumb());
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

/** A title drawn twice a hair apart (fake bold), in Latin and Hebrew, plus a second plain page. */
export async function makeOverprintedTextPdf({ title, hebrewTitle }) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const page = doc.addPage([300, 400]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const hebrew = await doc.embedFont(publicFont('Heebo-Regular.ttf'), { subset: true });
  for (const dx of [0, 0.4]) {
    page.drawText(title, { x: 40 + dx, y: 330, size: 24, font });
    page.drawText(hebrewTitle, { x: 40 + dx, y: 280, size: 24, font: hebrew });
  }
  page.drawText('Name: Dana Levi', { x: 40, y: 200, size: 14, font });
  // A second page with no box keeps its text, so the check lists its rows
  // (a file saved wholly as pictures gets one line instead, RED-66).
  doc.addPage([300, 400]).drawText('Page two keeps its text', { x: 40, y: 330, size: 14, font });
  return Buffer.from(await doc.save());
}

/** One page: a cream sheet, a pale blue band across its lower middle and three lines of text on the cream. */
export async function makeCreamBandPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(247 / 255, 241 / 255, 222 / 255) });
  page.drawRectangle({ x: 0, y: 150, width: 612, height: 220, color: rgb(222 / 255, 235 / 255, 247 / 255) });
  for (const [i, y] of [660, 626, 592].entries()) {
    page.drawText(`Cream page, line ${i + 1}: the quick brown fox jumps`, {
      x: 56,
      y,
      size: 14,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
  }
  return Buffer.from(await doc.save());
}

/** One blank Letter page, encrypted with `password`; `unparseableObject` adds an object pdf-lib cannot parse. */
export async function makeEncryptedPdf({ password, unparseableObject = false }) {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  if (unparseableObject) {
    doc.context.assign(doc.context.nextRef(), PDFInvalidObject.of(new TextEncoder().encode('<< /Foo [ ) >>')));
  }
  doc.encrypt({ userPassword: password, ownerPassword: password });
  return Buffer.from(await doc.save());
}

/** Helvetica advance width of `text` at `size`, for specs that place boxes by measured text. */
export async function helveticaWidth(text, size) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  return font.widthOfTextAtSize(text, size);
}

/** One Letter page of Helvetica lines `{ text, x, y, size }` in the font's default colour. */
export async function makeHelveticaLinesPdf(lines) {
  const doc = await PDFDocument.create();
  const pdfPage = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const { text, x, y, size } of lines) pdfPage.drawText(text, { x, y, size, font });
  return Buffer.from(await doc.save());
}

/** One Letter page: a red top half and a black CONFIDENTIAL in the top right. */
export async function makeRedHalfConfidentialPdf() {
  const doc = await PDFDocument.create();
  const pdfPage = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  pdfPage.drawRectangle({ x: 0, y: 396, width: 612, height: 396, color: rgb(1, 0, 0) });
  pdfPage.drawText('CONFIDENTIAL', { x: 420, y: 750, size: 20, font, color: rgb(0, 0, 0) });
  return Buffer.from(await doc.save());
}

/** A 300x400 page with two black lines (AAAA 111, BBBB 222) and a 40x40 square in `markerColor`. */
export async function makeMarkedPdf(markerColor) {
  const doc = await PDFDocument.create();
  const pdfPage = doc.addPage([300, 400]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  pdfPage.drawText('AAAA 111', { x: 40, y: 320, size: 20, font, color: rgb(0, 0, 0) });
  pdfPage.drawText('BBBB 222', { x: 40, y: 80, size: 20, font, color: rgb(0, 0, 0) });
  pdfPage.drawRectangle({ x: 220, y: 20, width: 40, height: 40, color: markerColor });
  return Buffer.from(await doc.save());
}
