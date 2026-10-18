// @ts-nocheck - test-only, mirrors PdfEditPagesTool.test.tsx's untyped style
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import PdfEditPagesTool from './PdfEditPagesTool.tsx';
import { editPages } from './editPages.js';
import { renderPdfThumbnails } from '../../lib/thumbnails.js';
import { loadPdfWithPages } from './loadPdfPages.ts';
import pageGridStyles from '../../shell/PageGrid.module.css';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import { setInputFiles } from '../../test/setInputFiles.js';

// DEBT-54: a file whose page list was lost is repaired once on open; the
// thumbnails (pdf.js) and the export must both read the repaired bytes while
// the person's file keeps its identity.

vi.mock('./loadPdfPages.ts', () => ({ loadPdfWithPages: vi.fn() }));

vi.mock('../../lib/thumbnails.js', () => ({
  renderPdfThumbnails: vi.fn((file, onPageRender) => {
    onPageRender(1, 'data:image/png;base64,t1');
    onPageRender(2, 'data:image/png;base64,t2');
    return Promise.resolve(2);
  }),
}));

vi.mock('./editPages.js', () => ({
  editPages: vi.fn(() => Promise.resolve(new Blob(['out'], { type: 'application/pdf' }))),
}));

async function textOf(file) {
  return new TextDecoder().decode(await file.arrayBuffer());
}

describe('PdfEditPagesTool working file after a repair', () => {
  let container;
  const original = new File(['%PDF-original'], 'document.pdf', { type: 'application/pdf', lastModified: 1234 });

  beforeEach(() => {
    vi.mocked(renderPdfThumbnails).mockClear();
    vi.mocked(editPages).mockClear();
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
  });

  async function open() {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfEditPagesTool />, container);
    });
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      setInputFiles(input, [original]);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  }

  async function apply() {
    const cards = container.querySelectorAll(`.${pageGridStyles['page-card']}`);
    await act(async () => {
      cards[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const button = container.querySelector(`.${pdfToolStyles['tool-primary-action']}`);
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  }

  it('hands the repaired bytes, under the original name, to thumbnails and export', async () => {
    const fixed = new TextEncoder().encode('%PDF-repaired');
    vi.mocked(loadPdfWithPages).mockResolvedValue({ doc: {}, pageCount: 2, bytes: fixed, repaired: true });
    await open();

    const thumbFile = vi.mocked(renderPdfThumbnails).mock.calls[0][0];
    expect(thumbFile).not.toBe(original);
    expect(thumbFile.name).toBe('document.pdf');
    expect(thumbFile.type).toBe('application/pdf');
    expect(thumbFile.lastModified).toBe(1234);
    expect(await textOf(thumbFile)).toBe('%PDF-repaired');
    expect(container.textContent).toContain('document.pdf');

    await apply();
    const exportFile = vi.mocked(editPages).mock.calls[0][0];
    expect(await textOf(exportFile)).toBe('%PDF-repaired');
    expect(exportFile.name).toBe('document.pdf');
    expect(container.textContent).toContain('document.pdf');
  });

  it('hands the original File to thumbnails and export when nothing was repaired', async () => {
    vi.mocked(loadPdfWithPages).mockResolvedValue({
      doc: {}, pageCount: 2, bytes: new Uint8Array(), repaired: false,
    });
    await open();
    expect(vi.mocked(renderPdfThumbnails).mock.calls[0][0]).toBe(original);

    await apply();
    expect(vi.mocked(editPages).mock.calls[0][0]).toBe(original);
  });

  it('exports the file picked last when an earlier, slower load finishes after it', async () => {
    let finishFirst;
    const second = new File(['%PDF-second'], 'second.pdf', { type: 'application/pdf' });
    vi.mocked(loadPdfWithPages)
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
      .mockResolvedValueOnce({ doc: {}, pageCount: 2, bytes: new Uint8Array(), repaired: false });
    await open();
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      setInputFiles(input, [second]);
    });
    // A second pick asks first; the person confirms it.
    const dialog = container.querySelector('dialog[aria-labelledby="confirm-replace-title"]');
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Replace file');
    await act(async () => confirm.click());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    await act(async () => {
      finishFirst({ doc: {}, pageCount: 2, bytes: new TextEncoder().encode('%PDF-first-repaired'), repaired: true });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await apply();
    expect(vi.mocked(editPages).mock.calls[0][0]).toBe(second);
    expect(vi.mocked(renderPdfThumbnails).mock.calls.every(([f]) => f === second)).toBe(true);
  });

  it('shows the load error and renders no thumbnails when the loader rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(loadPdfWithPages).mockRejectedValue(new Error('Failed to parse PDF'));
    await open();
    expect(renderPdfThumbnails).not.toHaveBeenCalled();
    expect(container.textContent).toContain('the file may be damaged');
  });
});
