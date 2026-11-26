import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cdp } from 'vitest/browser';
import { waitUntil } from '../test/support/waitUntil.ts';
import { PDFDocument } from '@cantoo/pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { getPdfjs } from '#lib/pdf/loadPdfjs.js';
import PdfPageCanvas from './PdfPageCanvas.tsx';
import { pageRenderScale, bucketWidth } from '#editor/adapters/pdf/pageRenderScale.js';

const UNIT = { width: 595, height: 842 };

describe('PdfPageCanvas renders at the size the page is shown, in a real layout', () => {
  let host: HTMLElement;
  let doc: PDFDocumentProxy;
  let paints: number;
  // The size of the page the test runs in (Vitest's tester page, the iframe's parent).
  const screenSize = () => ({ width: window.top!.innerWidth, height: window.top!.innerHeight });

  beforeEach(async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([UNIT.width, UNIT.height]);
    const pdfjs = await getPdfjs();
    doc = await pdfjs.getDocument({ data: new Uint8Array(await pdf.save()) }).promise;
    host = document.createElement('div');
    document.body.appendChild(host);
    paints = 0;
    host.addEventListener('page-painted', () => { paints += 1; });
    // Chromium's own emulation of a denser screen, so the real devicePixelRatio is 2. The size stays the one
    // Playwright gave the page, so nothing else about the layout moves.
    await cdp().send('Emulation.setDeviceMetricsOverride', { ...screenSize(), deviceScaleFactor: 2, mobile: false });
  });
  afterEach(async () => {
    // Back to Playwright's density of 1 at the same size, for the files that run after this one.
    await cdp().send('Emulation.setDeviceMetricsOverride', { ...screenSize(), deviceScaleFactor: 1, mobile: false });
    render(null, host);
    host.remove();
    await doc.loadingTask.destroy();
  });

  // Resolves with the next real paint of the page.
  const nextPaint = () => new Promise<void>((resolve) => host.addEventListener('page-painted', () => resolve(), { once: true }));
  // Resolves once the container's real layout reports a new size.
  const resizeTo = async (width: number) => {
    const settled = new Promise<void>((resolve) => {
      const observer = new ResizeObserver(() => { observer.disconnect(); resolve(); });
      observer.observe(host);
    });
    host.style.width = `${width}px`;
    await settled;
  };
  // Real animation frames, so the product's re-render and the paint it starts get their turn.
  const frames = async (count: number) => { for (let i = 0; i < count; i += 1) await new Promise((r) => requestAnimationFrame(r)); };
  const canvas = () => host.querySelector<HTMLCanvasElement>('canvas')!;
  // The density the page is painted for, 2 here (set in beforeEach).
  const expected = (css: number) => pageRenderScale({
    unitWidth: UNIT.width, unitHeight: UNIT.height, cssWidth: bucketWidth(css), dpr: window.devicePixelRatio,
  });

  it('paints at the shown width once, and repaints sharper when it grows but not for a few pixels', async () => {
    expect(window.devicePixelRatio, 'shown on a denser screen').toBe(2);
    host.style.width = '600px';
    const first = nextPaint();
    render(<PdfPageCanvas pdfDocument={doc} pageNum={1} />, host);
    await first;
    expect(canvas().clientWidth, 'first paint: shown width').toBe(600);
    expect(canvas().width, 'first paint: device-pixel width').toBe(Math.floor(UNIT.width * expected(600)));
    expect(canvas().width, 'first paint: sharper than the page unit').toBeGreaterThan(UNIT.width * 1.5);
    expect(paints, 'first paint: once').toBe(1);
    // the product measures the page again once it has mounted; let that settle before counting
    await frames(5);
    const atRest = paints;
    expect(atRest, 'mount: no second paint for the same width').toBe(1);

    await resizeTo(610); // same 64px bucket as 600
    await frames(5);
    expect(paints, 'a few pixels: no repaint').toBe(atRest);

    await resizeTo(800);
    await waitUntil(() => {
      expect(paints, 'growth: repainted').toBeGreaterThan(atRest);
      expect(canvas().width, 'growth: repainted at the new width').toBe(Math.floor(UNIT.width * expected(800)));
    });
    expect(canvas().width, 'growth: sharper than before').toBeGreaterThan(Math.floor(UNIT.width * expected(600)));
    // the 610 px change made no paint of its own: the 800 px one is the only paint since
    expect(paints, 'growth: one paint since rest').toBe(atRest + 1);
  });
});
