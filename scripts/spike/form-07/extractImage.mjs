// FORM-07 spike: pull the page's raster out of a scanned PDF in Node (pdfjs legacy build).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

/** Opens a PDF the way score.js does and returns the first page's largest painted image as grayscale. */
export async function extractPageImage(pdfPath, pageIndex = 0) {
  const require = createRequire(import.meta.url);
  const pdfjsDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(pdfPath)),
    standardFontDataUrl: `${path.join(pdfjsDir, 'standard_fonts')}${path.sep}`,
    cMapUrl: `${path.join(pdfjsDir, 'cmaps')}${path.sep}`,
    wasmUrl: `${path.join(pdfjsDir, 'wasm')}${path.sep}`,
    cMapPacked: true,
    useSystemFonts: false,
  });
  try {
    const doc = await loading.promise;
    const page = await doc.getPage(pageIndex + 1);
    const view = page.view;
    const opList = await page.getOperatorList();
    const OPS = pdfjs.OPS;
    const images = [];
    opList.fnArray.forEach((fn, i) => {
      if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) images.push(opList.argsArray[i]);
    });
    const found = [];
    for (const args of images) {
      const id = args[0];
      const img = await new Promise((resolve) => {
        const store = id.startsWith('g_') ? page.commonObjs : page.objs;
        store.get(id, resolve);
      });
      found.push(img);
    }
    found.sort((a, b) => b.width * b.height - a.width * a.height);
    const img = found[0];
    const { width, height, kind } = img;
    const data = img.data;
    const gray = new Uint8Array(width * height);
    // kind: 1 = GRAYSCALE_1BPP (packed), 2 = RGB_24BPP, 3 = RGBA_32BPP
    if (kind === 1) {
      const rowBytes = (width + 7) >> 3;
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) gray[y * width + x] = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0;
    } else if (kind === 2) {
      for (let i = 0; i < width * height; i += 1) gray[i] = Math.round(0.299 * data[i * 3] + 0.587 * data[i * 3 + 1] + 0.114 * data[i * 3 + 2]);
    } else {
      for (let i = 0; i < width * height; i += 1) gray[i] = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
    }
    return { gray, width, height, kind, imageCount: images.length, view, pageWidthPts: view[2] - view[0], pageHeightPts: view[3] - view[1] };
  } finally {
    await loading.destroy();
  }
}

/** Minimal grayscale PNG writer for eyeballing a raster (spike only). */
export function writeGrayPng(file, gray, width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, body) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(body.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, body]))); return Buffer.concat([len, t, body, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 0;
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) { raw[y * (width + 1)] = 0; Buffer.from(gray.buffer, gray.byteOffset + y * width, width).copy(raw, y * (width + 1) + 1); }
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
