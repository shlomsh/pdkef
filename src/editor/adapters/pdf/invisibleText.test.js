import path from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, it, beforeAll } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createInvisibleFont, drawInvisibleText } from './invisibleText.js';
import { readPageGlyphs } from './pageGlyphs.ts';
import { getPageContentBytes } from './pdfObjects.js';

// Same trick redact.test.js uses: point pdf.js at the real (non-worker-dependent)
// legacy build's own worker file, so getOperatorList/getTextContent can run
// without a browser worker.
beforeAll(() => {
  const workerPath = path.resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
  const workerUrl = pathToFileURL(workerPath).href;
  Object.defineProperty(pdfjs.GlobalWorkerOptions, 'workerSrc', {
    get() { return workerUrl; },
    set() { /* ignore - keep it pointed at the real worker file */ },
    configurable: true,
  });
});

const PAGE_WIDTH = 600;
const PAGE_HEIGHT = 800;

/** A viewport-space (top-left origin) run, the shape planTextLayer produces. */
function run(matrix, glyphs) {
  return { matrix, glyphs };
}

async function buildDocWithRuns(runs) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = createInvisibleFont(doc);
  for (const oneCallsWorth of runs) {
    drawInvisibleText(doc, page, font, oneCallsWorth);
  }
  font.finish();
  return new Uint8Array(await doc.save());
}

async function loadPdfjsPage(bytes) {
  const loadingTask = pdfjs.getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  return { pdf, page, destroy: () => loadingTask.destroy() };
}

async function readGlyphsBack(page) {
  const operatorList = await page.getOperatorList({ annotationMode: pdfjs.AnnotationMode.DISABLE });
  return readPageGlyphs(operatorList, pdfjs.OPS, (name) => {
    try {
      return page.commonObjs.get(name);
    } catch {
      return null;
    }
  });
}

describe('createInvisibleFont / drawInvisibleText', () => {
  // A Latin run and a Hebrew run, each with distinct per-glyph widths, plus a
  // character outside the BMP ('𝒜', a surrogate pair) so ToUnicode/decoding of
  // non-BMP text is exercised too.
  const latin = [
    { unicode: 'h', x: 0, width: 0.5 },
    { unicode: 'i', x: 0.5, width: 0.3 },
    { unicode: ' ', x: 0.8, width: 0.3 },
    { unicode: 't', x: 1.1, width: 0.3 },
    { unicode: 'h', x: 1.4, width: 0.5 },
    { unicode: 'e', x: 1.9, width: 0.5 },
    { unicode: 'r', x: 2.4, width: 0.3 },
    { unicode: 'e', x: 2.7, width: 0.5 },
  ];
  const hebrew = [
    { unicode: 'ש', x: 0, width: 0.6 },
    { unicode: 'ל', x: 0.6, width: 0.4 },
    { unicode: 'ו', x: 1.0, width: 0.3 },
    { unicode: 'ם', x: 1.3, width: 0.6 },
    { unicode: ' ', x: 1.9, width: 0.3 },
    { unicode: '𝒜', x: 2.2, width: 0.7 },
  ];
  const latinRun = run([10, 0, 0, 10, 50, 100], latin);
  const hebrewRun = run([12, 0, 0, 12, 50, 200], hebrew);
  // The same non-BMP character written again elsewhere, at a different width.
  const secondWidthRun = run([20, 0, 0, 20, 300, 400], [{ unicode: '𝒜', x: 0, width: 0.9 }]);

  async function buildSample() {
    return buildDocWithRuns([[latinRun, hebrewRun], [secondWidthRun]]);
  }

  it('reads back the written words through getTextContent', async () => {
    const bytes = await buildSample();
    const { page, destroy } = await loadPdfjsPage(bytes);
    const textContent = await page.getTextContent();
    const words = textContent.items.map((item) => item.str);
    expect(words).toContain('hi there');
    // pdf.js's own getTextContent applies bidi reordering for display, so the
    // Hebrew word and the lone non-BMP glyph may not appear in writing order;
    // it is enough that every written word is present somewhere.
    expect(words.join(' ')).toContain('שלום'.split('').reverse().join(''));
    await destroy();
  });

  it('recovers glyph origins within 0.01pt and matching widths through readPageGlyphs', async () => {
    const bytes = await buildSample();
    const { page, destroy } = await loadPdfjsPage(bytes);
    const glyphs = await readGlyphsBack(page);

    const latinGlyphs = glyphs.filter((g) => Math.abs(g.matrix[0] - 10) < 0.01);
    expect(latinGlyphs).toHaveLength(latin.length);
    latinGlyphs.forEach((g, i) => {
      const expected = latinRun.matrix;
      const expectedX = expected[4] + latin[i].x * expected[0];
      const expectedY = PAGE_HEIGHT - expected[5];
      expect(g.matrix[4]).toBeCloseTo(expectedX, 2);
      expect(g.matrix[5]).toBeCloseTo(expectedY, 2);
      expect(g.width).toBeCloseTo(latin[i].width, 2);
    });

    await destroy();
  });

  it('matches Hebrew glyph origins and widths the same way', async () => {
    const bytes = await buildSample();
    const { page, destroy } = await loadPdfjsPage(bytes);
    const glyphs = await readGlyphsBack(page);

    // readPageGlyphs walks the operator list in drawing (content) order, which
    // is the order this module wrote the runs in - unlike getTextContent above.
    // Filtered by the Hebrew run's own font size (12) to exclude the Latin
    // run's space and the unrelated second '𝒜' written at size 20 elsewhere.
    const hebrewGlyphs = glyphs.filter((g) => Math.abs(g.matrix[0] - 12) < 0.01);
    expect(hebrewGlyphs.map((g) => g.unicode)).toEqual(hebrew.map((h) => h.unicode));
    hebrewGlyphs.forEach((g, i) => {
      const expected = hebrewRun.matrix;
      const expectedX = expected[4] + hebrew[i].x * expected[0];
      const expectedY = PAGE_HEIGHT - expected[5];
      expect(g.matrix[4]).toBeCloseTo(expectedX, 2);
      expect(g.matrix[5]).toBeCloseTo(expectedY, 2);
      expect(g.width).toBeCloseTo(hebrew[i].width, 2);
    });

    await destroy();
  });

  it('gives the same character written at two widths two different codes', () => {
    // Pure font-object behaviour, no pdf.js round trip needed: the font maps
    // (unicode, width) pairs to codes, and a repeat of the same pair dedupes.
    return (async () => {
      const doc = await PDFDocument.create();
      const font = createInvisibleFont(doc);
      const first = font.code('𝒜', 700);
      const second = font.code('𝒜', 900);
      const firstAgain = font.code('𝒜', 700);
      expect(first).not.toBe(second);
      expect(firstAgain).toBe(first);
    })();
  });

  it('sets text render mode 3 (never drawn) in the content stream', async () => {
    const bytes = await buildSample();
    const doc = await PDFDocument.load(bytes);
    const contentBytes = getPageContentBytes(doc.getPage(0));
    const contentText = new TextDecoder('latin1').decode(contentBytes);
    expect(contentText).toContain('3 Tr');
  });
});
