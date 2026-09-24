// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import PdfSplitTool from './PdfSplitTool.tsx';
import { pageNumbersToRangeString } from './split.js';
import dropzoneStyles from '../../shell/Dropzone.module.css';
import toolShellStyles from '../../shell/ToolShell.module.css';
import styles from './PdfSplitTool.module.css';
import { mockNativeFileShare } from '../../test/mockFileShare.js';
import { setInputFiles } from '../../test/setInputFiles.js';
import * as pdfjsDist from 'pdfjs-dist';

// Test split.js library. parsePageSelector's own cases moved to
// src/lib/pageSelector.test.js (DEBT-23: it's shared with PDF to Image now).
describe('split.js library helpers', () => {
  it('converts page numbers back to range strings', () => {
    expect(pageNumbersToRangeString([])).toBe('');
    expect(pageNumbersToRangeString([1, 2, 3])).toBe('1-3');
    expect(pageNumbersToRangeString([1, 2, 3, 5])).toBe('1-3, 5');
    expect(pageNumbersToRangeString([1, 3, 4, 5, 7, 8])).toBe('1, 3-5, 7-8');
  });
});

function makePdfFile(name) {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

const { mockState } = vi.hoisted(() => ({ mockState: { numPages: 4 } }));

// Mock pdfjs-dist
vi.mock('pdfjs-dist', () => {
  return {
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: vi.fn(() => ({
      promise: Promise.resolve({
        get numPages() {
          return mockState.numPages;
        },
        getPage: vi.fn(() =>
          Promise.resolve({
            getViewport: () => ({ width: 600, height: 800 }),
            render: () => ({ promise: Promise.resolve() }),
          }),
        ),
      }),
      destroy: vi.fn(() => Promise.resolve()),
    })),
  };
});

describe('PdfSplitTool UI flow', () => {
  let container;

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    mockState.numPages = 4;
    vi.restoreAllMocks();
  });

  it('renders initial dropzone', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSplitTool />, container);
    });

    const dropzone = container.querySelector(`.${dropzoneStyles.dropzone}`);
    expect(dropzone).not.toBeNull();
    expect(dropzone.textContent).toContain('Drop PDF here');
  });

  it('loads file and populates page grid', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    URL.revokeObjectURL = vi.fn();

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSplitTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makePdfFile('test.pdf');

    await act(async () => {
      setInputFiles(input, [file]);
    });

    // Wait for the async loader to finish
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const workspace = container.querySelector('.tool-workspace');
    expect(workspace).not.toBeNull();

    const fileBar = container.querySelector(`.${toolShellStyles.identity}`);
    expect(fileBar).not.toBeNull();
    expect(fileBar.textContent).toContain('test.pdf');
    expect(fileBar.textContent).toContain('4 pages');

    // Textbox range should default to "1-4"
    const selectorInput = container.querySelector('#page-selector-input');
    expect(selectorInput.value).toBe('1-4');

    // Should render 4 page cells, all included, inside the one-document frame
    const cards = container.querySelectorAll(`.${styles.cell}`);
    expect(cards.length).toBe(4);
    expect(container.querySelectorAll(`.${styles['is-out']}`).length).toBe(0);
    expect(container.querySelector(`.${styles['doc-frame']}`)).not.toBeNull();
    expect(container.querySelector(`.${styles['canvas-title']}`).textContent).toBe('extracted_test.pdf');

    // The default mode is shown as a choice, with the alternative beside it
    const radios = container.querySelectorAll('[role="radio"]');
    expect(Array.from(radios).map((r) => r.textContent)).toEqual(['One PDF', 'One PDF per page']);
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
    expect(radios[1].getAttribute('aria-checked')).toBe('false');
  });

  it('a toggled cell stays in place and the primary element reflects the count', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    URL.revokeObjectURL = vi.fn();

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<PdfSplitTool />, container));
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      setInputFiles(input, [makePdfFile('test.pdf')]);
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const cells = () => Array.from(container.querySelectorAll(`.${styles.cell}`));
    await act(async () => cells()[1].click());

    // Same four cells, same order; the second is dimmed, not moved
    expect(cells().map((c) => c.getAttribute('aria-label'))).toEqual(['Page 1', 'Page 2', 'Page 3', 'Page 4']);
    expect(cells()[1].classList.contains(styles['is-out'])).toBe(true);
    expect(container.querySelector('#page-selector-input').value).toBe('1, 3-4');
    expect(container.querySelector(`.${styles['canvas-count']}`).textContent).toBe('3 of 4 pages');

    // Clear: the frame stays, empty, and the primary element says what to do
    const clearButton = Array.from(container.querySelectorAll(`.${styles.command}`))
      .find((b) => b.textContent === 'Clear');
    await act(async () => clearButton.click());
    expect(container.querySelector(`.${styles['doc-frame']}`).getAttribute('data-empty')).toBe('true');
    const primary = container.querySelector(`.${styles.primary}`);
    expect(primary.getAttribute('data-state')).toBe('empty');
    expect(primary.textContent).toContain('Pick at least one page');
  });

  it('switching to one PDF per page regroups the same cells in place', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    URL.revokeObjectURL = vi.fn();

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<PdfSplitTool />, container));
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      setInputFiles(input, [makePdfFile('test.pdf')]);
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const perPage = Array.from(container.querySelectorAll('[role="radio"]')).find((r) => r.textContent === 'One PDF per page');
    await act(async () => perPage.click());

    expect(container.querySelector(`.${styles['doc-frame']}`)).toBeNull();
    expect(container.querySelector(`.${styles['canvas-title']}`).textContent).toBe('4 PDFs, one page each');
    const cells = Array.from(container.querySelectorAll(`.${styles.cell}`));
    expect(cells.length).toBe(4);
    expect(cells.every((c) => c.classList.contains(styles['is-own-file']))).toBe(true);
    expect(cells[2].querySelector(`.${styles['cell-caption']}`).textContent).toBe('…-page-3.pdf');
    expect(cells[2].querySelector(`.${styles['cell-caption']}`).getAttribute('title')).toBe('test-page-3.pdf');

    // The segmented control (directly above Download) flips it back - no
    // separate "or switch mode" link duplicating it (Shlomi, 2026-09-14).
    const onePdf = Array.from(container.querySelectorAll('[role="radio"]')).find((r) => r.textContent === 'One PDF');
    await act(async () => onePdf.click());
    expect(container.querySelector(`.${styles['doc-frame']}`)).not.toBeNull();
  });

  it('Share appears next to Download as soon as output is ready, not only after a first save', async () => {
    const nativeShare = mockNativeFileShare();
    URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    URL.revokeObjectURL = vi.fn();

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<PdfSplitTool />, container));

    // A real fixture, not the fake makePdfFile(): this test waits for the
    // actual splitPdf() prepare to resolve, which a synthetic "%PDF-1.4"
    // body cannot parse.
    const fixturePath = path.resolve(__dirname, '../../lib/__fixtures__/num-5.pdf');
    const file = new File([fs.readFileSync(fixturePath)], 'num-5.pdf', { type: 'application/pdf' });
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      setInputFiles(input, [file]);
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const findShareButton = () =>
      Array.from(container.querySelectorAll(`.${styles['next-step']}`)).find((b) => b.textContent.includes('Share'));

    // Nothing to share yet: usePdfShare's shareReady is preparedFiles.length
    // > 0, which only becomes true once the debounced prepare finishes.
    expect(findShareButton()).toBeUndefined();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    const primary = container.querySelector(`.${styles.primary}`);
    expect(primary.getAttribute('data-state')).toBe('ready');
    // Share is visible now, before the primary control has ever been tapped.
    expect(findShareButton()).not.toBeUndefined();
    nativeShare.restore();
  });

  it('rotating a cell never toggles it, and Undo reverts the rotation', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    URL.revokeObjectURL = vi.fn();

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<PdfSplitTool />, container));
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      setInputFiles(input, [makePdfFile('test.pdf')]);
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const cell = container.querySelectorAll(`.${styles.cell}`)[1];
    const rotateBtn = cell.querySelector(`.${styles['rotate-btn']}`);

    await act(async () => rotateBtn.click());
    expect(cell.getAttribute('aria-checked')).toBe('true'); // rotating never toggles inclusion
    expect(cell.querySelector(`.${styles['cell-thumb']}`).getAttribute('data-rotation')).toBe('90');

    const undoChip = container.querySelector(`.${styles['undo-chip']}`);
    expect(undoChip.textContent).toContain('Rotated page 2');
    await act(async () => undoChip.querySelector('button').click());
    expect(cell.querySelector(`.${styles['cell-thumb']}`).getAttribute('data-rotation')).toBeNull();
    expect(container.querySelector(`.${styles['undo-chip']}`)).toBeNull();
  });

  it('shares separately split PDFs as multiple native files', async () => {
    const nativeShare = mockNativeFileShare();
    URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    URL.revokeObjectURL = vi.fn();
    mockState.numPages = 5;

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<PdfSplitTool />, container));

    const fixturePath = path.resolve(__dirname, '../../lib/__fixtures__/num-5.pdf');
    const file = new File([fs.readFileSync(fixturePath)], 'num-5.pdf', { type: 'application/pdf' });
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      setInputFiles(input, [file]);
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const separateButton = Array.from(container.querySelectorAll('[role="radio"]'))
      .find((button) => button.textContent === 'One PDF per page');
    await act(async () => separateButton.click());

    // The output is prepared on idle; wait past the debounce and the split.
    const primary = container.querySelector(`.${styles.primary}`);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    expect(primary.getAttribute('data-state')).toBe('ready');
    expect(primary.textContent).toContain('Download 5 PDFs');

    // Tapping the primary saves all five and reveals the next steps.
    await act(async () => {
      primary.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(primary.getAttribute('data-state')).toBe('saved');

    const shareButton = Array.from(container.querySelectorAll(`.${styles['next-step']}`))
      .find((b) => b.textContent.includes('Share'));
    expect(shareButton).not.toBeNull();
    await act(async () => shareButton.click());
    const files = nativeShare.share.mock.calls[0][0].files;
    expect(files).toHaveLength(5);
    expect(files.map((sharedFile) => sharedFile.name)).toEqual([
      'num-5-page-1.pdf',
      'num-5-page-2.pdf',
      'num-5-page-3.pdf',
      'num-5-page-4.pdf',
      'num-5-page-5.pdf',
    ]);
    nativeShare.restore();
  });

  // DEBT-18: the load path had no cancellation at all, so the first file's
  // continuation kept writing numPages/pages/status after a second pick, and
  // its thumbnail loop stamped the first file's rendered pages into the
  // second file's cells one at a time - `p.pageNumber === i` matches whatever
  // grid is mounted. loadingTask.destroy() was only reached after all N pages.
  it('drops a load whose file was replaced before the document resolved', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    URL.revokeObjectURL = vi.fn();

    let resolveFirstDocument;
    const firstDestroy = vi.fn(() => Promise.resolve());
    const firstGetPage = vi.fn(() =>
      Promise.resolve({
        getViewport: () => ({ width: 600, height: 800 }),
        render: () => ({ promise: Promise.resolve() }),
      }),
    );
    vi.mocked(pdfjsDist.getDocument).mockImplementationOnce(() => ({
      promise: new Promise((resolve) => {
        resolveFirstDocument = () => resolve({ numPages: 300, getPage: firstGetPage });
      }),
      destroy: firstDestroy,
    }));

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSplitTool />, container);
    });

    const input = container.querySelector('input[type="file"]');

    // The 300-page file, still opening.
    await act(async () => {
      setInputFiles(input, [makePdfFile('three-hundred.pdf')]);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(resolveFirstDocument).toBeDefined();

    // Replaced by a three-page one, which opens immediately.
    mockState.numPages = 3;
    await act(async () => {
      setInputFiles(input, [makePdfFile('three.pdf')]);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Only now does the first file's document arrive.
    await act(async () => {
      resolveFirstDocument();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const fileBar = container.querySelector(`.${toolShellStyles.identity}`);
    expect(fileBar.textContent).toContain('three.pdf');
    expect(fileBar.textContent).toContain('3 pages');
    expect(container.querySelector('#page-selector-input').value).toBe('1-3');
    expect(container.querySelectorAll(`.${styles.cell}`).length).toBe(3);
    expect(container.querySelector(`.${styles['canvas-title']}`).textContent).toBe('extracted_three.pdf');

    // The abandoned task is released, and released without walking 300 pages
    // into the three-page grid first.
    expect(firstDestroy).toHaveBeenCalled();
    expect(firstGetPage).not.toHaveBeenCalled();
  });

  // The test above never reaches the thumbnail loop: it resolves the first
  // document only after the replacement has finished loading, so the run is
  // already stale before the loop is entered (firstGetPage is never called).
  // These two do reach it - the document resolves first, the file is replaced
  // mid-loop - because `p.pageNumber === i` matches whatever grid is mounted,
  // so a loop that outlives its file stamps its thumbnails into the next
  // file's cells one cell at a time. DEBT-18's scope calls for bailing
  // *inside* the loop, not only after the document resolves.
  describe('a file replaced while the thumbnail loop is running (DEBT-18)', () => {
    // jsdom cannot rasterise, so toDataURL() would otherwise hand back
    // undefined and a missing guard would look like a passing one: every
    // thumbnail would be falsy and no <img> would render either way.
    function stubCanvasDataUrl() {
      vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,STALE');
    }

    function thumbnails() {
      return container.querySelectorAll(`.${styles['cell-thumb-img']}`);
    }

    /** A 3-page replacement whose own pages never finish rendering, so every
     *  thumbnail visible in its grid can only have come from the abandoned load. */
    function mockReplacementDocument() {
      vi.mocked(pdfjsDist.getDocument).mockImplementationOnce(() => ({
        promise: Promise.resolve({
          numPages: 3,
          getPage: vi.fn(() => Promise.resolve({
            getViewport: () => ({ width: 600, height: 800 }),
            render: () => ({ promise: new Promise(() => {}) }),
          })),
        }),
        destroy: vi.fn(() => Promise.resolve()),
      }));
    }

    async function pickFile(name) {
      const input = container.querySelector('input[type="file"]');
      await act(async () => {
        setInputFiles(input, [makePdfFile(name)]);
      });
      // Replacing a file that is already loaded is confirmed first (MEM-03,
      // BasePdfTool). Take the same step the person does.
      const confirmReplace = Array.from(container.querySelectorAll('dialog button'))
        .find((button) => button.textContent.trim() === 'Replace file');
      if (confirmReplace) {
        await act(async () => {
          confirmReplace.click();
        });
      }
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    }

    function mountTool() {
      URL.createObjectURL = vi.fn(() => 'blob:fake-url');
      URL.revokeObjectURL = vi.fn();
      container = document.createElement('div');
      document.body.appendChild(container);
      act(() => {
        render(<PdfSplitTool />, container);
      });
    }

    it('does not stamp the replacement grid with a thumbnail the abandoned loop was still rendering', async () => {
      stubCanvasDataUrl();

      let finishSecondPage;
      const firstGetPage = vi.fn((pageNumber) => Promise.resolve({
        getViewport: () => ({ width: 600, height: 800 }),
        render: () => ({
          promise: pageNumber === 2
            ? new Promise((resolve) => { finishSecondPage = resolve; })
            : Promise.resolve(),
        }),
      }));
      vi.mocked(pdfjsDist.getDocument).mockImplementationOnce(() => ({
        promise: Promise.resolve({ numPages: 5, getPage: firstGetPage }),
        destroy: vi.fn(() => Promise.resolve()),
      }));
      mockReplacementDocument();

      mountTool();

      // The five-page file opens immediately, so the loop really runs: page 1
      // lands in its own grid, page 2 is mid-render.
      await pickFile('five.pdf');
      expect(container.querySelectorAll(`.${styles.cell}`).length).toBe(5);
      expect(thumbnails().length).toBe(1);
      expect(finishSecondPage).toBeDefined();

      // Replaced mid-loop.
      await pickFile('three.pdf');
      expect(container.querySelectorAll(`.${styles.cell}`).length).toBe(3);
      expect(thumbnails().length).toBe(0);

      // Page 2 of the *previous* file finishes rendering into a canvas nobody
      // is waiting for any more.
      await act(async () => {
        finishSecondPage();
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      expect(thumbnails().length).toBe(0);
      // And the loop stopped rather than walking the remaining three pages.
      expect(firstGetPage.mock.calls.map(([pageNumber]) => pageNumber)).toEqual([1, 2]);
    });

    it('stops the abandoned loop at the next page even when the page it was on failed to render', async () => {
      stubCanvasDataUrl();
      vi.spyOn(console, 'error').mockImplementation(() => {});

      let failSecondPage;
      const firstGetPage = vi.fn((pageNumber) => Promise.resolve({
        getViewport: () => ({ width: 600, height: 800 }),
        render: () => ({
          promise: pageNumber === 2
            ? new Promise((_resolve, reject) => { failSecondPage = reject; })
            : Promise.resolve(),
        }),
      }));
      vi.mocked(pdfjsDist.getDocument).mockImplementationOnce(() => ({
        promise: Promise.resolve({ numPages: 5, getPage: firstGetPage }),
        destroy: vi.fn(() => Promise.resolve()),
      }));
      mockReplacementDocument();

      mountTool();
      await pickFile('five.pdf');
      expect(failSecondPage).toBeDefined();

      await pickFile('three.pdf');

      // A page that throws is caught per page, so the loop would otherwise
      // carry on to page 3 without ever reaching the post-render check.
      await act(async () => {
        failSecondPage(new Error('page render failed'));
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      expect(firstGetPage.mock.calls.map(([pageNumber]) => pageNumber)).toEqual([1, 2]);
      expect(thumbnails().length).toBe(0);
    });
  });

});

import fs from 'fs';
import path from 'path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

describe('splitPdf library integration with real fixtures', () => {
  function getFixtureFile(name) {
    const filePath = path.resolve(__dirname, '../../lib/__fixtures__', name);
    const buffer = fs.readFileSync(filePath);
    return new File([buffer], name, { type: 'application/pdf' });
  }

  async function extractTextFromPdfBlob(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const loadingTask = pdfjs.getDocument({
      data: bytes,
      useWorkerFetch: false,
      isEvalSupported: false,
    });
    const pdf = await loadingTask.promise;
    const pageTexts = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join('').trim();
      pageTexts.push(pageText);
    }
    await loadingTask.destroy();
    return pageTexts;
  }

  it('splits page range 2-4 from num-5.pdf to yield pages "12", "13", "14"', async () => {
    const { splitPdf } = await vi.importActual('./split.js');
    const file = getFixtureFile('num-5.pdf');
    const results = await splitPdf(file, { pageNumbers: [2, 3, 4], mode: 'combined' });

    expect(results.length).toBe(1);
    expect(results[0].filename).toBe('extracted_num-5.pdf');
    
    const texts = await extractTextFromPdfBlob(results[0].blob);
    expect(texts).toEqual(['12', '13', '14']);
  });

  it('extracts single page 1 from num-5.pdf to yield page "11"', async () => {
    const { splitPdf } = await vi.importActual('./split.js');
    const file = getFixtureFile('num-5.pdf');
    const results = await splitPdf(file, { pageNumbers: [1], mode: 'combined' });

    expect(results.length).toBe(1);
    expect(results[0].filename).toBe('extracted_num-5.pdf');

    const texts = await extractTextFromPdfBlob(results[0].blob);
    expect(texts).toEqual(['11']);
  });

  it('extracts pages separately', async () => {
    const { splitPdf } = await vi.importActual('./split.js');
    const file = getFixtureFile('num-5.pdf');
    const results = await splitPdf(file, { pageNumbers: [2, 4], mode: 'separate' });

    expect(results.length).toBe(2);
    expect(results[0].filename).toBe('num-5-page-2.pdf');
    expect(results[1].filename).toBe('num-5-page-4.pdf');

    const texts1 = await extractTextFromPdfBlob(results[0].blob);
    expect(texts1).toEqual(['12']);

    const texts2 = await extractTextFromPdfBlob(results[1].blob);
    expect(texts2).toEqual(['14']);
  });

  it('applies the per-page rotation map in both modes (pageOps.js, shared with Merge and Edit Pages)', async () => {
    const { splitPdf } = await vi.importActual('./split.js');
    const { PDFDocument } = await import('@cantoo/pdf-lib');
    const file = getFixtureFile('num-5.pdf');

    const combined = await splitPdf(file, {
      pageNumbers: [1, 2, 3],
      mode: 'combined',
      rotations: { 2: 90 },
    });
    const combinedDoc = await PDFDocument.load(new Uint8Array(await combined[0].blob.arrayBuffer()));
    expect(combinedDoc.getPages().map((p) => p.getRotation().angle)).toEqual([0, 90, 0]);

    const separate = await splitPdf(file, {
      pageNumbers: [2],
      mode: 'separate',
      rotations: { 2: 270 },
    });
    const separateDoc = await PDFDocument.load(new Uint8Array(await separate[0].blob.arrayBuffer()));
    expect(separateDoc.getPages()[0].getRotation().angle).toBe(270);
  });
});
