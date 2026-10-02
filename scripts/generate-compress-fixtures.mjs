// Fixtures for the Compress tool's image-only compressor and its KPI test.
//
//   text-only.pdf      Helvetica text and form boxes, no images (nothing to shrink)
//   vector-drawing.pdf only vector shapes (nothing to shrink)
//   scan.pdf           2 pages, each one full-page grayscale JPEG (DeviceGray/DCTDecode)
//   mixed.pdf          text + RGB JPEG + RGB PNG (no alpha) + RGBA PNG (/SMask) + a URI link
//
// `sharp` is used only to encode the synthetic JPEG/PNG sources. It comes in via astro
// (not a direct dependency), so the committed PDFs are the source of truth and this
// script is only how they were made. Output is deterministic (seeded noise, fixed dates).
//
// Run: node scripts/generate-compress-fixtures.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { PDFDocument, StandardFonts, rgb, PDFString } from '@cantoo/pdf-lib';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/tools/compress/__fixtures__');
fs.mkdirSync(OUT, { recursive: true });

const W = 612;
const H = 792;
const DATE = new Date('2026-01-01T00:00:00Z');

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function newDoc() {
  const doc = await PDFDocument.create();
  doc.setCreationDate(DATE);
  doc.setModificationDate(DATE);
  doc.setProducer('pdkef compress fixtures');
  doc.setCreator('pdkef compress fixtures');
  doc.setTitle('Compress fixture');
  return doc;
}

async function write(name, doc) {
  const bytes = await doc.save({ useObjectStreams: false });
  fs.writeFileSync(path.join(OUT, name), bytes);
  console.log(name, bytes.length, 'bytes');
}

const LOREM = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.',
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore.',
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia.',
  'Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium.',
];

async function textOnly() {
  const doc = await newDoc();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([W, H]);
  page.drawText('Sample application form', { x: 56, y: 730, size: 24, font: bold });
  for (let i = 0; i < 25; i++) {
    page.drawText(LOREM[i % LOREM.length], { x: 56, y: 696 - i * 15, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
  }
  ['Applicant name', 'Reference number', 'Date of application'].forEach((label, i) => {
    const y = 270 - i * 80;
    page.drawText(label, { x: 56, y: y + 52, size: 10, font: bold });
    page.drawRectangle({ x: 56, y, width: 500, height: 44, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1 });
  });
  await write('text-only.pdf', doc);
}

async function vectorDrawing() {
  const doc = await newDoc();
  const page = doc.addPage([W, H]);
  const rnd = mulberry32(101);
  const colour = () => rgb(rnd(), rnd(), rnd());
  for (let i = 0; i < 40; i++) {
    const x = 40 + rnd() * 480;
    const y = 40 + rnd() * 680;
    const kind = i % 4;
    if (kind === 0) {
      page.drawRectangle({ x, y, width: 30 + rnd() * 60, height: 20 + rnd() * 50, color: colour(), borderColor: colour(), borderWidth: 1 });
    } else if (kind === 1) {
      page.drawCircle({ x, y, size: 10 + rnd() * 35, color: colour(), opacity: 0.8 });
    } else if (kind === 2) {
      page.drawLine({ start: { x, y }, end: { x: x + (rnd() - 0.5) * 200, y: y + (rnd() - 0.5) * 200 }, thickness: 1 + rnd() * 3, color: colour() });
    } else {
      page.drawRectangle({ x, y, width: 50, height: 50, borderColor: colour(), borderWidth: 2 });
    }
  }
  for (let i = 0; i < 4; i++) {
    page.drawSvgPath(`M 0 0 C ${40 + i * 10} -80, ${120} 80, ${160 + i * 20} 0`, {
      x: 60 + i * 120, y: 400 + i * 60, borderColor: colour(), borderWidth: 3, scale: 1,
    });
  }
  await write('vector-drawing.pdf', doc);
}

async function scan() {
  const doc = await newDoc();
  const PW = 1275;
  const PH = 1650;
  for (let p = 0; p < 2; p++) {
    const rnd = mulberry32(200 + p);
    const buf = Buffer.alloc(PW * PH);
    for (let i = 0; i < buf.length; i++) buf[i] = 240 + Math.round((rnd() - 0.5) * 3);
    // rows of dark bars standing in for text lines
    for (let row = 0; row < 48; row++) {
      const y = 150 + row * 28;
      let x = 150;
      const end = 1125 - Math.floor(rnd() * (row % 7 === 6 ? 600 : 120));
      while (x < end) {
        const len = Math.min(end - x, 30 + Math.floor(rnd() * 120));
        for (let yy = y; yy < y + 12; yy++) {
          for (let xx = x; xx < x + len; xx++) buf[yy * PW + xx] = 30 + Math.round(rnd() * 12);
        }
        x += len + 12;
      }
    }
    const jpg = await sharp(buf, { raw: { width: PW, height: PH, channels: 1 } }).toColourspace('b-w').jpeg({ quality: 92 }).toBuffer();
    const img = await doc.embedJpg(jpg);
    const page = doc.addPage([W, H]);
    page.drawImage(img, { x: 0, y: 0, width: W, height: H });
  }
  await write('scan.pdf', doc);
}

function photo(w, h, seed, noise) {
  const rnd = mulberry32(seed);
  const buf = Buffer.alloc(w * h * 3);
  const f1 = 6 + (seed % 5);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const s = Math.sin(u * f1 * Math.PI) * Math.cos(v * 4 * Math.PI);
      const i = (y * w + x) * 3;
      const n = () => (rnd() - 0.5) * noise;
      buf[i] = Math.max(0, Math.min(255, 40 + 180 * u + 30 * s + n()));
      buf[i + 1] = Math.max(0, Math.min(255, 60 + 160 * v + 30 * s + n()));
      buf[i + 2] = Math.max(0, Math.min(255, 220 - 120 * u * v + 40 * s + n()));
    }
  }
  return buf;
}

async function mixed() {
  const doc = await newDoc();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([W, H]);
  page.drawText('Sample annual summary', { x: 56, y: 740, size: 22, font: bold });
  for (let i = 0; i < 12; i++) {
    page.drawText(LOREM[i % LOREM.length], { x: 56, y: 712 - i * 14, size: 10, font });
  }
  const linkY = 712 - 12 * 14;
  const linkText = 'https://example.com/';
  page.drawText(linkText, { x: 56, y: linkY, size: 10, font, color: rgb(0, 0, 0.8) });

  const aBuf = photo(2000, 1500, 7, 8);
  const jpgA = await sharp(aBuf, { raw: { width: 2000, height: 1500, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
  page.drawImage(await doc.embedJpg(jpgA), { x: 56, y: 300, width: 300, height: 225 });

  const bBuf = photo(800, 600, 11, 2);
  const pngB = await sharp(bBuf, { raw: { width: 800, height: 600, channels: 3 } }).png().toBuffer();
  page.drawImage(await doc.embedPng(pngB), { x: 340, y: 60, width: 240, height: 180 });

  const cBuf = Buffer.alloc(200 * 200 * 4);
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 200; x++) {
      const i = (y * 200 + x) * 4;
      const inside = (x - 100) ** 2 + (y - 100) ** 2 <= 95 ** 2;
      cBuf[i] = 200; cBuf[i + 1] = 60; cBuf[i + 2] = 90; cBuf[i + 3] = inside ? 255 : 0;
    }
  }
  const pngC = await sharp(cBuf, { raw: { width: 200, height: 200, channels: 4 } }).png().toBuffer();
  page.drawImage(await doc.embedPng(pngC), { x: 56, y: 180, width: 72, height: 72 });

  const w = font.widthOfTextAtSize(linkText, 10);
  const annot = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [56, linkY - 2, 56 + w, linkY + 10],
    Border: [0, 0, 0],
    A: { Type: 'Action', S: 'URI', URI: PDFString.of(linkText) },
  });
  page.node.addAnnot(doc.context.register(annot));
  await write('mixed.pdf', doc);
}

await textOnly();
await vectorDrawing();
await scan();
await mixed();
