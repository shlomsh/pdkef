// @ts-nocheck - test-only, mirrors PdfEditPagesTool.test.tsx's untyped style
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import PdfEditPagesTool from './PdfEditPagesTool.tsx';
import { editPages } from './editPages.js';
import { openThumbnailSource } from '../../lib/thumbnails.js';
import { loadPdfWithPages } from '../../lib/loadPdfPages.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';

// DEBT-54: a file whose page list was lost is repaired once on open; the
// grid (pdf.js) and the export must both read the repaired bytes while the
// person's file keeps its identity.

vi.mock('../../lib/loadPdfPages.ts', () => ({ loadPdfWithPages: vi.fn() }));

// The stub files here are not PDFs: the encryption gate must not run real pdf.js on them.
vi.mock('../../lib/pdfEncryption.ts', () => ({ probeEncryption: vi.fn(async () => 'open') }));

vi.mock('../../lib/thumbnails.js', () => ({
  renderThumbnail: vi.fn(() => Promise.resolve(null)),
  openThumbnailSource: vi.fn(async (file) => ({
    file,
    pageCount: 2,
    render: vi.fn(async (pageIndex) => `data:image/png;base64,t${pageIndex}`),
    destroy: vi.fn(async () => {}),
  })),
}));

vi.mock('./editPages.js', () => ({
  editPages: vi.fn(() => Promise.resolve(new Blob(['out'], { type: 'application/pdf' }))),
}));

// The grid draws a page only once its cell is near the viewport; tests say which.
let observers = [];
class FakeIntersectionObserver {
  constructor(callback) {
    this.callback = callback;
    this.targets = new Set();
    observers.push(this);
  }
  observe(target) { this.targets.add(target); }
  unobserve(target) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); }
  intersectAll() {
    this.callback(Array.from(this.targets).map((target) => ({ target, isIntersecting: true })));
  }
}

async function textOf(file) {
  return new TextDecoder().decode(await file.arrayBuffer());
}

describe('PdfEditPagesTool working file after a repair', () => {
  let container;
  let originalIO;
  const original = new File(['%PDF-original'], 'document.pdf', { type: 'application/pdf', lastModified: 1234 });

  beforeEach(() => {
    observers = [];
    originalIO = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = FakeIntersectionObserver;
    window.URL.createObjectURL = vi.fn(() => 'blob:testurl');
    window.URL.revokeObjectURL = vi.fn();
    vi.mocked(openThumbnailSource).mockClear();
    vi.mocked(editPages).mockClear();
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    globalThis.IntersectionObserver = originalIO;
  });

  async function open() {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { render(<PdfEditPagesTool />, container); });
    await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), [original]); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    // The grid's own observer is the last one made.
    await act(async () => { observers.at(-1)?.intersectAll(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  }

  async function build() {
    await act(async () => {
      container.querySelector('a[data-state]').dispatchEvent(new Event('pointerdown', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  }

  it('hands the repaired bytes, under the original name, to the grid and the export', async () => {
    const fixed = new TextEncoder().encode('%PDF-repaired');
    vi.mocked(loadPdfWithPages).mockResolvedValue({ doc: {}, pageCount: 2, bytes: fixed, repaired: true });
    await open();

    const gridFile = vi.mocked(openThumbnailSource).mock.calls[0][0];
    expect(gridFile).not.toBe(original);
    expect(gridFile.name).toBe('document.pdf');
    expect(gridFile.type).toBe('application/pdf');
    expect(gridFile.lastModified).toBe(1234);
    expect(await textOf(gridFile)).toBe('%PDF-repaired');
    expect(container.querySelectorAll('ul[data-page-grid] > li[data-key]').length).toBe(2);
    expect(container.textContent).toContain('document_modified.pdf');

    await build();
    const exportFile = vi.mocked(editPages).mock.calls[0][0];
    expect(await textOf(exportFile)).toBe('%PDF-repaired');
    expect(exportFile.name).toBe('document.pdf');
  });

  it('hands the original File to the grid and the export when nothing was repaired', async () => {
    vi.mocked(loadPdfWithPages).mockResolvedValue({
      doc: {}, pageCount: 2, bytes: new Uint8Array(), repaired: false,
    });
    await open();
    expect(vi.mocked(openThumbnailSource).mock.calls[0][0]).toBe(original);

    await build();
    expect(vi.mocked(editPages).mock.calls[0][0]).toBe(original);
  });

  it('exports the file picked last when an earlier, slower load finishes after it', async () => {
    let finishFirst;
    const second = new File(['%PDF-second'], 'second.pdf', { type: 'application/pdf' });
    vi.mocked(loadPdfWithPages)
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
      .mockResolvedValueOnce({ doc: {}, pageCount: 2, bytes: new Uint8Array(), repaired: false });
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { render(<PdfEditPagesTool />, container); });
    await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), [original]); });
    await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), [second]); });
    // A second pick asks first; the person confirms it.
    const dialog = container.querySelector('dialog[aria-labelledby="confirm-replace-title"]');
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Replace file');
    await act(async () => confirm.click());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    await act(async () => {
      finishFirst({ doc: {}, pageCount: 2, bytes: new TextEncoder().encode('%PDF-first-repaired'), repaired: true });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    await act(async () => { observers.at(-1)?.intersectAll(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });

    expect(container.querySelector('#page-grid-heading').textContent).toContain('second_modified.pdf');
    await build();
    expect(vi.mocked(editPages).mock.calls[0][0]).toBe(second);
    expect(vi.mocked(openThumbnailSource).mock.calls.every(([f]) => f === second)).toBe(true);
  });

  it('shows the load error and opens no grid when the loader rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(loadPdfWithPages).mockRejectedValue(new Error('Failed to parse PDF'));
    await open();
    expect(openThumbnailSource).not.toHaveBeenCalled();
    expect(container.querySelector('ul[data-page-grid]')).toBeNull();
    expect(container.textContent).toContain('the file may be damaged');
  });

  it('a load failure still offers Replace file, which asks first', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(loadPdfWithPages).mockRejectedValue(new Error('Failed to parse PDF'));
    await open();
    const replace = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Replace file');
    expect(replace).toBeDefined();
    await act(async () => { replace.click(); });
    expect(container.querySelector('dialog[aria-labelledby="confirm-replace-title"]').open).toBe(true);
  });
});
