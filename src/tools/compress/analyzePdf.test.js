import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFRef, StandardFonts, rgb } from '@cantoo/pdf-lib';
import { analyzePdf } from './analyzePdf.js';

const JPEG_1X1_GRAY_B64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A 2x2 RGBA PNG with varying alpha. */
function rgbaPng() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const row = (a) => Buffer.from([0, 255, 0, 0, a, 0, 255, 0, a]);
  const raw = Buffer.concat([row(255), row(128)]);
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

async function reload(doc) {
  const bytes = await doc.save({ useObjectStreams: false });
  return { bytes, loaded: await PDFDocument.load(bytes) };
}

async function analyze(doc) {
  const { bytes, loaded } = await reload(doc);
  return analyzePdf(loaded, { totalBytes: bytes.length });
}

describe('analyzePdf', () => {
  it('reports a text-only page as having text and no images', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage().drawText('Hello world', { x: 20, y: 50, size: 12, font });
    const a = await analyze(doc);
    expect(a.pageCount).toBe(1);
    expect(a.images).toEqual([]);
    expect(a.imageBytes).toBe(0);
    expect(a.imageShare).toBe(0);
    expect(a.hasText).toBe(true);
  });

  it('reports a vector-only page as having no text and no images', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    page.drawRectangle({ x: 10, y: 10, width: 50, height: 50, color: rgb(1, 0, 0) });
    page.drawCircle({ x: 100, y: 100, size: 20, color: rgb(0, 0, 1) });
    const a = await analyze(doc);
    expect(a.hasText).toBe(false);
    expect(a.images).toEqual([]);
  });

  it('describes an embedded JPEG', async () => {
    const jpg = Uint8Array.from(Buffer.from(JPEG_1X1_GRAY_B64, 'base64'));
    const doc = await PDFDocument.create();
    const img = await doc.embedJpg(jpg);
    doc.addPage().drawImage(img, { x: 0, y: 0, width: 10, height: 10 });
    const a = await analyze(doc);
    expect(a.images).toHaveLength(1);
    const [image] = a.images;
    expect(image.filters).toEqual(['DCTDecode']);
    expect(image.width).toBe(1);
    expect(image.height).toBe(1);
    expect(image.bytes).toBe(jpg.length);
    expect(image.colorSpace).toBe('DeviceGray');
    expect(image.ref).toMatch(/^\d+ \d+ R$/);
    expect(a.hasText).toBe(false);
    expect(a.imageBytes).toBe(jpg.length);
    expect(a.imageShare).toBeGreaterThan(0);
    expect(a.imageShare).toBeLessThanOrEqual(1);
  });

  it('links a PNG with alpha to its soft mask', async () => {
    const doc = await PDFDocument.create();
    const img = await doc.embedPng(rgbaPng());
    doc.addPage().drawImage(img, { x: 0, y: 0, width: 10, height: 10 });
    const a = await analyze(doc);
    expect(a.images).toHaveLength(2);
    const color = a.images.find((i) => i.hasSMask);
    const mask = a.images.find((i) => i.isMask);
    expect(color).toBeDefined();
    expect(color.filters).toEqual(['FlateDecode']);
    expect(color.isMask).toBe(false);
    expect(mask).toBeDefined();
    expect(mask.colorSpace).toBe('DeviceGray');
    expect(mask).not.toBe(color);
  });

  it('ignores text operators that only appear inside strings', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    page.node.set(
      PDFName.of('Contents'),
      doc.context.register(doc.context.flateStream('BT /F1 12 Tf (fake Tj here) ET')),
    );
    expect((await analyze(doc)).hasText).toBe(false);
  });

  it('finds a real Tj in a hand-built content stream', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    page.node.set(
      PDFName.of('Contents'),
      doc.context.register(doc.context.flateStream('BT /F1 12 Tf (hi) Tj ET')),
    );
    expect((await analyze(doc)).hasText).toBe(true);
  });

  it('finds text drawn only inside a Form XObject', async () => {
    const src = await PDFDocument.create();
    const font = await src.embedFont(StandardFonts.Helvetica);
    src.addPage().drawText('inside a form', { x: 10, y: 10, size: 12, font });
    const srcBytes = await src.save({ useObjectStreams: false });

    const doc = await PDFDocument.create();
    const [embedded] = await doc.embedPdf(await PDFDocument.load(srcBytes), [0]);
    doc.addPage().drawPage(embedded);
    const a = await analyze(doc);
    expect(a.hasText).toBe(true);
  });

  it('clamps imageShare to [0, 1]', async () => {
    const jpg = Uint8Array.from(Buffer.from(JPEG_1X1_GRAY_B64, 'base64'));
    const doc = await PDFDocument.create();
    const img = await doc.embedJpg(jpg);
    doc.addPage().drawImage(img, { x: 0, y: 0, width: 10, height: 10 });
    const { loaded } = await reload(doc);
    expect(analyzePdf(loaded, { totalBytes: 0 }).imageShare).toBe(0);
    expect(analyzePdf(loaded, { totalBytes: 1 }).imageShare).toBe(1);
  });
});

// The COMP-01 corpus (scripts/generate-compress-fixtures.mjs): what each kind
// of real file reads as, since the Compress island's honest messaging is
// decided from exactly these fields.
describe('analyzePdf on the compress fixtures', () => {
  const read = async (name) => {
    const bytes = fs.readFileSync(path.resolve(__dirname, '__fixtures__', name));
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    return analyzePdf(doc, { totalBytes: bytes.length });
  };

  it('text-only: text, no images', async () => {
    const a = await read('text-only.pdf');
    expect(a.images).toEqual([]);
    expect(a.hasText).toBe(true);
  });

  it('vector-drawing: neither text nor images', async () => {
    const a = await read('vector-drawing.pdf');
    expect(a.images).toEqual([]);
    expect(a.hasText).toBe(false);
  });

  it('scan: two grey JPEG pages and nothing else', async () => {
    const a = await read('scan.pdf');
    expect(a.pageCount).toBe(2);
    expect(a.hasText).toBe(false);
    expect(a.images.map((i) => [i.colorSpace, i.filters])).toEqual([
      ['DeviceGray', ['DCTDecode']],
      ['DeviceGray', ['DCTDecode']],
    ]);
    expect(a.imageShare).toBeGreaterThan(0.95);
  });

  it('mixed: text plus a JPEG, a Flate photo, and a transparent image with its mask', async () => {
    const a = await read('mixed.pdf');
    expect(a.hasText).toBe(true);
    expect(a.images.map((i) => i.filters[0])).toEqual(['DCTDecode', 'FlateDecode', 'FlateDecode', 'FlateDecode']);
    expect(a.images.filter((i) => i.hasSMask)).toHaveLength(1);
    expect(a.images.filter((i) => i.isMask)).toHaveLength(1);
    expect(a.imageShare).toBeGreaterThan(0.9);
    // pdf-lib writes /Decode [0 1] on the SMask it emits; the photos carry neither.
    expect(a.images.filter((i) => !i.isMask).every((i) => i.predictor === null && !i.hasDecode)).toBe(true);
    expect(a.images.find((i) => i.isMask).hasDecode).toBe(true);
  });

  it('reports components for Device and ICCBased colour spaces', async () => {
    const bytes = fs.readFileSync(path.resolve(__dirname, '__fixtures__', 'mixed.pdf'));
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const images = analyzePdf(doc, { totalBytes: bytes.length }).images;
    expect(images[0].components).toBe(3);
    const scan = await PDFDocument.load(fs.readFileSync(path.resolve(__dirname, '__fixtures__', 'scan.pdf')));
    expect(analyzePdf(scan, { totalBytes: 1 }).images[0].components).toBe(1);

    const [num, gen] = images[1].ref.split(' ').map(Number);
    const { dict } = doc.context.lookup(PDFRef.of(num, gen));
    for (const n of [3, 4]) {
      const icc = doc.context.register(doc.context.stream(new Uint8Array(4), { N: n }));
      dict.set(PDFName.of('ColorSpace'), doc.context.obj([PDFName.of('ICCBased'), icc]));
      const image = analyzePdf(doc, { totalBytes: bytes.length }).images[1];
      expect(image.colorSpace).toBe('ICCBased');
      expect(image.components).toBe(n);
    }
    dict.set(PDFName.of('ColorSpace'), doc.context.obj([PDFName.of('Indexed')]));
    expect(analyzePdf(doc, { totalBytes: bytes.length }).images[1].components).toBeNull();
  });

  it('reports whether an SMask carries a /Matte', async () => {
    const bytes = fs.readFileSync(path.resolve(__dirname, '__fixtures__', 'mixed.pdf'));
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const find = () => analyzePdf(doc, { totalBytes: bytes.length }).images;
    expect(find().every((i) => i.smaskHasMatte === false)).toBe(true);
    const image = find().find((i) => i.hasSMask);
    const [num, gen] = image.ref.split(' ').map(Number);
    const smaskRef = doc.context.lookup(PDFRef.of(num, gen)).dict.get(PDFName.of('SMask'));
    doc.context.lookup(smaskRef).dict.set(PDFName.of('Matte'), doc.context.obj([0, 0, 0]));
    expect(find().find((i) => i.hasSMask).smaskHasMatte).toBe(true);
    expect(find().filter((i) => i.smaskHasMatte)).toHaveLength(1);
  });

  it('reports a Flate predictor and a /Decode array', async () => {
    const bytes = fs.readFileSync(path.resolve(__dirname, '__fixtures__', 'mixed.pdf'));
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const flate = analyzePdf(doc, { totalBytes: bytes.length }).images[1];
    const [num, gen] = flate.ref.split(' ').map(Number);
    const { dict } = doc.context.lookup(PDFRef.of(num, gen));
    dict.set(PDFName.of('DecodeParms'), doc.context.obj({ Predictor: 15, Colors: 3, Columns: 800 }));
    dict.set(PDFName.of('Decode'), doc.context.obj([1, 0, 1, 0, 1, 0]));
    const image = analyzePdf(doc, { totalBytes: bytes.length }).images[1];
    expect(image.predictor).toBe(15);
    expect(image.hasDecode).toBe(true);
  });
});
