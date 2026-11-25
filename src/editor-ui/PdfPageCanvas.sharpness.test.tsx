import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { drainPromises } from '../test/support/drainPromises.ts';
import { pointAtLegacyWorker } from '../test/support/realPdfjs.ts';
import PdfPageCanvas from './PdfPageCanvas.tsx';
import { pageRenderScale, bucketWidth } from '#editor/adapters/pdf/pageRenderScale.js';

pointAtLegacyWorker(pdfjs);
const UNIT = { width: 595, height: 842 };

describe('PdfPageCanvas renders at the size the page is shown', () => {
  let host: HTMLElement | null = null;
  let shownWidth: number;
  let observers: { cb: () => void }[];
  let viewportSpy: { mock: { calls: Array<[{ scale: number }?]> } };
  const scales = () => viewportSpy.mock.calls.map(([params]) => params!.scale);
  let doc: PDFDocumentProxy;

  beforeEach(async () => {
    shownWidth = 790;
    observers = [];
    // Forced: jsdom has no screen density, so the test sets it.
    window.devicePixelRatio = 2;
    // Forced: jsdom never calls a ResizeObserver back, so the test calls it.
    vi.stubGlobal('ResizeObserver', class {
      cb: () => void;
      constructor(cb: () => void) { this.cb = cb; observers.push(this); }
      observe() {}
      disconnect() {}
    });
    // Forced: jsdom has no layout, so the shown width is the test's own number.
    vi.spyOn(HTMLCanvasElement.prototype, 'clientWidth', 'get').mockImplementation(() => shownWidth);
    const pdf = await PDFDocument.create();
    pdf.addPage([UNIT.width, UNIT.height]);
    doc = await pdfjs.getDocument({ data: new Uint8Array(await pdf.save()) }).promise;
    const page = await doc.getPage(1);
    viewportSpy = vi.spyOn(page, 'getViewport');
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  afterEach(async () => {
    act(() => render(null, host!));
    host!.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    // Forced: puts jsdom's own density back.
    window.devicePixelRatio = 1;
    await doc.loadingTask.destroy();
  });

  // Resolves with the next real paint of the page.
  const nextPaint = () => new Promise<void>((resolve) => host!.addEventListener('page-painted', () => resolve(), { once: true }));

  const expected = (css: number) => pageRenderScale({
    unitWidth: UNIT.width, unitHeight: UNIT.height, cssWidth: bucketWidth(css), dpr: 2,
  });

  it('paints the first time at the displayed device-pixel width, once', async () => {
    const painted = nextPaint();
    act(() => render(<PdfPageCanvas pdfDocument={doc} pageNum={1} />, host!));
    await act(() => painted);
    const canvas = host!.querySelector<HTMLCanvasElement>('canvas')!;
    expect(canvas.width).toBe(Math.floor(UNIT.width * expected(790)));
    expect(canvas.width).toBeGreaterThan(UNIT.width * 1.5);
    // one paint: the scale-1 size probe plus one render viewport, no repaint at mount
    expect(scales().filter((s) => s !== 1)).toHaveLength(1);
  });

  it('repaints sharper when the shown width grows, and not for a few pixels', async () => {
    const painted = nextPaint();
    act(() => render(<PdfPageCanvas pdfDocument={doc} pageNum={1} />, host!));
    await act(() => painted);
    const before = scales().length;

    shownWidth = 800; // same 64px bucket as 790
    act(() => observers.forEach((o) => o.cb()));
    await act(drainPromises);
    expect(scales().length).toBe(before);

    shownWidth = 1200;
    const repainted = nextPaint();
    act(() => observers.forEach((o) => o.cb()));
    await act(() => repainted);
    expect(host!.querySelector<HTMLCanvasElement>('canvas')!.width).toBe(Math.floor(UNIT.width * expected(1200)));
    // the 800 px change made no paint of its own: one probe and one render each for 790 and 1200
    expect(scales().filter((s) => s !== 1)).toHaveLength(2);
  });

  it('keeps the old fixed scale when the width cannot be measured', async () => {
    shownWidth = 0;
    const painted = nextPaint();
    act(() => render(<PdfPageCanvas pdfDocument={doc} pageNum={1} />, host!));
    await act(() => painted);
    expect(host!.querySelector<HTMLCanvasElement>('canvas')!.width).toBe(Math.floor(UNIT.width * 1.5));
  });
});
