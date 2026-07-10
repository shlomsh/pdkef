import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import PdfToImageTool from './PdfToImageTool.jsx';
import styles from './FileList.module.css';
import dropzoneStyles from './Dropzone.module.css';
import pdfToolStyles from './PdfTool.module.css';
import toolStyles from './PdfToImageTool.module.css';
import { mockNativeFileShare } from '../test/mockFileShare.js';

function makePdfFile(name) {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

const { mockState } = vi.hoisted(() => ({ mockState: { numPages: 1 } }));

// Mock pdfjs-dist so we never spin up a real worker or canvas renderer in jsdom.
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
            getViewport: () => ({ width: 612, height: 792 }),
            render: () => ({ promise: Promise.resolve() }),
          }),
        ),
      }),
      destroy: vi.fn(() => Promise.resolve()),
    })),
  };
});

describe('PdfToImageTool UI flow', () => {
  let container;

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    mockState.numPages = 1;
    vi.restoreAllMocks();
  });

  it('renders the initial file dropper zone', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfToImageTool />, container);
    });

    const dropzone = container.querySelector(`.${dropzoneStyles.dropzone}`);
    expect(dropzone).not.toBeNull();
    expect(dropzone.textContent).toContain('Drop PDF here');
  });

  it('renders the quality-preset info tooltip with scoped module classes', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfToImageTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makePdfFile('report.pdf');

    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const infoIcon = container.querySelector(`.${toolStyles['info-icon']}`);
    expect(infoIcon).not.toBeNull();

    const tooltipBubble = infoIcon.querySelector(`.${toolStyles['tooltip-bubble']}`);
    expect(tooltipBubble).not.toBeNull();

    const tooltipRows = tooltipBubble.querySelectorAll(`.${toolStyles['tooltip-row']}`);
    expect(tooltipRows.length).toBe(3);
    expect(tooltipRows[0].textContent).toContain('Standard');
  });

  it('converts a single-page PDF and produces a downloadable image', async () => {
    const nativeShare = mockNativeFileShare();
    // jsdom has no canvas backend - stub toBlob so convertPdfToImages resolves.
    HTMLCanvasElement.prototype.toBlob = function toBlob(callback, type) {
      callback(new Blob(['fake-image-bytes'], { type: type || 'image/png' }));
    };
    URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    URL.revokeObjectURL = vi.fn();

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfToImageTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makePdfFile('report.pdf');

    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const convertButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Convert to'),
    );
    expect(convertButton).not.toBeUndefined();

    await act(async () => {
      convertButton.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const downloadLink = container.querySelector(`a.${pdfToolStyles['download-button']}`);
    expect(downloadLink).not.toBeNull();
    expect(downloadLink.getAttribute('download')).toBe('report.png');
    expect(downloadLink.getAttribute('href')).toBe('blob:fake-url');

    const shareButton = container.querySelector(`.${pdfToolStyles['pdf-share-button']}`);
    expect(shareButton).not.toBeNull();
    await act(async () => shareButton.click());
    expect(nativeShare.share.mock.calls[0][0].files[0].name).toBe('report.png');
    nativeShare.restore();
  });

  it('combines a multi-page PDF into a single image when that layout is chosen', async () => {
    HTMLCanvasElement.prototype.toBlob = function toBlob(callback, type) {
      callback(new Blob(['fake-image-bytes'], { type: type || 'image/png' }));
    };
    // jsdom has no real canvas 2D context - stub just enough for stackCanvases'
    // drawImage/fillRect calls to run without throwing.
    HTMLCanvasElement.prototype.getContext = function getContext() {
      return { drawImage: vi.fn(), fillRect: vi.fn(), fillStyle: '' };
    };
    URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    URL.revokeObjectURL = vi.fn();
    mockState.numPages = 3;

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfToImageTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makePdfFile('report.pdf');

    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const layoutButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Single combined image'),
    );
    expect(layoutButton).not.toBeUndefined();
    act(() => {
      layoutButton.click();
    });
    expect(layoutButton.getAttribute('aria-pressed')).toBe('true');

    const convertButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Convert to'),
    );

    await act(async () => {
      convertButton.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Three pages combined into one image: a single download link, no per-page list.
    const downloadLink = container.querySelector(`a.${pdfToolStyles['download-button']}`);
    expect(downloadLink).not.toBeNull();
    expect(downloadLink.getAttribute('download')).toBe('report.png');
    expect(container.querySelector(`.${styles['file-list']}`)).toBeNull();
  });

  it('converts only the selected pages from a custom page range', async () => {
    HTMLCanvasElement.prototype.toBlob = function toBlob(callback, type) {
      callback(new Blob(['fake-image-bytes'], { type: type || 'image/png' }));
    };
    URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    URL.revokeObjectURL = vi.fn();
    mockState.numPages = 5;

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfToImageTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makePdfFile('report.pdf');

    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const pageInput = container.querySelector('#page-selector-input');
    expect(pageInput).not.toBeNull();
    act(() => {
      pageInput.value = '2,4';
      pageInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const convertButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Convert to'),
    );

    await act(async () => {
      convertButton.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const fileNames = Array.from(container.querySelectorAll(`.${styles['file-name']}`)).map((el) => el.textContent);
    expect(fileNames).toEqual(['Page 2', 'Page 4']);
  });

  it('shows a validation error for an out-of-range page selector', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfToImageTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makePdfFile('report.pdf');

    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const pageInput = container.querySelector('#page-selector-input');
    act(() => {
      pageInput.value = '99';
      pageInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const convertButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Convert to'),
    );

    await act(async () => {
      convertButton.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(container.querySelector(`.${pdfToolStyles['page-selector-error']}`)).not.toBeNull();
  });
});
