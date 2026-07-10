import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import PdfSplitTool from './PdfSplitTool.jsx';
import { parsePageSelector, pageNumbersToRangeString } from '../lib/split.js';
import dropzoneStyles from './Dropzone.module.css';
import pageGridStyles from './PageGrid.module.css';
import styles from './PdfSplitTool.module.css';
import pdfToolStyles from './PdfTool.module.css';
import { mockNativeFileShare } from '../test/mockFileShare.js';

// Test split.js library
describe('split.js library helpers', () => {
  it('parses page ranges correctly', () => {
    expect(parsePageSelector('', 5)).toEqual([1, 2, 3, 4, 5]);
    expect(parsePageSelector('1-3', 5)).toEqual([1, 2, 3]);
    expect(parsePageSelector('1-3, 5', 5)).toEqual([1, 2, 3, 5]);
    expect(parsePageSelector(' 3-1,  4 ', 5)).toEqual([1, 2, 3, 4]);
    expect(parsePageSelector('8-', 10)).toEqual([8, 9, 10]);
    expect(parsePageSelector('-3', 5)).toEqual([1, 2, 3]);
  });

  it('throws errors on invalid ranges', () => {
    expect(() => parsePageSelector('6', 5)).toThrow();
    expect(() => parsePageSelector('1-6', 5)).toThrow();
    expect(() => parsePageSelector('abc', 5)).toThrow();
    expect(() => parsePageSelector('1-2-3', 5)).toThrow();
  });

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
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Wait for the async loader to finish
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const workspace = container.querySelector('.tool-workspace');
    expect(workspace).not.toBeNull();
    expect(workspace.textContent).toContain('File: test.pdf (4 pages)');

    // Textbox range should default to "1-4"
    const selectorInput = container.querySelector('#page-selector-input');
    expect(selectorInput.value).toBe('1-4');

    // Should render 4 page cards
    const cards = container.querySelectorAll(`.${pageGridStyles['page-card']}`);
    expect(cards.length).toBe(4);
  });

  it('shares separately split PDFs as multiple native files', async () => {
    const nativeShare = mockNativeFileShare();
    URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    URL.revokeObjectURL = vi.fn();
    mockState.numPages = 5;

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<PdfSplitTool />, container));

    const fixturePath = path.resolve(__dirname, '../lib/__fixtures__/num-5.pdf');
    const file = new File([fs.readFileSync(fixturePath)], 'num-5.pdf', { type: 'application/pdf' });
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const separateButton = Array.from(container.querySelectorAll(`.${styles['split-card']}`))
      .find((button) => button.textContent.includes('Individual Pages'));
    await act(async () => separateButton.click());

    const splitButton = container.querySelector(`.${pdfToolStyles['merge-button']}`);
    await act(async () => {
      splitButton.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const shareButton = container.querySelector(`.${pdfToolStyles['pdf-share-button']}`);
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
});

import fs from 'fs';
import path from 'path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

describe('splitPdf library integration with real fixtures', () => {
  function getFixtureFile(name) {
    const filePath = path.resolve(__dirname, '../lib/__fixtures__', name);
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
    const { splitPdf } = await vi.importActual('../lib/split.js');
    const file = getFixtureFile('num-5.pdf');
    const results = await splitPdf(file, { pageNumbers: [2, 3, 4], mode: 'combined' });

    expect(results.length).toBe(1);
    expect(results[0].filename).toBe('num-5-extracted.pdf');
    
    const texts = await extractTextFromPdfBlob(results[0].blob);
    expect(texts).toEqual(['12', '13', '14']);
  });

  it('extracts single page 1 from num-5.pdf to yield page "11"', async () => {
    const { splitPdf } = await vi.importActual('../lib/split.js');
    const file = getFixtureFile('num-5.pdf');
    const results = await splitPdf(file, { pageNumbers: [1], mode: 'combined' });

    expect(results.length).toBe(1);
    expect(results[0].filename).toBe('num-5-extracted.pdf');

    const texts = await extractTextFromPdfBlob(results[0].blob);
    expect(texts).toEqual(['11']);
  });

  it('extracts pages separately', async () => {
    const { splitPdf } = await vi.importActual('../lib/split.js');
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
});
