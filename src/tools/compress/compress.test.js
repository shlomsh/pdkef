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

    HTMLCanvasElement.prototype.getContext = function getContext() {
      const canvasEl = this;
      const baseContext = {
        canvas: canvasEl,
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
    };
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
    const compressedBlob = await compressPdf(file, { level: 'medium' });

    expect(compressedBlob).toBeInstanceOf(Blob);
    const pageCount = await getPdfPageCount(compressedBlob);
    expect(pageCount).toBe(5);
  });

  it('compresses num-5.pdf with high preset and preserves 5 pages', async () => {
    const file = getFixtureFile('num-5.pdf');
    const compressedBlob = await compressPdf(file, { level: 'high' });

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
      expect(await compressPdf(file, { level: 'medium' })).toBe(file);
      const result = await compressPdfToTarget(file, { targetKB: 1 });
      expect(result.blob).toBe(file);
      expect(result.metTarget).toBe(false);
    } finally {
      HTMLCanvasElement.prototype.toBlob = toBlob;
    }
  });

  it('compresses num-5.pdf to a target size', async () => {
    const file = getFixtureFile('num-5.pdf');
    // Set targetKB to a low value to trigger compression search logic
    const result = await compressPdfToTarget(file, { targetKB: 1 });

    expect(result.blob).toBeInstanceOf(Blob);
    const pageCount = await getPdfPageCount(result.blob);
    expect(pageCount).toBe(5);
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
