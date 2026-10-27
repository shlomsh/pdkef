// @ts-nocheck - test-only, mirrors PdfEditPagesTool.test.tsx's untyped style
import { render, options } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import Sortable from 'sortablejs';
import PdfEditPagesTool from './PdfEditPagesTool.tsx';
import { buildPdf, healthy } from '../../test/support/pdfPageTreeFixtures.ts';
import { installToolHarness } from '../../test/harness/toolHarness.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { until } from '../../test/support/until.js';

// EDGE: pdf.js cannot run its worker in jsdom, so the encryption probe cannot ask it.
vi.mock('../../lib/pdfEncryption.ts', () => ({ probeEncryption: vi.fn(async () => 'open') }));

// EDGE: pdf.js cannot render in jsdom. The shared grid reads pages through this source; no real rendering here.
vi.mock('../../lib/thumbnails.js', () => ({
  renderThumbnail: vi.fn(() => Promise.resolve(null)),
  renderPdfThumbnails: vi.fn(async () => 0),
  openThumbnailSource: vi.fn(async (file) => {
    const { PDFDocument } = await (await import('../../lib/pdfLib.js')).getPdfLib();
    const pageCount = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true }).then((doc) => doc.getPageCount(), () => 0);
    return {
      file,
      pageCount,
      render: vi.fn(async (pageIndex) => `data:image/png;base64,t${pageIndex}`),
      destroy: vi.fn(async () => {}),
    };
  }),
}));

// A real three-page PDF, or a two-page one.
const pdf = (name, bytes = healthy()) => new File([bytes], name, { type: 'application/pdf' });
const twoPages = () => buildPdf({
  1: '<< /Type /Catalog /Pages 2 0 R >>',
  2: '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
  3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 500] >>',
  4: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 500] >>',
});
let container;
const cells = () => container.querySelectorAll('ul[data-page-grid] > li[data-key]');
// Waits for the grid of the file called `name` to be drawn.
const settle = (name) => until(() => cells().length > 0 && container.querySelector('#page-grid-heading')?.textContent.includes(`${name}_modified.pdf`));

describe('PdfEditPagesTool replace file', () => {
  let harness;

  beforeEach(() => {
    harness = installToolHarness();
    // jsdom's Blob has no arrayBuffer().
    if (!Blob.prototype.arrayBuffer) {
      Blob.prototype.arrayBuffer = function arrayBuffer() {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(this);
        });
      };
    }
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.restoreAllMocks();
    harness.restore();
  });

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
    await settle('a');
    expect(cells().length).toBe(3);

    await act(async () => setInputFiles(container.querySelector('input[type="file"]'), [pdf('b.pdf')]));
    const dialog = container.querySelector('dialog[aria-labelledby="confirm-replace-title"]');
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Replace file');
    await act(async () => confirm.click());
    await settle('b');

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
    await settle('a');
    await act(async () => container.querySelector('[aria-label="Skip page 1"]').click());
    expect(container.querySelector('[aria-label="Undo last change"]').disabled).toBe(false);

    await act(async () => setInputFiles(container.querySelector('input[type="file"]'), [pdf('b.pdf', twoPages())]));
    const dialog = container.querySelector('dialog[aria-labelledby="confirm-replace-title"]');
    await act(async () => Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Replace file').click());
    await settle('b');

    expect(cells().length).toBe(2);
    expect(Array.from(cells()).some((c) => c.hasAttribute('data-skipped'))).toBe(false);
    expect(container.querySelector('[aria-label="Undo last change"]').disabled).toBe(true);
  });
});
