import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/telemetry/errorReport.ts', () => ({ reportError: vi.fn() }));
// jsdom has no 2D context; the component only needs a truthy one.
vi.mock('../lib/pdf/pdfRender.js', () => ({ getPdfRenderContext: () => ({ drawImage: vi.fn() }) }));

import type { PDFDocumentProxy } from 'pdfjs-dist';
import { fakePdfDocument } from '../test/support/fakePdfJs.ts';
import PdfPageCanvas from './PdfPageCanvas.tsx';
import { pageRenderScale, bucketWidth } from '../editor/adapters/pdf/pageRenderScale.js';

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const UNIT = { width: 595, height: 842 };

describe('PdfPageCanvas renders at the size the page is shown', () => {
  let host: HTMLElement | null = null;
  let shownWidth: number;
  let observers: { cb: () => void }[];
  let scales: number[];
  let doc: PDFDocumentProxy;

  beforeEach(() => {
    shownWidth = 790;
    observers = [];
    scales = [];
    vi.stubGlobal('devicePixelRatio', 2);
    vi.stubGlobal('ResizeObserver', class {
      cb: () => void;
      constructor(cb: () => void) { this.cb = cb; observers.push(this); }
      observe() {}
      disconnect() {}
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'clientWidth', 'get').mockImplementation(() => shownWidth);
    const page = {
      rotate: 0,
      getViewport: ({ scale }: { scale: number }) => {
        scales.push(scale);
        return { width: UNIT.width * scale, height: UNIT.height * scale };
      },
      render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
      cleanup: vi.fn(),
    };
    doc = fakePdfDocument({ getPage: () => Promise.resolve(page), loadingTask: { destroyed: false } });
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  afterEach(() => {
    act(() => render(null, host!));
    host!.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const expected = (css: number) => pageRenderScale({
    unitWidth: UNIT.width, unitHeight: UNIT.height, cssWidth: bucketWidth(css), dpr: 2,
  });

  it('paints the first time at the displayed device-pixel width, once', async () => {
    act(() => render(<PdfPageCanvas pdfDocument={doc} pageNum={1} />, host!));
    await act(flush);
    const canvas = host!.querySelector<HTMLCanvasElement>('canvas')!;
    expect(canvas.width).toBe(Math.floor(UNIT.width * expected(790)));
    expect(canvas.width).toBeGreaterThan(UNIT.width * 1.5);
    // one paint: the scale-1 size probe plus one render viewport, no repaint at mount
    expect(scales.filter((s) => s !== 1)).toHaveLength(1);
  });

  it('repaints sharper when the shown width grows, and not for a few pixels', async () => {
    act(() => render(<PdfPageCanvas pdfDocument={doc} pageNum={1} />, host!));
    await act(flush);
    const before = scales.length;

    shownWidth = 800; // same 64px bucket as 790
    act(() => observers.forEach((o) => o.cb()));
    await act(flush);
    expect(scales.length).toBe(before);

    shownWidth = 1200;
    act(() => observers.forEach((o) => o.cb()));
    await act(flush);
    expect(host!.querySelector<HTMLCanvasElement>('canvas')!.width).toBe(Math.floor(UNIT.width * expected(1200)));
  });

  it('keeps the old fixed scale when the width cannot be measured', async () => {
    shownWidth = 0;
    act(() => render(<PdfPageCanvas pdfDocument={doc} pageNum={1} />, host!));
    await act(flush);
    expect(host!.querySelector<HTMLCanvasElement>('canvas')!.width).toBe(Math.floor(UNIT.width * 1.5));
  });
});
