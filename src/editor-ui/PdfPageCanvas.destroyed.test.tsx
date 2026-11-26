import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/telemetry/errorReport.ts', { spy: true });

import { PDFDocument } from '@cantoo/pdf-lib';
import { getPdfjs } from '#lib/pdf/loadPdfjs.js';
import '../test/support/realPdfjs.ts';
import { fakePdfDocument } from '../test/support/fakePdfJs.ts';
import { drainPromises } from '../test/support/drainPromises.ts';
import PdfPageCanvas from './PdfPageCanvas.tsx';
import { reportError } from '#lib/telemetry/errorReport.ts';

const flush = () => drainPromises();

async function openDocument() {
  const pdf = await PDFDocument.create();
  pdf.addPage([10, 10]);
  return (await getPdfjs()).getDocument({ data: new Uint8Array(await pdf.save()) }).promise;
}

describe('PdfPageCanvas when the document is destroyed between getPage and render', () => {
  let host: HTMLElement | null = null;
  beforeEach(() => {
    vi.mocked(reportError).mockClear();
    vi.spyOn(console, 'error');
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  afterEach(() => {
    act(() => render(null, host!));
    host!.remove();
    vi.restoreAllMocks();
  });

  it('swallows the TypeError from page.render and paints nothing', async () => {
    const painted = vi.fn();
    const doc = await openDocument();
    await doc.getPage(1); // loaded, so the page the canvas asks for next is already there

    act(() => render(<PdfPageCanvas pdfDocument={doc} pageNum={1} />, host!));
    host!.addEventListener('page-painted', painted);
    // the document is replaced and destroyed while getPage is pending
    act(() => render(<PdfPageCanvas pdfDocument={null} pageNum={1} />, host!));
    await doc.loadingTask.destroy();
    await act(flush);

    expect(reportError).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
    expect(painted).not.toHaveBeenCalled();
  });

  it('swallows the TypeError when pdfDocument.destroy() ran but the prop still holds the old document', async () => {
    // The real race: the app destroys the old document before Preact has
    // re-rendered, so this effect is still `active` when page.render throws.
    const painted = vi.fn();
    const doc = await openDocument();
    const page = await doc.getPage(1);
    const renderPage = vi.spyOn(page, 'render');
    const held = Promise.withResolvers<typeof page>();
    // Forced: holds the real page until its document is destroyed; pdf.js has no such pause (a request pending at destroy is
    // rejected with 'Transport destroyed', and one made after it fails before page.render is reached).
    vi.spyOn(doc, 'getPage').mockReturnValue(held.promise);

    act(() => render(<PdfPageCanvas pdfDocument={doc} pageNum={1} />, host!));
    host!.addEventListener('page-painted', painted);
    await doc.loadingTask.destroy();
    held.resolve(page);
    await act(flush);

    expect(doc.loadingTask.destroyed).toBe(true);
    // pdf.js's own throw, from a transport that is gone
    expect(renderPage.mock.results.map((r) => [r.type, r.value instanceof TypeError])).toEqual([['throw', true]]);
    expect(reportError).not.toHaveBeenCalled();
    expect(painted).not.toHaveBeenCalled();
  });

  it('swallows the TypeError when the destroy lands after the render started', async () => {
    const painted = vi.fn();
    let rejectRender!: (reason: unknown) => void;
    const page = {
      rotate: 0,
      getViewport: () => ({ width: 10, height: 10 }),
      render: () => ({ promise: new Promise((_, rej) => { rejectRender = rej; }), cancel: vi.fn() }),
      cleanup: vi.fn(),
    };
    const doc = { getPage: async () => page };

    act(() => render(<PdfPageCanvas pdfDocument={fakePdfDocument(doc)} pageNum={1} />, host!));
    host!.addEventListener('page-painted', painted);
    await act(flush);
    act(() => render(<PdfPageCanvas pdfDocument={null} pageNum={1} />, host!));
    rejectRender(new TypeError("Cannot read properties of null (reading 'get')"));
    await act(flush);

    expect(reportError).not.toHaveBeenCalled();
    expect(painted).not.toHaveBeenCalled();
  });

  it('still reports a genuine render failure on a live document', async () => {
    const page = {
      rotate: 0,
      getViewport: () => ({ width: 10, height: 10 }),
      render: () => ({ promise: Promise.reject(new Error('bad content stream')), cancel: vi.fn() }),
      cleanup: vi.fn(),
    };
    const doc = { getPage: async () => page };
    act(() => render(<PdfPageCanvas pdfDocument={fakePdfDocument(doc)} pageNum={1} />, host!));
    await act(flush);
    expect(reportError).toHaveBeenCalledWith('pdf_render', expect.any(Error), 'render_page');
  });

  it('still reports a synchronous TypeError from page.render on a live document', async () => {
    const page = {
      rotate: 0,
      getViewport: () => ({ width: 10, height: 10 }),
      render: () => { throw new TypeError('genuine bug'); },
      cleanup: vi.fn(),
    };
    const doc = { getPage: async () => page, loadingTask: { destroyed: false } };
    act(() => render(<PdfPageCanvas pdfDocument={fakePdfDocument(doc)} pageNum={1} />, host!));
    await act(flush);
    expect(reportError).toHaveBeenCalledWith('pdf_render', expect.any(TypeError), 'render_page');
  });
});
