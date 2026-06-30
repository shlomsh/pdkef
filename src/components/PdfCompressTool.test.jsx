import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import PdfCompressTool from './PdfCompressTool.jsx';
import * as compressLib from '../lib/compress.js';

function makePdfFile(name, size = 1000) {
  const file = new File(['%PDF-1.4'], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: size, writable: true });
  return file;
}

vi.mock('pdfjs-dist', () => {
  return {
    GlobalWorkerOptions: {
      workerSrc: ''
    },
    getDocument: vi.fn(() => ({
      promise: Promise.resolve({
        numPages: 2,
        getPage: vi.fn(() => Promise.resolve({
          getViewport: () => ({ width: 612, height: 792 }),
          render: () => ({ promise: Promise.resolve() })
        }))
      })
    }))
  };
});

vi.mock('../lib/compress.js', () => {
  return {
    compressPdf: vi.fn(() => Promise.resolve(new Blob(['%PDF-1.4-compressed'], { type: 'application/pdf' }))),
    compressPdfToTarget: vi.fn(() =>
      Promise.resolve({
        blob: new Blob(['%PDF-1.4-target'], { type: 'application/pdf' }),
        metTarget: true,
      }),
    ),
  };
});

describe('PdfCompressTool UI flow', () => {
  let container;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.restoreAllMocks();
  });

  it('renders the initial file dropper zone', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfCompressTool />, container);
    });

    const dropzone = container.querySelector('.dropzone');
    expect(dropzone).not.toBeNull();
    expect(dropzone.textContent).toContain('Drop PDF here');
  });

  it('transitions to options and handles compression level change', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfCompressTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makePdfFile('test_doc.pdf', 50000);

    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Wait for async file load to resolve
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Check header
    const header = container.querySelector('.list-count');
    expect(header).not.toBeNull();
    expect(header.textContent).toContain('test_doc.pdf');

    // Default level should be 'medium' (Recommended)
    const recommendedCard = container.querySelector('.compress-card.is-selected');
    expect(recommendedCard).not.toBeNull();
    expect(recommendedCard.textContent).toContain('Recommended');

    // Click 'Extreme Compression' card
    const cards = container.querySelectorAll('.compress-card');
    const extremeCard = Array.from(cards).find(c => c.textContent.includes('Extreme Compression'));
    expect(extremeCard).not.toBeNull();

    await act(async () => {
      extremeCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Extreme card should now be selected
    expect(extremeCard.className).toContain('is-selected');
  });

  it('runs compression and displays results', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfCompressTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makePdfFile('test_doc.pdf', 100000); // 100 KB

    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Wait for async file load
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Mock global URL creator
    const originalCreateObjectURL = window.URL.createObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:testurl');

    // Click compression button
    const button = container.querySelector('.merge-button');
    expect(button).not.toBeNull();
    expect(button.textContent).toContain('Compress PDF');

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Wait for mock compressPdf async call to settle
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Verify completion states
    const stats = container.querySelector('.compression-stats');
    expect(stats).not.toBeNull();
    expect(stats.textContent).toContain('PDF Successfully Compressed!');

    const downloadBtn = container.querySelector('.download-button');
    expect(downloadBtn).not.toBeNull();
    expect(downloadBtn.getAttribute('href')).toBe('blob:testurl');

    window.URL.createObjectURL = originalCreateObjectURL;
  });

  it('switches to Target Size mode, edits the KB value, and compresses to target', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfCompressTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makePdfFile('big_scan.pdf', 5_000_000);

    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const cards = container.querySelectorAll('.compress-card');
    const targetCard = Array.from(cards).find((c) => c.textContent.includes('Target Size'));
    expect(targetCard).not.toBeNull();

    await act(async () => {
      targetCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(targetCard.className).toContain('is-selected');

    // Default target is 100 KB; pick the 500 KB preset chip instead.
    const presets = container.querySelectorAll('.target-size-preset');
    const preset500 = Array.from(presets).find((b) => b.textContent.includes('500 KB'));
    expect(preset500).not.toBeNull();
    await act(async () => {
      preset500.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(preset500.className).toContain('is-selected');

    const originalCreateObjectURL = window.URL.createObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:targeturl');

    const button = container.querySelector('.merge-button');
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(compressLib.compressPdfToTarget).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ targetKB: 500 }),
    );
    expect(compressLib.compressPdf).not.toHaveBeenCalled();

    const downloadBtn = container.querySelector('.download-button');
    expect(downloadBtn).not.toBeNull();
    expect(downloadBtn.getAttribute('href')).toBe('blob:targeturl');

    window.URL.createObjectURL = originalCreateObjectURL;
  });
});
