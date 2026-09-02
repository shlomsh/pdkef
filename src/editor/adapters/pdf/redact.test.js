import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { redactPdf } from './redact.js';

// redact.js reaches pdfjs through sign.js's getPdfjs(), which does a dynamic
// `import('pdfjs-dist')` - this mock intercepts that specifier for any caller,
// same trick compress.test.js uses so the real (non-worker-dependent) legacy
// build runs instead of the browser-only default export.
vi.mock('pdfjs-dist', async () => {
  return await import('pdfjs-dist/legacy/build/pdf.mjs');
});

const JPEG_1X1_BASE64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

// redact.js's destructive path rasterizes a page to a canvas and reads it back
// out with toDataURL(); jsdom implements neither canvas drawing nor encoding,
// so both are stubbed here the same way compress.test.js stubs toBlob/getContext
// for the same reason - a page that goes through this path in the real browser
// never gets touched by the mocked-module component tests (PdfRedactTool.test.tsx
// mocks redact.js outright), so this is the only place the real logic runs.
describe('redactPdf library integration with real fixtures', () => {
  let originalToDataURL;
  let originalGetContext;

  beforeAll(() => {
    const workerPath = path.resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
    const workerUrl = pathToFileURL(workerPath).href;

    Object.defineProperty(pdfjs.GlobalWorkerOptions, 'workerSrc', {
      get() { return workerUrl; },
      set() { /* ignore - keep it pointed at the real worker file */ },
      configurable: true,
    });

    originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    originalGetContext = HTMLCanvasElement.prototype.getContext;

    HTMLCanvasElement.prototype.toDataURL = function toDataURL() {
      return `data:image/jpeg;base64,${JPEG_1X1_BASE64}`;
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
    HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  function getFixtureFile(name) {
    const filePath = path.resolve(__dirname, '../../../lib/__fixtures__', name);
    const buffer = fs.readFileSync(filePath);
    return new File([buffer], name, { type: 'application/pdf' });
  }

  async function getPdfDocDetails(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const loadingTask = pdfjs.getDocument({
      data: bytes,
      useWorkerFetch: false,
      isEvalSupported: false,
    });
    const pdf = await loadingTask.promise;
    const pageTexts = [];
    const pageSizes = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      pageTexts.push(textContent.items.map((item) => item.str).join('').trim());
      const viewport = page.getViewport({ scale: 1 });
      pageSizes.push([Math.round(viewport.width), Math.round(viewport.height)]);
    }
    await loadingTask.destroy();
    return { pageCount: pdf.numPages, pageTexts, pageSizes };
  }

  it('copies pages with no redaction losslessly, keeping their real text layer', async () => {
    const file = getFixtureFile('num-5.pdf');
    const blob = await redactPdf(file, []);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
    const details = await getPdfDocDetails(blob);
    expect(details.pageCount).toBe(5);
    // Untouched by redaction, so still real vector text, not a rasterized image.
    expect(details.pageTexts).toEqual(['11', '12', '13', '14', '15']);
  });

  it('flattens only the page carrying a redaction, destroying just that text layer', async () => {
    const file = getFixtureFile('num-5.pdf');
    const blob = await redactPdf(file, [
      { id: 'r1', type: 'blackout', pageIndex: 1, left: 10, top: 10, width: 30, height: 20, color: '#000000' },
    ]);

    const details = await getPdfDocDetails(blob);
    expect(details.pageCount).toBe(5);
    // Page index 1 (the second page, "12") went through the rasterize-and-embed
    // path, so pdf.js can no longer extract any text from it - it's a JPEG now.
    // Every other page is still the original lossless copy.
    expect(details.pageTexts).toEqual(['11', '', '13', '14', '15']);
  });

  it('preserves the original page dimensions on a flattened page', async () => {
    const file = getFixtureFile('num-5.pdf');
    const untouched = await getPdfDocDetails(await redactPdf(file, []));
    const flattened = await getPdfDocDetails(
      await redactPdf(file, [
        { id: 'r1', type: 'blackout', pageIndex: 0, left: 0, top: 0, width: 50, height: 50, color: '#000000' },
      ]),
    );

    // The flattened page is rendered at a higher internal scale for crispness,
    // then re-embedded onto a page sized from the ORIGINAL page's point
    // dimensions - so despite the raster round-trip, the page size in the
    // output PDF should be indistinguishable from an untouched page's.
    expect(flattened.pageSizes[0]).toEqual(untouched.pageSizes[0]);
  });

  it('flattens a blur redaction the same destructive way as a solid one', async () => {
    const file = getFixtureFile('num-5.pdf');
    const blob = await redactPdf(file, [
      { id: 'r1', type: 'blur', pageIndex: 3, left: 0, top: 0, width: 100, height: 100 },
    ]);

    const details = await getPdfDocDetails(blob);
    expect(details.pageCount).toBe(5);
    expect(details.pageTexts).toEqual(['11', '12', '13', '', '15']);
  });

  it('reports progress once per page, ending at 1', async () => {
    const file = getFixtureFile('num-5.pdf');
    const progressValues = [];
    await redactPdf(file, [], (fraction) => progressValues.push(fraction));

    expect(progressValues).toEqual([0.2, 0.4, 0.6, 0.8, 1]);
  });
});
