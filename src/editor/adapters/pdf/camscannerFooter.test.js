// @vitest-environment jsdom
//
// CamScanner's free tier stamps "Scanned with CamScanner" across the bottom of
// every exported page, in two shapes: a standalone footer image XObject next
// to the full-page scan, or real Helvetica text plus a Link annotation to
// camscancer.com sitting on top of a full-page image. Both must be gone from
// PDkef's Redact export. This proves it against the same pure export
// functions PdfRedactTool.tsx calls (applyPageEdits.js, which dispatches
// `type: 'delete'` marks to deleteObjectsFromPdf and every other box type to
// redactPdf - see applyPageEdits.js's own docstring), reusing the read-back
// helpers redact.test.js and deleteObjects.test.js already established.
import path from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import {
  PDFDocument,
  StandardFonts,
  PDFName,
  PDFString,
  PDFStream,
  decodePDFRawStream,
} from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPageObjects } from './pdfObjects.js';
import { applyPageEdits } from './applyPageEdits.js';

// Same trick redact.test.js and compress.test.js use: intercept the bare
// specifier redact.js's pdfjsLoader.js reaches for, so the real (non-worker)
// legacy build runs instead of the browser-only default export.
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

// A real, valid 1x1 transparent PNG (67 bytes) - same constant deleteObjects.test.js uses.
const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
// A real, valid 1x1 JPEG - same constant redact.test.js uses.
const JPEG_1X1_BASE64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function objectsOf(bytes) {
  const doc = await PDFDocument.load(bytes);
  return extractPageObjects(doc.getPage(0), 0);
}

/**
 * Raw (still filter-encoded) bytes of one named XObject on a page, for a
 * byte-identity check. `decodePDFRawStream` cannot be used here: it reverses
 * general PDF filters (Flate etc.) but not DCTDecode, and the JPEG scan in
 * these fixtures is stored DCTDecode - `getContents()` is the stream's own
 * stored bytes with no filter interpretation either way, which is exactly
 * what "byte for byte the same object" needs.
 */
function xobjectBytes(page, slashName) {
  const context = page.doc.context;
  const resources = context.lookup(page.node.get(PDFName.of('Resources')));
  const xobjects = context.lookup(resources.get(PDFName.of('XObject')));
  const stream = context.lookup(xobjects.get(PDFName.of(slashName.replace(/^\//, ''))));
  return stream.getContents();
}

/** Every dict/array/stream header and every decompressed stream, lowercased, as one haystack. */
async function decompressedObjectText(doc) {
  let haystack = '';
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const header = obj?.toString?.();
    if (typeof header === 'string') haystack += `${header}\n`;
    if (obj instanceof PDFStream) {
      try {
        const decoded = decodePDFRawStream(obj).decode();
        haystack += `${new TextDecoder('latin1').decode(decoded)}\n`;
      } catch {
        // Binary image data (the flattened JPEG picture itself) doesn't
        // decode as a PDF filter stream here; it can't hold a text URI.
      }
    }
  }
  return haystack.toLowerCase();
}

describe('RED CamScanner footer: A - footer as its own image XObject, removed with Delete', () => {
  async function buildFixtureA() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 300]);

    // Full-page scan image.
    const scan = await doc.embedJpg(b64ToBytes(JPEG_1X1_BASE64));
    page.drawImage(scan, { x: 0, y: 0, width: 200, height: 300 });

    // CamScanner's own footer graphic, its own XObject placed at the bottom.
    const footer = await doc.embedPng(b64ToBytes(PNG_1X1_BASE64));
    page.drawImage(footer, { x: 20, y: 0, width: 160, height: 20 });

    // The real file's shape (SEO-38): a Link on exactly the footer's rect,
    // its URI action registered as its own indirect object (as CamScanner's
    // writer emits it, and as pdf-lib does not by default), plus Info that
    // names the app, device and the exact scan time.
    const linkAction = doc.context.obj({
      Type: 'Action',
      S: 'URI',
      URI: PDFString.of('https://v3.camscanner.com/user/download'),
    });
    const linkAnnot = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [20, 0, 180, 20],
      Border: [0, 0, 0],
      A: doc.context.register(linkAction),
    });
    page.node.addAnnot(doc.context.register(linkAnnot));

    doc.setTitle('CamScanner 05-21-2025 11.14');
    doc.setAuthor('CamScanner');

    return new Uint8Array(await doc.save());
  }

  it('drops only the footer image, keeps the full-page scan drawn, and never flattens the page', async () => {
    const source = await buildFixtureA();

    const before = await objectsOf(source);
    const images = before.objects.filter((o) => o.kind === 'image');
    expect(images).toHaveLength(2);
    // The footer sits in a short band at the very bottom of the page.
    const footerObj = images.find((o) => o.bbox.height < 50);
    const scanObj = images.find((o) => o.bbox.height >= 50);
    expect(footerObj).toBeDefined();
    expect(scanObj).toBeDefined();

    const originalScanBytes = xobjectBytes(
      (await PDFDocument.load(source)).getPage(0),
      scanObj.name,
    );

    const deletion = {
      id: 'del-footer',
      type: 'delete',
      pageIndex: 0,
      start: footerObj.start,
      end: footerObj.end,
    };

    const { blob } = await applyPageEdits(
      new File([source], 'camscanner-a.pdf', { type: 'application/pdf' }),
      [deletion],
    );
    const outBytes = new Uint8Array(await blob.arrayBuffer());

    // The footer image is no longer drawn; the full-page scan still is.
    const after = await objectsOf(outBytes);
    const afterImages = after.objects.filter((o) => o.kind === 'image');
    expect(afterImages).toHaveLength(1);
    expect(afterImages[0].bbox.height).toBeGreaterThanOrEqual(50);

    // Page geometry is untouched.
    const outDoc = await PDFDocument.load(outBytes);
    expect(outDoc.getPageCount()).toBe(1);
    expect(outDoc.getPage(0).getWidth()).toBe(200);
    expect(outDoc.getPage(0).getHeight()).toBe(300);

    // Not flattened: the surviving scan is the SAME XObject, byte for byte -
    // redactPdf's flatten path always re-rasterizes to a fresh JPEG at 2.5x
    // scale, which could never reproduce the original embedded bytes exactly.
    const survivingScanBytes = xobjectBytes(outDoc.getPage(0), afterImages[0].name);
    expect(survivingScanBytes).toEqual(originalScanBytes);

    // The Link over the footer went with it, and no trace of it (or the
    // Info's app name/device/scan time) survives anywhere in the saved file.
    const annots = outDoc.getPage(0).node.Annots();
    expect(annots === undefined || annots.size() === 0).toBe(true);
    expect(await decompressedObjectText(outDoc)).not.toContain('camscanner');
  });
});

describe('RED CamScanner footer: B - footer text + Link annotation, covered with Whiteout', () => {
  let originalToDataURL;
  let originalGetContext;

  beforeAll(() => {
    originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    // redact.js's flatten path rasterizes to a canvas and reads it back with
    // toDataURL(); jsdom implements neither, so both are stubbed exactly as
    // redact.test.js stubs them - what gets painted doesn't matter here, only
    // whether the resulting PDF still carries the footer's text/annotation.
    HTMLCanvasElement.prototype.toDataURL = function toDataURL() {
      return `data:image/jpeg;base64,${JPEG_1X1_BASE64}`;
    };
    HTMLCanvasElement.prototype.getContext = function getContext() {
      const target = { canvas: this, fillStyle: '', strokeStyle: '' };
      return new Proxy(target, {
        get(t, p) {
          if (p in t) return t[p];
          if (p === 'getTransform') {
            return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, invertSelf() { return this; } });
          }
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

  async function buildFixtureB() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 300]);

    const scan = await doc.embedJpg(b64ToBytes(JPEG_1X1_BASE64));
    page.drawImage(scan, { x: 0, y: 0, width: 200, height: 300 });

    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('Scanned with CamScanner', { x: 15, y: 10, size: 10, font });

    // A Link annotation over the footer text, the way CamScanner's free tier
    // wires it: a URI action pointing at camscanner.com.
    const linkAction = doc.context.obj({
      Type: 'Action',
      S: 'URI',
      URI: PDFString.of('https://www.camscanner.com/'),
    });
    const linkAnnot = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [15, 8, 175, 22],
      Border: [0, 0, 0],
      A: linkAction,
    });
    page.node.addAnnot(doc.context.register(linkAnnot));

    return new Uint8Array(await doc.save());
  }

  it('fixture sanity: the source really carries the CamScanner text and Link annotation', async () => {
    const source = await buildFixtureB();
    const sourceDoc = await PDFDocument.load(source);
    expect((await decompressedObjectText(sourceDoc))).toContain('camscanner');
    const annots = sourceDoc.getPage(0).node.Annots();
    expect(annots?.size()).toBe(1);
  });

  it('leaves no extractable "CamScanner" text on the page after Whiteout', async () => {
    const source = await buildFixtureB();
    const whiteout = {
      id: 'w1', type: 'whiteout', pageIndex: 0,
      left: 0, top: 85, width: 100, height: 15, color: '#ffffff',
    };

    const { blob } = await applyPageEdits(
      new File([source], 'camscanner-b.pdf', { type: 'application/pdf' }),
      [whiteout],
    );
    const outBytes = new Uint8Array(await blob.arrayBuffer());

    const loadingTask = pdfjs.getDocument({
      data: outBytes,
      useWorkerFetch: false,
      isEvalSupported: false,
    });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str).join('');
    await loadingTask.destroy();

    expect(pageText.toLowerCase()).not.toContain('camscanner');
  });

  it('leaves no Link annotation and no "camscanner" URI anywhere in the saved bytes after Whiteout', async () => {
    const source = await buildFixtureB();
    const whiteout = {
      id: 'w1', type: 'whiteout', pageIndex: 0,
      left: 0, top: 85, width: 100, height: 15, color: '#ffffff',
    };

    const { blob } = await applyPageEdits(
      new File([source], 'camscanner-b.pdf', { type: 'application/pdf' }),
      [whiteout],
    );
    const outBytes = new Uint8Array(await blob.arrayBuffer());
    const outDoc = await PDFDocument.load(outBytes);

    const annots = outDoc.getPage(0).node.Annots();
    expect(annots === undefined || annots.size() === 0).toBe(true);

    const haystack = await decompressedObjectText(outDoc);
    expect(haystack).not.toContain('camscanner');
  });
});
