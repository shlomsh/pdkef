// @ts-nocheck - test-only, mirrors PdfEditPagesTool.test.tsx's untyped style
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import PdfEditPagesTool from './PdfEditPagesTool.tsx';
import * as editPagesLib from './lib/editPages.js';
import { getPdfLib } from '../../lib/pdf/pdfLib.js';
import { buildPdf, healthy, noPagesKey, ORIGINAL_WIDTHS } from '../../test/support/pdfPageTreeFixtures.ts';
import { installToolHarness } from '../../test/harness/toolHarness.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { until } from '../../test/support/until.js';
import { waitUntil } from '../../test/harness/waitUntil.ts';

// DEBT-54: a file whose page list was lost is repaired once on open; the
// grid (pdf.js) and the export must both read the repaired bytes while the
// person's file keeps its identity.

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

// The page widths of a PDF's bytes: its pages are told apart by width (200, 300, 400).
async function widthsOf(blob) {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.load(await blob.arrayBuffer());
  return doc.getPages().map((p) => p.getWidth());
}

describe('PdfEditPagesTool working file after a repair', () => {
  let container;
  let originalIO;
  let harness;
  // The file whose page list was lost, so opening it repairs it.
  let original;

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
    original = new File([noPagesKey()], 'document.pdf', { type: 'application/pdf', lastModified: 1234 });
    observers = [];
    originalIO = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = FakeIntersectionObserver;
    harness.pdfjs.thumbnails.openThumbnailSource.mockClear();
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    globalThis.IntersectionObserver = originalIO;
    vi.restoreAllMocks();
    harness.restore();
  });

  async function open() {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { render(<PdfEditPagesTool />, container); });
    await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), [original]); });
    await until(() => container.querySelector('ul[data-page-grid]') || container.querySelector('[role="alert"]'));
    // The grid's own observer is the last one made.
    await act(async () => { observers.at(-1)?.intersectAll(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  }

  async function build() {
    await act(async () => {
      container.querySelector('a[data-state]').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    await waitUntil(() => expect(harness.createdBlobs().length).toBeGreaterThan(0));
    // The tests assert exactly one export: a short settle so a second one would show.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  }

  it('hands the repaired bytes, under the original name, to the grid and the export', async () => {
    await open();

    await waitUntil(() => expect(harness.pdfjs.thumbnails.openThumbnailSource).toHaveBeenCalled());
    const gridFile = harness.pdfjs.thumbnails.openThumbnailSource.mock.calls[0][0];
    expect(gridFile).not.toBe(original);
    expect(gridFile.name).toBe('document.pdf');
    expect(gridFile.type).toBe('application/pdf');
    expect(gridFile.lastModified).toBe(1234);
    // The grid reads the repaired copy: all three pages, which the lost page list left unreachable.
    expect(await widthsOf(gridFile)).toEqual(ORIGINAL_WIDTHS);
    expect(container.querySelectorAll('ul[data-page-grid] > li[data-key]').length).toBe(3);
    expect(container.textContent).toContain('document_modified.pdf');

    await build();
    // The export read the repaired copy too: all three pages came out, in order, under the original name.
    expect(harness.createdBlobs()).toHaveLength(1);
    expect(await widthsOf(harness.createdBlobs()[0])).toEqual(ORIGINAL_WIDTHS);
    expect(container.querySelector('a[data-state]').getAttribute('download')).toBe('document_modified.pdf');
  });

  it('hands the original File to the grid and the export when nothing was repaired', async () => {
    original = new File([healthy()], 'document.pdf', { type: 'application/pdf', lastModified: 1234 });
    const editPagesSpy = vi.spyOn(editPagesLib, 'editPages');
    await open();
    await waitUntil(() => expect(harness.pdfjs.thumbnails.openThumbnailSource).toHaveBeenCalled());
    expect(harness.pdfjs.thumbnails.openThumbnailSource.mock.calls[0][0]).toBe(original);

    await build();
    expect(editPagesSpy).toHaveBeenCalledTimes(1);
    expect(editPagesSpy.mock.calls[0][0]).toBe(original);
    expect(harness.createdBlobs()).toHaveLength(1);
    expect(await widthsOf(harness.createdBlobs()[0])).toEqual(ORIGINAL_WIDTHS);
  });

  it('exports the file picked last when an earlier, slower load finishes after it', async () => {
    // Two pages, told apart from the first file's three.
    const second = new File([buildPdf({
      1: '<< /Type /Catalog /Pages 2 0 R >>',
      2: '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
      3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 250 500] >>',
      4: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 350 500] >>',
    })], 'second.pdf', { type: 'application/pdf' });
    // Not a fake: both loads still run for real. The gate holds the first one open (a real pdf-lib parse
    // gives no way to pause it) until the second has been picked and shown.
    const { PDFDocument } = await getPdfLib();
    const realLoad = PDFDocument.load;
    let finishFirst;
    let loads = 0;
    vi.spyOn(PDFDocument, 'load').mockImplementation(async (...args) => {
      loads += 1;
      if (loads === 1) await new Promise((resolve) => { finishFirst = resolve; });
      return realLoad.apply(PDFDocument, args);
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { render(<PdfEditPagesTool />, container); });
    await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), [original]); });
    await until(() => finishFirst);
    await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), [second]); });
    // A second pick asks first; the person confirms it.
    const dialog = container.querySelector('dialog[aria-labelledby="confirm-replace-title"]');
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Replace file');
    await act(async () => confirm.click());
    await until(() => container.querySelectorAll('ul[data-page-grid] > li[data-key]').length === 2);
    await act(async () => {
      finishFirst();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    await act(async () => { observers.at(-1)?.intersectAll(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });

    expect(container.querySelector('#page-grid-heading').textContent).toContain('second_modified.pdf');
    expect(container.querySelectorAll('ul[data-page-grid] > li[data-key]').length).toBe(2);
    await build();
    expect(harness.createdBlobs()).toHaveLength(1);
    expect(await widthsOf(harness.createdBlobs()[0])).toEqual([250, 350]);
    expect(harness.pdfjs.thumbnails.openThumbnailSource.mock.calls.every(([f]) => f === second)).toBe(true);
  });

  it('shows the load error and opens no grid when the loader rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Not a PDF at all: the loader cannot read it.
    original = new File(['this is not a PDF'], 'document.pdf', { type: 'application/pdf', lastModified: 1234 });
    await open();
    expect(harness.pdfjs.thumbnails.openThumbnailSource).not.toHaveBeenCalled();
    expect(container.querySelector('ul[data-page-grid]')).toBeNull();
    expect(container.textContent).toContain('the file may be damaged');
  });

  it('a load failure still offers Replace file, which asks first', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Not a PDF at all: the loader cannot read it.
    original = new File(['this is not a PDF'], 'document.pdf', { type: 'application/pdf', lastModified: 1234 });
    await open();
    const replace = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Replace file');
    expect(replace).toBeDefined();
    await act(async () => { replace.click(); });
    expect(container.querySelector('dialog[aria-labelledby="confirm-replace-title"]').open).toBe(true);
  });
});
