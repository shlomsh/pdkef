import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { pathToFileURL } from 'url';
import { describe, expect, it, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { redactPdf } from './redact.js';

// redact.js reaches pdfjs through sign.js's getPdfjs(), which does a dynamic
// `import('pdfjs-dist')` - this mock intercepts that specifier for any caller,
// same trick compress.test.js uses so the real (non-worker-dependent) legacy
// build runs instead of the browser-only default export.
vi.mock('pdfjs-dist', async () => {
  return await import('pdfjs-dist/legacy/build/pdf.mjs');
});

beforeAll(() => {
  const workerPath = path.resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
  const workerUrl = pathToFileURL(workerPath).href;

  Object.defineProperty(pdfjs.GlobalWorkerOptions, 'workerSrc', {
    get() { return workerUrl; },
    set() { /* ignore - keep it pointed at the real worker file */ },
    configurable: true,
  });
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
  // Every time a mocked 2D context has `.filter` set, the value lands here in
  // order. Only the blur flatten path in redact.js ever sets `.filter`, so
  // this array's length is exactly the number of blurred canvases built.
  let appliedFilters;
  // Every `fillRect()` call on a mocked 2D context records the fillStyle it
  // was called with, in order. buildBoxBlur's opaque-white fill is the only
  // fillRect on a temp (blur) canvas; a solid redaction box's fillRect lands
  // here too, with its own color.
  let fillRectStyles;

  beforeAll(() => {
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
          if (prop === 'fillRect') {
            return () => fillRectStyles.push(target.fillStyle);
          }
          return vi.fn();
        },
        set(target, prop, value) {
          target[prop] = value;
          if (prop === 'filter' && value !== 'none') {
            appliedFilters.push(value);
          }
          return true;
        },
      });
    };
  });

  beforeEach(() => {
    appliedFilters = [];
    fillRectStyles = [];
  });

  afterAll(() => {
    HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  it('copies pages with no redaction losslessly, keeping their real text layer', async () => {
    const file = getFixtureFile('num-5.pdf');
    const { blob, pictureOnlyPages } = await redactPdf(file, []);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
    expect(pictureOnlyPages).toEqual([]);
    const details = await getPdfDocDetails(blob);
    expect(details.pageCount).toBe(5);
    // Untouched by redaction, so still real vector text, not a rasterized image.
    expect(details.pageTexts).toEqual(['11', '12', '13', '14', '15']);
  });

  // This box (10-40% left, 10-30% top) sits in the page's upper-left corner;
  // num-5.pdf's "12" glyph core sits much lower (its baseline is at 41% up
  // from the bottom), so the box never reaches it - confirmed by planning
  // this exact box against the fixture's real glyphs (planTextLayer kept: 1,
  // dropped: 0). The page still goes through the rasterize-and-embed path
  // (RED-12 flattens any page carrying a box, whether or not it lands on
  // text), but since the box misses the number, RED-12's invisible layer
  // keeps it selectable in the saved file - this is no longer a "the text is
  // gone" case, and asserting '' here would just be re-asserting the old,
  // pre-RED-12 behaviour.
  it('flattens the page carrying a redaction, but keeps text a box does not reach', async () => {
    const file = getFixtureFile('num-5.pdf');
    const { blob, pictureOnlyPages } = await redactPdf(file, [
      { id: 'r1', type: 'blackout', pageIndex: 1, left: 10, top: 10, width: 30, height: 20, color: '#000000' },
    ]);

    expect(pictureOnlyPages).toEqual([]);
    const details = await getPdfDocDetails(blob);
    expect(details.pageCount).toBe(5);
    // Page index 1 (the second page, "12") was rasterized, but the box misses
    // its glyphs, so the invisible text layer still carries "12" over the
    // picture. Every other page is still the original lossless copy.
    expect(details.pageTexts).toEqual(['11', '12', '13', '14', '15']);
  });

  it('preserves the original page dimensions on a flattened page', async () => {
    const file = getFixtureFile('num-5.pdf');
    const untouched = await getPdfDocDetails((await redactPdf(file, [])).blob);
    const flattened = await getPdfDocDetails(
      (
        await redactPdf(file, [
          { id: 'r1', type: 'blackout', pageIndex: 0, left: 0, top: 0, width: 50, height: 50, color: '#000000' },
        ])
      ).blob,
    );

    // The flattened page is rendered at a higher internal scale for crispness,
    // then re-embedded onto a page sized from the ORIGINAL page's point
    // dimensions - so despite the raster round-trip, the page size in the
    // output PDF should be indistinguishable from an untouched page's.
    expect(flattened.pageSizes[0]).toEqual(untouched.pageSizes[0]);
  });

  it('flattens a blur redaction the same destructive way as a solid one', async () => {
    const file = getFixtureFile('num-5.pdf');
    const { blob, pictureOnlyPages } = await redactPdf(file, [
      { id: 'r1', type: 'blur', pageIndex: 3, left: 0, top: 0, width: 100, height: 100 },
    ]);

    // A full-page (100%x100%) box covers every glyph on the page, so unlike
    // the box above, this one really does leave nothing behind: '' is still
    // correct.
    expect(pictureOnlyPages).toEqual([]);
    const details = await getPdfDocDetails(blob);
    expect(details.pageCount).toBe(5);
    expect(details.pageTexts).toEqual(['11', '12', '13', '', '15']);
  });

  // num-5.pdf's pages render at 500x500px at the export's scale of 2.5, so a
  // full-height (100%) box is 500px tall and a half-height (50%) box is
  // 250px tall. blurStrength.ts's factors (light 0.3, medium 0.4, strong 0.5)
  // apply to the box's own height, not the page's.
  it('blurs at strong (half the box height) when a blur box carries no strength', async () => {
    const file = getFixtureFile('num-5.pdf');
    await redactPdf(file, [
      { id: 'r1', type: 'blur', pageIndex: 3, left: 0, top: 0, width: 100, height: 100 },
    ]);

    expect(appliedFilters).toEqual(['blur(250px)']);
  });

  it('blurs at the box\'s own strength, relative to its own height', async () => {
    const file = getFixtureFile('num-5.pdf');
    await redactPdf(file, [
      { id: 'r1', type: 'blur', strength: 'light', pageIndex: 3, left: 0, top: 0, width: 100, height: 100 },
    ]);

    expect(appliedFilters).toEqual(['blur(150px)']);
  });

  it('gives two boxes of different heights different radii', async () => {
    const file = getFixtureFile('num-5.pdf');

    await redactPdf(file, [
      { id: 'r1', type: 'blur', strength: 'strong', pageIndex: 3, left: 0, top: 0, width: 50, height: 50 },
      { id: 'r2', type: 'blur', strength: 'strong', pageIndex: 3, left: 0, top: 50, width: 100, height: 20 },
    ]);

    // r1: 50% of 500px = 250px tall -> strong radius 125px.
    // r2: 20% of 500px = 100px tall -> strong radius 50px.
    expect(appliedFilters).toEqual(['blur(125px)', 'blur(50px)']);
  });

  it('fills the temp canvas with opaque white before drawing the blurred region', async () => {
    const file = getFixtureFile('num-5.pdf');
    await redactPdf(file, [
      { id: 'r1', type: 'blur', pageIndex: 3, left: 0, top: 0, width: 100, height: 100 },
    ]);

    expect(fillRectStyles).toContain('#ffffff');
  });

  it('reports progress once per page, ending at 1', async () => {
    const file = getFixtureFile('num-5.pdf');
    const progressValues = [];
    await redactPdf(file, [], (fraction) => progressValues.push(fraction));

    expect(progressValues).toEqual([0.2, 0.4, 0.6, 0.8, 1]);
  });
});

// RED-12/RED-09: what the invisible text layer keeps, drops and falls back
// on. These build their own one-page fixtures (rather than reusing num-5.pdf,
// whose pages hold one bare number each) because they need several words on
// one line to test word-level keep/drop decisions.
describe('redactPdf: the invisible text layer (RED-12/RED-09)', () => {
  // Same canvas/JPEG stubs as the describe block above; duplicated rather
  // than shared across `describe`s because vitest's per-file beforeAll only
  // needs to run once either way, but keeping each block's fixture setup
  // next to the tests that read it is worth the few duplicated lines.
  let originalToDataURL;
  let originalGetContext;

  beforeAll(() => {
    originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toDataURL = function toDataURL() {
      return `data:image/jpeg;base64,${JPEG_1X1_BASE64}`;
    };
    HTMLCanvasElement.prototype.getContext = function getContext() {
      const target = { canvas: this, fillStyle: '', strokeStyle: '' };
      return new Proxy(target, {
        get(t, p) {
          if (p in t) return t[p];
          if (p === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
          return () => {};
        },
        set(t, p, v) {
          t[p] = v;
          return true;
        },
      });
    };
  });

  afterAll(() => {
    HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * A one-page, 300x100pt fixture with three words on one baseline:
   * "LEFT MIDDLE RIGHT", Helvetica 24pt, baseline at y=50. Word x-ranges
   * (from `font.widthOfTextAtSize`, confirmed against the real pdf.js
   * operator list): LEFT 20-78.68, MIDDLE 85.352-176.024, RIGHT 182.696-257.36.
   */
  async function buildThreeWordFixture() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 100]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('LEFT MIDDLE RIGHT', { x: 20, y: 50, size: 24, font });
    const bytes = new Uint8Array(await doc.save());
    return new File([bytes], 'three-words.pdf', { type: 'application/pdf' });
  }

  // A box over MIDDLE's x-range (82-181pt, with margin clear of LEFT's 78.68
  // and RIGHT's 182.696) and over the glyphs' vertical core band, computed
  // and confirmed against `planTextLayer` directly: it drops exactly the
  // MIDDLE word (kept: 1 run of "LEFT RIGHT", dropped: 1) and touches neither
  // neighbour.
  const MIDDLE_BOX = {
    id: 'r1',
    type: 'blackout',
    pageIndex: 0,
    left: (82 / 300) * 100,
    top: 30,
    width: ((181 - 82) / 300) * 100,
    height: 27,
    color: '#000000',
  };

  async function getPageTexts(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const loaded = await pdfjs.getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false }).promise;
    const page = await loaded.getPage(1);
    const tc = await page.getTextContent();
    return tc.items.map((item) => item.str);
  }

  /** Every `stream ... endstream` body in the saved PDF, inflated where it is
   * a flate stream (the invisible font's ToUnicode CMap, the page's own
   * content stream) and kept raw otherwise (the embedded JPEG picture), all
   * concatenated - so a literal search below covers everything the file
   * actually stores, not just the parts that happen to compress. */
  function inflateAllStreams(bytes) {
    const text = Buffer.from(bytes).toString('latin1');
    const re = /stream\r?\n([\s\S]*?)[\r\n]*endstream/g;
    const decoded = [];
    let match;
    while ((match = re.exec(text)) !== null) {
      const raw = Buffer.from(match[1], 'latin1');
      try {
        decoded.push(zlib.inflateSync(raw));
      } catch {
        decoded.push(raw);
      }
    }
    return Buffer.concat(decoded);
  }

  function utf16BEBytes(text) {
    const buf = Buffer.alloc(text.length * 2);
    for (let i = 0; i < text.length; i += 1) buf.writeUInt16BE(text.charCodeAt(i), i * 2);
    return buf;
  }

  it('keeps the words on either side of a boxed middle word, and drops the boxed one', async () => {
    const file = await buildThreeWordFixture();
    const { blob, pictureOnlyPages } = await redactPdf(file, [MIDDLE_BOX]);

    // pdf.js may split the line at the gap the dropped word left; what
    // matters is the words and their order.
    expect((await getPageTexts(blob)).join('').split(/\s+/)).toEqual(['LEFT', 'RIGHT']);
    expect(pictureOnlyPages).toEqual([]);
  });

  it('never writes the boxed word into the saved bytes, inflated or not, as text or as UTF-16BE', async () => {
    const file = await buildThreeWordFixture();
    const { blob } = await redactPdf(file, [MIDDLE_BOX]);
    const inflated = inflateAllStreams(new Uint8Array(await blob.arrayBuffer()));

    expect(inflated.includes(Buffer.from('MIDDLE', 'ascii'))).toBe(false);
    expect(inflated.includes(utf16BEBytes('MIDDLE'))).toBe(false);
  });

  // RED-09 sabotage: force planTextLayer to plan as if MIDDLE's box were not
  // there (re-running the real planner with `boxes = []`), so the layer it
  // writes claims MIDDLE too even though a box covers it. `textLayerReadsBack`
  // must catch this on the read-back pass and redact.js must save the page
  // again as its picture alone, listing it in `pictureOnlyPages` - proving
  // the read-back check is what actually protects a covered word, not just
  // the planner getting it right the first time.
  it('RED-09: falls back to picture-only when the written layer does not match its box', async () => {
    vi.doMock('./textLayer.ts', async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        planTextLayer: (glyphs, geometry) => actual.planTextLayer(glyphs, geometry, []),
      };
    });
    vi.resetModules();
    const { redactPdf: sabotagedRedactPdf } = await import('./redact.js');

    const file = await buildThreeWordFixture();
    const { blob, pictureOnlyPages } = await sabotagedRedactPdf(file, [MIDDLE_BOX]);

    expect(pictureOnlyPages).toEqual([0]);
    expect(await getPageTexts(blob)).toEqual([]);

    vi.doUnmock('./textLayer.ts');
    vi.resetModules();
  });

  it('saves a page whose glyphs cannot be read as its picture alone, and lists it, leaving other pages untouched', async () => {
    const file = getFixtureFile('num-5.pdf');
    // num-5.pdf's page 2 (pageIndex 1, "12") is the one boxed here; make
    // reading its glyphs throw so redact.js falls back to the picture alone,
    // the same as a broken content stream or an unresolved font would.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const probe = await pdfjs.getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false }).promise;
    const targetPage = await probe.getPage(2); // pageIndex 1, one-based here
    const proto = Object.getPrototypeOf(targetPage);
    const original = proto.getOperatorList;
    vi.spyOn(proto, 'getOperatorList').mockImplementation(function unreadable(...args) {
      if (this.pageNumber === 2) throw new Error('simulated: glyphs could not be read');
      return original.apply(this, args);
    });

    const { blob, pictureOnlyPages } = await redactPdf(file, [
      { id: 'r1', type: 'blackout', pageIndex: 1, left: 10, top: 10, width: 30, height: 20, color: '#000000' },
    ]);

    expect(pictureOnlyPages).toEqual([1]);
    const details = await getPdfDocDetails(blob);
    // The unreadable page is a picture with no text at all; every other page
    // is still the original lossless copy, untouched by the sabotage.
    expect(details.pageTexts).toEqual(['11', '', '13', '14', '15']);
  });
});
