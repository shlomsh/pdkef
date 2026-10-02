import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
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
  // Every fillRect and drawImage, in order, with the canvas it landed on,
  // and the canvases the export encoded (the flattened pages).
  let paintOps;
  let encodedCanvases;

  beforeAll(() => {
    originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    originalGetContext = HTMLCanvasElement.prototype.getContext;

    HTMLCanvasElement.prototype.toDataURL = function toDataURL() {
      encodedCanvases.push(this);
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
            return () => {
              fillRectStyles.push(target.fillStyle);
              paintOps.push({ canvas: canvasEl, op: 'fill', style: target.fillStyle });
            };
          }
          if (prop === 'drawImage') {
            return (source) => paintOps.push({ canvas: canvasEl, op: 'draw', source });
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
    paintOps = [];
    encodedCanvases = [];
  });

  afterAll(() => {
    HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  it('copies pages with no redaction losslessly, keeping their real text layer', async () => {
    const file = getFixtureFile('num-5.pdf');
    const { blob } = await redactPdf(file, []);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
    const details = await getPdfDocDetails(blob);
    expect(details.pageCount).toBe(5);
    // Untouched by redaction, so still real vector text, not a rasterized image.
    expect(details.pageTexts).toEqual(['11', '12', '13', '14', '15']);
  });

  // A covered page is saved as one picture with no text layer at all, even
  // where a box misses the page's own text entirely (this box sits in the
  // page's upper-left corner; num-5.pdf's "12" glyph core sits much lower).
  // Every other page is still the original lossless copy.
  it('flattens the page carrying a redaction into a picture with no text, whether or not a box reaches the text', async () => {
    const file = getFixtureFile('num-5.pdf');
    const { blob } = await redactPdf(file, [
      { id: 'r1', type: 'blackout', pageIndex: 1, left: 10, top: 10, width: 30, height: 20, color: '#000000' },
    ]);

    const details = await getPdfDocDetails(blob);
    expect(details.pageCount).toBe(5);
    expect(details.pageTexts).toEqual(['11', '', '13', '14', '15']);
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
    const { blob } = await redactPdf(file, [
      { id: 'r1', type: 'blur', pageIndex: 3, left: 0, top: 0, width: 100, height: 100 },
    ]);

    const details = await getPdfDocDetails(blob);
    expect(details.pageCount).toBe(5);
    expect(details.pageTexts).toEqual(['11', '12', '13', '', '15']);
  });

  // num-5.pdf's pages render at 500x500px at the export's scale of 2.5, so a
  // full-height (100%) box is 500px tall and a half-height (50%) box is
  // 250px tall. blurStrength.ts's factors (light 0.3, medium 0.4, strong 0.5)
  // apply to the box's own height, not the page's.
  it('blurs at UNSET_BLUR_STRENGTH (0.3) when a blur box carries no strength, so an old file exports as it did', async () => {
    const file = getFixtureFile('num-5.pdf');
    await redactPdf(file, [
      { id: 'r1', type: 'blur', pageIndex: 3, left: 0, top: 0, width: 100, height: 100 },
    ]);

    expect(appliedFilters).toEqual(['blur(150px)']);
  });

  // RED-24: radius = factor x max(box height, 24pt). num-5.pdf's pages are
  // 500x500px at the export's 2.5x scale, i.e. 200x200pt, so a 5%-tall box is
  // 10pt high - under the 24pt floor. Medium's floor is exactly the old
  // pre-SITE-41 fixed blur (24px at this same 2.5x scale).
  it('floors a small box\'s radius at the old pre-SITE-41 fixed blur', async () => {
    const file = getFixtureFile('num-5.pdf');
    await redactPdf(file, [
      { id: 'r1', type: 'blur', strength: 'medium', pageIndex: 3, left: 0, top: 0, width: 100, height: 5 },
    ]);

    expect(appliedFilters).toHaveLength(1);
    expect(appliedFilters[0]).toMatch(/^blur\(24(\.\d+)?px\)$/);
  });

  it('blurs at the box\'s own strength, relative to its own height', async () => {
    const file = getFixtureFile('num-5.pdf');
    await redactPdf(file, [
      { id: 'r1', type: 'blur', strength: 'light', pageIndex: 3, left: 0, top: 0, width: 100, height: 100 },
    ]);

    expect(appliedFilters).toEqual(['blur(150px)']);
  });

  it('exports the slider ends: 0.05 and 0.55 of the box\'s own height (RED-30)', async () => {
    const file = getFixtureFile('num-5.pdf');
    await redactPdf(file, [
      { id: 'r1', type: 'blur', strength: 0.05, pageIndex: 3, left: 0, top: 0, width: 100, height: 100 },
      { id: 'r2', type: 'blur', strength: 0.55, pageIndex: 3, left: 0, top: 0, width: 100, height: 100 },
    ]);

    expect(appliedFilters).toEqual(['blur(25px)', 'blur(275px)']);
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

  it('never lets a blur drawn after a blackout paint over it, or sample what it hides', async () => {
    const file = getFixtureFile('num-5.pdf');
    await redactPdf(file, [
      { id: 'b1', type: 'blackout', pageIndex: 3, left: 10, top: 10, width: 40, height: 20, color: '#000000' },
      { id: 'r1', type: 'blur', pageIndex: 3, left: 30, top: 10, width: 40, height: 20 },
    ]);

    const [page] = encodedCanvases;
    const onPage = paintOps.filter((op) => op.canvas === page);
    const firstBlackout = onPage.findIndex((op) => op.op === 'fill' && op.style === '#000000');
    const lastBlackout = onPage.map((op) => op.op === 'fill' && op.style === '#000000').lastIndexOf(true);
    const blurPastes = onPage.map((op, i) => (op.op === 'draw' ? i : -1)).filter((i) => i >= 0);
    // The blackout ends on top of every blur pasted onto the page.
    expect(blurPastes.length).toBeGreaterThan(0);
    expect(lastBlackout).toBeGreaterThan(Math.max(...blurPastes));
    // The blur's source is a copy of the page taken after the blackout was
    // painted, so it never samples the pixels under it.
    const snapshot = paintOps.findIndex((op) => op.op === 'draw' && op.source === page && op.canvas !== page);
    expect(snapshot).toBeGreaterThan(paintOps.indexOf(onPage[firstBlackout]));
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

// A covered page is saved as one picture with no text layer at all
// (2026-09-28); an uncovered page is still the original lossless copy.
describe('redactPdf: a covered page saves with no text layer', () => {
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

  it('saves a covered page with no text at all, while an uncovered page keeps its own', async () => {
    const file = getFixtureFile('num-5.pdf');
    const { blob } = await redactPdf(file, [
      { id: 'r1', type: 'blackout', pageIndex: 1, left: 10, top: 10, width: 30, height: 20, color: '#000000' },
    ]);

    const details = await getPdfDocDetails(blob);
    // pageIndex 1 (the second page, "12") carried the box: no text at all.
    // pageIndex 0 (uncovered) still has its real, lossless text.
    expect(details.pageTexts[1]).toBe('');
    expect(details.pageTexts[0]).toBe('11');
  });
});

// RED-32: brush strokes. A page with a stroke is a covered page (saved as one
// picture, no text layer), a whiteout stroke is painted with the solids in its
// own colour at the brush diameter, and a blur stroke blurs the post-solids
// snapshot clipped to the stroke.
describe('redactPdf: brush strokes', () => {
  let originalToDataURL;
  let originalGetContext;
  let calls;
  let appliedFilters;

  beforeAll(() => {
    originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toDataURL = function toDataURL() {
      calls.push({ canvas: this, op: 'encode' });
      return `data:image/jpeg;base64,${JPEG_1X1_BASE64}`;
    };
    HTMLCanvasElement.prototype.getContext = function getContext() {
      const canvasEl = this;
      const state = { canvas: canvasEl, fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter' };
      return new Proxy(state, {
        get(t, p) {
          if (p in t) return t[p];
          if (p === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
          return (...args) => {
            calls.push({ canvas: canvasEl, op: String(p), args, strokeStyle: t.strokeStyle, fillStyle: t.fillStyle, lineWidth: t.lineWidth, lineCap: t.lineCap, lineJoin: t.lineJoin, composite: t.globalCompositeOperation });
          };
        },
        set(t, p, v) {
          t[p] = v;
          if (p === 'filter' && v !== 'none') appliedFilters.push(v);
          return true;
        },
      });
    };
  });

  beforeEach(() => {
    calls = [];
    appliedFilters = [];
  });

  afterAll(() => {
    HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  const whiteoutStroke = (over = {}) => ({
    id: 's1', type: 'whiteoutStroke', pageIndex: 2, left: 10, top: 40, width: 40, height: 10,
    points: [[20, 45], [40, 45]], sizePt: 20, color: '#dddddd', ...over,
  });

  it('saves a page carrying only a stroke as one picture with no text layer', async () => {
    const { blob } = await redactPdf(getFixtureFile('num-5.pdf'), [whiteoutStroke()]);
    const details = await getPdfDocDetails(blob);
    expect(details.pageTexts).toEqual(['11', '12', '', '14', '15']);
  });

  it('paints a whiteout stroke across the page in its colour at the brush diameter, round-capped', async () => {
    await redactPdf(getFixtureFile('num-5.pdf'), [whiteoutStroke()]);
    const stroke = calls.find((c) => c.op === 'stroke');
    // num-5.pdf renders at 500 x 500px (200 x 200pt, scale 2.5).
    expect(stroke).toMatchObject({ strokeStyle: '#dddddd', lineWidth: 50, lineCap: 'round', lineJoin: 'round' });
    const page = stroke.canvas;
    const path = calls.filter((c) => c.canvas === page && (c.op === 'moveTo' || c.op === 'lineTo'));
    expect(path.map((c) => [c.op, ...c.args])).toEqual([['moveTo', 100, 225], ['lineTo', 200, 225]]);
  });

  it('paints a tap as a disc of the brush diameter', async () => {
    await redactPdf(getFixtureFile('num-5.pdf'), [whiteoutStroke({ points: [[50, 50]], sizePt: 10, left: 45, top: 45, width: 10, height: 10 })]);
    const arc = calls.find((c) => c.op === 'arc');
    expect(arc.args).toEqual([250, 250, 12.5, 0, Math.PI * 2]);
    expect(arc.fillStyle).toBe('#dddddd');
  });

  it('paints a whiteout box in its stored colour with no stroke, on a flattened page', async () => {
    const { blob } = await redactPdf(getFixtureFile('num-5.pdf'), [
      { id: 'w', type: 'whiteout', pageIndex: 0, left: 10, top: 20, width: 30, height: 10, color: '#f7f1de', colorMode: 'auto' },
    ]);
    const page = calls.find((c) => c.op === 'encode').canvas;
    const { width: W, height: H } = page;
    const fill = calls.find((c) => c.op === 'fillRect' && c.canvas === page && c.fillStyle === '#f7f1de');
    expect(fill).toBeTruthy();
    const [x, y, w, h] = fill.args;
    expect(x).toBeCloseTo(0.1 * W);
    expect(y).toBeCloseTo(0.2 * H);
    expect(w).toBeCloseTo(0.3 * W);
    expect(h).toBeCloseTo(0.1 * H);
    expect(calls.filter((c) => c.op === 'strokeRect')).toHaveLength(0);
    expect(calls.filter((c) => c.op === 'stroke' && (c.strokeStyle === '#f7f1de' || c.fillStyle === '#f7f1de'))).toHaveLength(0);
    // Flattened: the covered page is one picture with no text layer.
    const details = await getPdfDocDetails(blob);
    expect(details.pageTexts[0]).toBe('');
    expect(details.pageTexts[1]).toBe('12');
  });

  it('paints a whiteout stroke again after a blur, so a solid always ends on top', async () => {
    await redactPdf(getFixtureFile('num-5.pdf'), [
      whiteoutStroke(),
      { id: 'b1', type: 'blur', pageIndex: 2, left: 0, top: 0, width: 100, height: 100 },
    ]);
    const strokes = calls.filter((c) => c.op === 'stroke');
    expect(strokes).toHaveLength(2);
    const page = strokes[0].canvas;
    const onPage = calls.filter((c) => c.canvas === page);
    const lastDrawImage = onPage.map((c) => c.op).lastIndexOf('drawImage');
    expect(onPage.indexOf(strokes[1])).toBeGreaterThan(lastDrawImage);
  });

  it('blurs a blur stroke at the rule applied to the brush diameter and clips it to the stroke', async () => {
    await redactPdf(getFixtureFile('num-5.pdf'), [
      { id: 's2', type: 'blurStroke', pageIndex: 2, left: 10, top: 40, width: 40, height: 10, points: [[20, 45], [40, 45]], sizePt: 40, strength: 'strong' },
    ]);
    // Diameter 40pt = 100px; strong 0.5 of max(diameter, 24pt) = 50px.
    expect(appliedFilters).toEqual(['blur(50px)']);
    const clip = calls.find((c) => c.op === 'stroke' && c.composite === 'destination-in');
    expect(clip).toMatchObject({ lineWidth: 100, lineCap: 'round', lineJoin: 'round' });
    // The piece is pasted at the stroke's bbox on the page canvas.
    const page = calls.find((c) => c.op === 'encode').canvas;
    const paste = calls.filter((c) => c.canvas === page && c.op === 'drawImage' && c.args.length === 3).pop();
    expect(paste.args.slice(1)).toEqual([50, 200]);
  });

  it('gives a small blur stroke the 24pt-floor radius, like a small box', async () => {
    await redactPdf(getFixtureFile('num-5.pdf'), [
      { id: 's3', type: 'blurStroke', pageIndex: 2, left: 10, top: 40, width: 40, height: 10, points: [[20, 45], [40, 45]], sizePt: 8, strength: 'medium' },
    ]);
    // 8pt brush: medium radius = 0.4 x 24pt = 9.6pt = 24px.
    expect(appliedFilters[0]).toMatch(/^blur\(24(\.\d+)?px\)$/);
  });
});
