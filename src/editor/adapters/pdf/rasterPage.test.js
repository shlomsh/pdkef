// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { getPdfLib } from '#lib/pdf/pdfLib.js';
import { pointAtLegacyWorker } from '../../../test/support/realPdfjs.ts';
import {
  RASTER_SCALE,
  RASTER_JPEG_QUALITY,
  MAX_CANVAS_AREA,
  MAX_CANVAS_SIDE,
  rasterScaleFor,
  rasterizePageToJpeg,
} from './rasterPage.js';

// A real PDF page of the given size, opened by the real pdf.js (no document is kept: tests are short).
async function pageOf(w, h) {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.create();
  doc.addPage([w, h]);
  const bytes = new Uint8Array(await doc.save());
  const task = pdfjs.getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false });
  return (await task.promise).getPage(1);
}

beforeAll(() => pointAtLegacyWorker(pdfjs));

describe('rasterScaleFor', () => {
  it('keeps the shared scale for a normal page', () => {
    expect(rasterScaleFor(100, 200)).toBe(RASTER_SCALE);
  });
  it('shrinks to fit the canvas area and side limits', () => {
    const s = rasterScaleFor(10000, 10000);
    expect(s).toBeLessThan(RASTER_SCALE);
    expect(10000 * s * 10000 * s).toBeLessThanOrEqual(MAX_CANVAS_AREA);
    const thin = rasterScaleFor(20, 100000);
    expect(100000 * thin).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
  });
});

describe('rasterizePageToJpeg', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders at the shared scale, paints between render and encode, returns bytes and point size', async () => {
    const page = await pageOf(100, 200);
    const render = vi.spyOn(page, 'render');
    const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL');
    const paint = vi.fn();
    const out = await rasterizePageToJpeg(page, { paint });
    const at = (spy) => spy.mock.invocationCallOrder[0];
    expect(at(render)).toBeLessThan(at(paint));
    expect(at(paint)).toBeLessThan(at(encode));
    expect(paint.mock.calls[0][1].width).toBe(100 * RASTER_SCALE);
    expect(encode).toHaveBeenCalledWith('image/jpeg', RASTER_JPEG_QUALITY);
    const bytes = Array.from(out.jpeg);
    expect(bytes.slice(0, 3)).toEqual([0xff, 0xd8, 0xff]);
    expect(bytes.slice(-2)).toEqual([0xff, 0xd9]);
    expect([out.width, out.height]).toEqual([100, 200]);
  });

  it('caps the canvas of a huge page and paints with the scale it rendered at', async () => {
    const paint = vi.fn();
    const create = vi.spyOn(document, 'createElement');
    const page = await pageOf(10000, 10000);
    const getViewport = vi.spyOn(page, 'getViewport');
    await rasterizePageToJpeg(page, { paint });
    const canvases = create.mock.results.map((r) => r.value).filter((el) => el.tagName === 'CANVAS');
    const { width, height } = canvases[0];
    expect(width * height).toBeLessThanOrEqual(MAX_CANVAS_AREA);
    expect(Math.max(width, height)).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
    expect(paint.mock.calls[0][1].scale).toBe(getViewport.mock.calls.at(-1)[0].scale);
  });

  it('throws instead of returning empty bytes when the browser cannot encode', async () => {
    // A page too small to have a pixel: the real canvas encodes it as "data:,".
    const page = await pageOf(0.1, 0.1);
    const empty = document.createElement('canvas');
    empty.width = 0;
    expect(empty.toDataURL('image/jpeg')).toBe('data:,');
    await expect(rasterizePageToJpeg(page)).rejects.toThrow(/came back empty/);
  });
});
