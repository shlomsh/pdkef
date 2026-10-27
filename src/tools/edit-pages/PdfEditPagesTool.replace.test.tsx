// @ts-nocheck - test-only, mirrors PdfEditPagesTool.test.tsx's untyped style
import { render, options } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import Sortable from 'sortablejs';
import PdfEditPagesTool from './PdfEditPagesTool.tsx';
import { setInputFiles } from '../../test/support/setInputFiles.js';

const { mockState } = vi.hoisted(() => ({ mockState: { numPages: 3 } }));

vi.mock('@cantoo/pdf-lib', () => ({
  PDFDocument: {
    load: vi.fn(() => Promise.resolve({ getPageCount: () => mockState.numPages })),
  },
}));

vi.mock('../../lib/thumbnails.js', () => ({
  renderThumbnail: vi.fn(() => Promise.resolve(null)),
  openThumbnailSource: vi.fn(async (file) => ({
    file,
    pageCount: mockState.numPages,
    render: vi.fn(async (pageIndex) => `data:image/png;base64,t${pageIndex}`),
    destroy: vi.fn(async () => {}),
  })),
}));

vi.mock('./lib/editPages.js', () => ({ editPages: vi.fn() }));

const pdf = (name) => new File(['%PDF-1.4'], name, { type: 'application/pdf' });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 50)); });

describe('PdfEditPagesTool replace file', () => {
  let container;

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.restoreAllMocks();
  });

  const cells = () => container.querySelectorAll('ul[data-page-grid] > li[data-key]');

  // Production crash: sortablejs destroy() does `el[expando] = null` and throws
  // once the grid element is gone. Emulate that and replace the file.
  it('replacing the loaded file does not throw from Sortable.destroy on a detached grid', async () => {
    // Preact routes an error thrown in an effect cleanup to options.__e.
    const errors = [];
    const prevCatch = options.__e;
    options.__e = (err, ...rest) => {
      errors.push(err);
      return prevCatch(err, ...rest);
    };
    const realDestroy = Sortable.prototype.destroy;
    vi.spyOn(Sortable.prototype, 'destroy').mockImplementation(function () {
      if (!this.el.isConnected) {
        const err = new TypeError("Cannot set properties of null (setting 'sortable')");
        throw err;
      }
      return realDestroy.call(this);
    });
    const onError = (e) => errors.push(e.error ?? e.message);
    window.addEventListener('error', onError);

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<PdfEditPagesTool />, container));
    await act(async () => setInputFiles(container.querySelector('input[type="file"]'), [pdf('a.pdf')]));
    await settle();
    expect(cells().length).toBe(3);

    await act(async () => setInputFiles(container.querySelector('input[type="file"]'), [pdf('b.pdf')]));
    const dialog = container.querySelector('dialog[aria-labelledby="confirm-replace-title"]');
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Replace file');
    await act(async () => confirm.click());
    await settle();

    window.removeEventListener('error', onError);
    options.__e = prevCatch;
    expect(errors).toEqual([]);
    expect(cells().length).toBe(3);
    expect(container.querySelector('#page-grid-heading').textContent).toContain('b_modified.pdf');
  });

  it('a new file starts fresh: its own name, its own pages, and nothing to undo', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<PdfEditPagesTool />, container));
    await act(async () => setInputFiles(container.querySelector('input[type="file"]'), [pdf('a.pdf')]));
    await settle();
    await act(async () => container.querySelector('[aria-label="Skip page 1"]').click());
    expect(container.querySelector('[aria-label="Undo last change"]').disabled).toBe(false);

    mockState.numPages = 2;
    await act(async () => setInputFiles(container.querySelector('input[type="file"]'), [pdf('b.pdf')]));
    const dialog = container.querySelector('dialog[aria-labelledby="confirm-replace-title"]');
    await act(async () => Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Replace file').click());
    await settle();
    await settle();

    expect(cells().length).toBe(2);
    expect(Array.from(cells()).some((c) => c.hasAttribute('data-skipped'))).toBe(false);
    expect(container.querySelector('[aria-label="Undo last change"]').disabled).toBe(true);
    mockState.numPages = 3;
  });
});
