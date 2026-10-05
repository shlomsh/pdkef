// @ts-nocheck - drives the component with hand-made pdf.js doubles
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reportError = vi.fn();
vi.mock('../lib/errorReport.ts', () => ({ reportError: (...a) => reportError(...a) }));
// jsdom has no 2D context; the component only needs a truthy one.
vi.mock('../lib/pdfRender.js', () => ({ getPdfRenderContext: () => ({ drawImage: vi.fn() }) }));

import PdfPageCanvas from './PdfPageCanvas.tsx';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('PdfPageCanvas when the document is destroyed between getPage and render', () => {
  let host;
  beforeEach(() => {
    reportError.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  afterEach(() => {
    act(() => render(null, host));
    host.remove();
    vi.restoreAllMocks();
  });

  it('swallows the TypeError from page.render and paints nothing', async () => {
    const painted = vi.fn();
    const page = {
      rotate: 0,
      getViewport: () => ({ width: 10, height: 10 }),
      // pdf.js reads `this.#methodPromises` of a destroyed transport
      render: vi.fn(() => { throw new TypeError("Cannot read properties of null (reading 'get')"); }),
      cleanup: vi.fn(),
    };
    let resolvePage;
    const doc = { getPage: () => new Promise((r) => { resolvePage = r; }), loadingTask: { destroyed: true } };

    act(() => render(<PdfPageCanvas pdfDocument={doc} pageNum={1} />, host));
    host.addEventListener('page-painted', painted);
    // the document is replaced and destroyed while getPage is pending
    act(() => render(<PdfPageCanvas pdfDocument={null} pageNum={1} />, host));
    resolvePage(page);
    await act(flush);

    expect(reportError).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
    expect(painted).not.toHaveBeenCalled();
  });

  it('swallows the TypeError when pdfDocument.destroy() ran but the prop still holds the old document', async () => {
    // The real race: the app destroys the old document before Preact has
    // re-rendered, so this effect is still `active` when page.render throws.
    const painted = vi.fn();
    const page = {
      rotate: 0,
      getViewport: () => ({ width: 10, height: 10 }),
      render: vi.fn(() => { throw new TypeError("Cannot read properties of null (reading 'get')"); }),
      cleanup: vi.fn(),
    };
    let resolvePage;
    let destroyed = false;
    const doc = { getPage: () => new Promise((r) => { resolvePage = r; }), loadingTask: { destroyed: false }, destroy: () => { destroyed = true; doc.loadingTask.destroyed = true; } };

    act(() => render(<PdfPageCanvas pdfDocument={doc} pageNum={1} />, host));
    host.addEventListener('page-painted', painted);
    doc.destroy();
    resolvePage(page);
    await act(flush);

    expect(destroyed).toBe(true);
    expect(page.render).toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
    expect(painted).not.toHaveBeenCalled();
  });

  it('swallows the TypeError when the destroy lands after the render started', async () => {
    const painted = vi.fn();
    let rejectRender;
    const page = {
      rotate: 0,
      getViewport: () => ({ width: 10, height: 10 }),
      render: () => ({ promise: new Promise((_, rej) => { rejectRender = rej; }), cancel: vi.fn() }),
      cleanup: vi.fn(),
    };
    const doc = { getPage: async () => page };

    act(() => render(<PdfPageCanvas pdfDocument={doc} pageNum={1} />, host));
    host.addEventListener('page-painted', painted);
    await act(flush);
    act(() => render(<PdfPageCanvas pdfDocument={null} pageNum={1} />, host));
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
    act(() => render(<PdfPageCanvas pdfDocument={doc} pageNum={1} />, host));
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
    act(() => render(<PdfPageCanvas pdfDocument={doc} pageNum={1} />, host));
    await act(flush);
    expect(reportError).toHaveBeenCalledWith('pdf_render', expect.any(TypeError), 'render_page');
  });
});
