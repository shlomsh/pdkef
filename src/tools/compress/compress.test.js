import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { compressPdf, compressPdfToTarget, pickStartScaleIndex, MAX_RENDER_MEMORY_BYTES } from './compress.js';

vi.mock('pdfjs-dist', async () => {
  return await import('pdfjs-dist/legacy/build/pdf.mjs');
});

const JPEG_1X1_BASE64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

// jsdom has no canvas: pdf.js renders into a context that swallows every call.
function stubGetContext() {
  const baseContext = {
    canvas: this,
    fillStyle: '',
    strokeStyle: '',
  };
  return new Proxy(baseContext, {
    get(target, prop) {
      if (prop in target) {
        return target[prop];
      }
      if (prop === 'getTransform') {
        return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      }
      return vi.fn();
    },
  });
}

describe('compressPdf library integration with real fixtures', () => {
  let originalToBlob;
  let originalGetContext;

  beforeAll(() => {
    // Resolve absolute path to the node_modules legacy worker file with file:// protocol
    const workerPath = path.resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
    const workerUrl = pathToFileURL(workerPath).href;

    Object.defineProperty(pdfjs.GlobalWorkerOptions, 'workerSrc', {
      get() { return workerUrl; },
      set() { /* ignore */ },
      configurable: true,
    });

    // Stub canvas methods since jsdom does not support canvas drawing/export
    originalToBlob = HTMLCanvasElement.prototype.toBlob;
    originalGetContext = HTMLCanvasElement.prototype.getContext;

    HTMLCanvasElement.prototype.toBlob = function toBlob(callback, type) {
      const bytes = Uint8Array.from(atob(JPEG_1X1_BASE64), (c) => c.charCodeAt(0));
      callback(new Blob([bytes], { type: type || 'image/jpeg' }));
    };

    HTMLCanvasElement.prototype.getContext = stubGetContext;
  });

  afterAll(() => {
    HTMLCanvasElement.prototype.toBlob = originalToBlob;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  function getFixtureFile(name) {
    const filePath = path.resolve(__dirname, '../../lib/__fixtures__', name);
    const buffer = fs.readFileSync(filePath);
    return new File([buffer], name, { type: 'application/pdf' });
  }

  async function getPdfPageCount(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const loadingTask = pdfjs.getDocument({
      data: bytes,
      useWorkerFetch: false,
      isEvalSupported: false,
    });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    await loadingTask.destroy();
    return numPages;
  }

  it('compresses num-5.pdf with medium preset and preserves 5 pages', async () => {
    const file = getFixtureFile('num-5.pdf');
    const { blob: compressedBlob, rasterBytes } = await compressPdf(file, { level: 'medium' });

    expect(compressedBlob).toBeInstanceOf(Blob);
    expect(rasterBytes).toBeGreaterThan(0);
    const pageCount = await getPdfPageCount(compressedBlob);
    expect(pageCount).toBe(5);
  });

  it('compresses num-5.pdf with high preset and preserves 5 pages', async () => {
    const file = getFixtureFile('num-5.pdf');
    const { blob: compressedBlob } = await compressPdf(file, { level: 'high' });

    expect(compressedBlob).toBeInstanceOf(Blob);
    const pageCount = await getPdfPageCount(compressedBlob);
    expect(pageCount).toBe(5);
  });

  it('hands back the original file when re-rendering would not make it smaller', async () => {
    const file = getFixtureFile('num-5.pdf');
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    // Every page encodes to more bytes than the whole input - the shape of a
    // small vector PDF, where a rasterised copy is always the bigger file.
    HTMLCanvasElement.prototype.toBlob = function bigBlob(callback, type) {
      const jpeg = Uint8Array.from(atob(JPEG_1X1_BASE64), (c) => c.charCodeAt(0));
      callback(new Blob([jpeg, new Uint8Array(file.size * 2)], { type: type || 'image/jpeg' }));
    };
    try {
      const levelResult = await compressPdf(file, { level: 'medium' });
      expect(levelResult.blob).toBe(file);
      expect(levelResult.rasterBytes).toBeGreaterThan(file.size);
      const result = await compressPdfToTarget(file, { targetKB: 1 });
      expect(result.blob).toBe(file);
      expect(result.metTarget).toBe(false);
      expect(result.rasterBytes).toBeGreaterThan(file.size);
    } finally {
      HTMLCanvasElement.prototype.toBlob = toBlob;
    }
  });

  it('compresses num-5.pdf to a target size', async () => {
    const file = getFixtureFile('num-5.pdf');
    // Set targetKB to a low value to trigger compression search logic
    const result = await compressPdfToTarget(file, { targetKB: 1 });

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.rasterBytes).toBeGreaterThan(0);
    const pageCount = await getPdfPageCount(result.blob);
    expect(pageCount).toBe(5);
  });

  it('reports no raster size when the file is already under the target', async () => {
    const file = getFixtureFile('num-5.pdf');
    const result = await compressPdfToTarget(file, { targetKB: 100000 });
    expect(result.blob).toBe(file);
    expect(result.metTarget).toBe(true);
    expect(result.rasterBytes).toBeNull();
  });
});

describe('pickStartScaleIndex', () => {
  const SCALES = [1.5, 1.1, 0.85, 0.65, 0.5];
  // A4 in points, matching the real ladder's units.
  const A4_AREA = 595.28 * 841.89;

  it('starts at the top tier when the document easily fits the memory cap', () => {
    const totalArea = A4_AREA * 5; // 5-page document
    expect(pickStartScaleIndex(SCALES, totalArea)).toBe(0);
  });

  it('skips down to the first tier that fits the cap for a large page count', () => {
    // A 100-page A4 doc: top two tiers exceed MAX_RENDER_MEMORY_BYTES
    // (~451MB and ~243MB against a 200MB cap), the third (0.85) fits.
    const totalArea = A4_AREA * 100;
    const bytesAt = (scale) => totalArea * scale * scale * 4;
    expect(bytesAt(SCALES[0])).toBeGreaterThan(MAX_RENDER_MEMORY_BYTES);
    expect(bytesAt(SCALES[1])).toBeGreaterThan(MAX_RENDER_MEMORY_BYTES);
    expect(bytesAt(SCALES[2])).toBeLessThanOrEqual(MAX_RENDER_MEMORY_BYTES);
    expect(pickStartScaleIndex(SCALES, totalArea)).toBe(2);
  });

  it('falls back to the lowest tier when even that exceeds the cap', () => {
    const absurdArea = A4_AREA * 100000;
    expect(pickStartScaleIndex(SCALES, absurdArea)).toBe(SCALES.length - 1);
  });
});

describe('compressPdfToTarget meets a target the lowest step can reach', () => {
  let originalToBlob;
  let originalGetContext;
  let scan;

  // A JPEG pdf-lib accepts, with the canvas's real dimensions in its SOF
  // header and padded with comment segments to exactly `size` bytes, so the
  // PDF container around it is the real one.
  function fakeJpeg(width, height, size) {
    const base = Uint8Array.from(atob(JPEG_1X1_BASE64), (c) => c.charCodeAt(0));
    const sof = base.findIndex((b, i) => b === 0xff && base[i + 1] === 0xc0);
    const view = new DataView(base.buffer);
    view.setUint16(sof + 5, height);
    view.setUint16(sof + 7, width);
    const segments = [base.subarray(0, 2)];
    let padding = size - base.length;
    while (padding > 0) {
      const segmentLength = Math.max(4, Math.min(padding, 65537));
      const segment = new Uint8Array(segmentLength);
      segment.set([0xff, 0xfe, (segmentLength - 2) >> 8, (segmentLength - 2) & 0xff]);
      segments.push(segment);
      padding -= segmentLength;
    }
    segments.push(base.subarray(2));
    return new Blob(segments, { type: 'image/jpeg' });
  }

  // Size grows with pixel count and with quality, like a real encoder. The
  // quality term is kept gentle so the search's last step lands within a few
  // hundred bytes of its budget: a budget that leaves out the PDF's own bytes
  // then overshoots every time, not only on the targets where it lands close.
  const BYTES_PER_PIXEL_AT_ZERO_QUALITY = 0.1;
  function fakeJpegSize(width, height, quality) {
    return Math.round(width * height * BYTES_PER_PIXEL_AT_ZERO_QUALITY * (1 + quality / 4));
  }

  beforeAll(() => {
    originalToBlob = HTMLCanvasElement.prototype.toBlob;
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toBlob = function toBlob(callback, _type, quality) {
      callback(fakeJpeg(this.width, this.height, fakeJpegSize(this.width, this.height, quality)));
    };
    HTMLCanvasElement.prototype.getContext = stubGetContext;
  });

  beforeAll(async () => {
    scan = await scannedLookingPdf(PAGES);
  });

  afterAll(() => {
    HTMLCanvasElement.prototype.toBlob = originalToBlob;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  // Ten blank A4 pages plus an attachment, so the input is bigger than every
  // target below and the search really runs.
  async function scannedLookingPdf(pageCount) {
    const { PDFDocument } = await import('@cantoo/pdf-lib');
    const doc = await PDFDocument.create();
    for (let i = 0; i < pageCount; i += 1) doc.addPage([595.28, 841.89]);
    const noise = new Uint8Array(1024 * 1024);
    let seed = 0x9e3779b9;
    for (let i = 0; i < noise.length; i += 1) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; // xorshift32, incompressible
      noise[i] = seed & 0xff;
    }
    await doc.attach(noise, 'noise.bin');
    return new File([await doc.save()], 'scan.pdf', { type: 'application/pdf' });
  }

  const PAGES = 10;
  // At the ladder's lowest step (0.5, so 297 x 420 px per A4 page) the pages
  // alone run from ~123 KB at the lowest quality to ~150 KB at the highest,
  // and the next step up starts at ~209 KB: so every target here is reachable
  // only at the lowest step, with room to spare for the PDF around the pages.
  const pagesBytes = (width, height, quality) => PAGES * fakeJpegSize(width, height, quality);
  const LOWEST_STEP_FLOOR_BYTES = pagesBytes(297, 420, 0.05);

  it.each([135, 142, 150])('meets %i KB for a 10-page scan', async (targetKB) => {
    expect(LOWEST_STEP_FLOOR_BYTES + 8 * 1024).toBeLessThan(targetKB * 1024);
    expect(pagesBytes(386, 547, 0.05)).toBeGreaterThan(targetKB * 1024);
    expect(scan.size).toBeGreaterThan(targetKB * 1024);

    const result = await compressPdfToTarget(scan, { targetKB });

    expect(result.blob.size).toBeLessThanOrEqual(targetKB * 1024);
    expect(result.metTarget).toBe(true);
  });

  it('reports a miss when even the lowest step cannot fit', async () => {
    const targetKB = 100;
    expect(LOWEST_STEP_FLOOR_BYTES).toBeGreaterThan(targetKB * 1024);

    const result = await compressPdfToTarget(scan, { targetKB });

    expect(result.blob.size).toBeGreaterThan(targetKB * 1024);
    expect(result.metTarget).toBe(false);
  });
});
