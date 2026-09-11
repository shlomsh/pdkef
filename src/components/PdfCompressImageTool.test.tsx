// @ts-nocheck - mirrors PdfCompressTool.test.tsx, renamed from .jsx conventions
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import PdfCompressImageTool from './PdfCompressImageTool.tsx';
import * as compressImageLib from '../lib/compressImage.js';
import styles from './PdfCompressTool.module.css';
import dropzoneStyles from './Dropzone.module.css';
import toolShellStyles from './ToolShell.module.css';
import pdfToolStyles from './PdfTool.module.css';
import { mockNativeFileShare } from '../test/mockFileShare.js';
import { setInputFiles } from '../test/setInputFiles.js';

function makeImageFile(name, size = 1000, type = 'image/jpeg') {
  const file = new File(['fake-image-bytes'], name, { type });
  Object.defineProperty(file, 'size', { value: size, writable: true });
  return file;
}

function makeResult(overrides = {}) {
  return {
    blob: new Blob(['jpeg-bytes'], { type: 'image/jpeg' }),
    metTarget: true,
    width: 800,
    height: 600,
    originalWidth: 1600,
    originalHeight: 1200,
    ...overrides,
  };
}

// The interface this tool is built against (see the ticket): mocked here so
// this test suite never depends on src/lib/compressImage.js's own arrival or
// implementation - only the shape it promises to return.
vi.mock('../lib/compressImage.js', () => ({
  compressImageToTarget: vi.fn(() => Promise.resolve(makeResult())),
}));

describe('PdfCompressImageTool UI flow', () => {
  let container;

  beforeEach(() => {
    vi.clearAllMocks();
    compressImageLib.compressImageToTarget.mockImplementation(() => Promise.resolve(makeResult()));
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
      render(<PdfCompressImageTool />, container);
    });

    const dropzone = container.querySelector(`.${dropzoneStyles.dropzone}`);
    expect(dropzone).not.toBeNull();
    expect(dropzone.textContent).toContain('Drop image here');
  });

  it('rejects a non-image file', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfCompressImageTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const pdfFile = new File(['%PDF-1.4'], 'document.pdf', { type: 'application/pdf' });

    await act(async () => {
      setInputFiles(input, [pdfFile]);
    });

    const hint = container.querySelector(`.${pdfToolStyles['hint-message']}`);
    expect(hint).not.toBeNull();
    expect(hint.textContent).toContain('document.pdf');
    expect(hint.textContent).toContain('not a JPG or PNG');

    // Rejecting doesn't load a file, so the dropzone is still showing.
    expect(container.querySelector(`.${dropzoneStyles.dropzone}`)).not.toBeNull();
    expect(compressImageLib.compressImageToTarget).not.toHaveBeenCalled();
  });

  it('loads an image and calls compressImageToTarget with the chosen target size', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfCompressImageTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makeImageFile('photo.jpg', 5_000_000);

    await act(async () => {
      setInputFiles(input, [file]);
    });

    const fileBar = container.querySelector(`.${toolShellStyles.identity}`);
    expect(fileBar).not.toBeNull();
    expect(fileBar.textContent).toContain('photo.jpg');

    // Default target is 100 KB; pick the 20 KB preset chip instead, the
    // tighter photo-cap shortcut SEO-19 added alongside PdfCompressTool's.
    const presets = container.querySelectorAll(`.${styles['target-size-preset']}`);
    const preset20 = Array.from(presets).find((b) => b.textContent.includes('20 KB'));
    expect(preset20).not.toBeNull();
    await act(async () => {
      preset20.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(preset20.className).toContain(styles['is-selected']);

    const originalCreateObjectURL = window.URL.createObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:targeturl');

    const button = container.querySelector(`.${pdfToolStyles['tool-primary-action']}`);
    expect(button.textContent).toContain('Compress Image');

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(compressImageLib.compressImageToTarget).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ targetKB: 20 }),
    );

    const downloadBtn = container.querySelector(`.${pdfToolStyles['download-button']}`);
    expect(downloadBtn).not.toBeNull();
    expect(downloadBtn.getAttribute('href')).toBe('blob:targeturl');
    expect(downloadBtn.getAttribute('download')).toBe('photo-compressed.jpg');

    window.URL.createObjectURL = originalCreateObjectURL;
  });

  it('renders the met-target result with dimensions and no miss warning', async () => {
    const nativeShare = mockNativeFileShare();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfCompressImageTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makeImageFile('id-scan.png', 300_000, 'image/png');

    await act(async () => {
      setInputFiles(input, [file]);
    });

    const originalCreateObjectURL = window.URL.createObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:metttarget');

    const button = container.querySelector(`.${pdfToolStyles['tool-primary-action']}`);
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const stats = container.querySelector(`.${styles['compression-stats']}`);
    expect(stats).not.toBeNull();
    expect(stats.textContent).toContain('Image Successfully Compressed!');
    expect(stats.textContent).toContain('1600 × 1200');
    expect(stats.textContent).toContain('800 × 600');
    expect(stats.textContent).not.toContain("Closest achievable size");

    const shareButton = container.querySelector(`.${pdfToolStyles['pdf-share-button']}`);
    expect(shareButton).not.toBeNull();
    await act(async () => shareButton.click());
    expect(nativeShare.share.mock.calls[0][0].files[0].name).toBe('id-scan-compressed.jpg');

    window.URL.createObjectURL = originalCreateObjectURL;
    nativeShare.restore();
  });

  it('renders the honest miss message when the target could not be reached', async () => {
    compressImageLib.compressImageToTarget.mockImplementation(() =>
      Promise.resolve(makeResult({ metTarget: false, blob: new Blob(['x'.repeat(200_000)], { type: 'image/jpeg' }) })),
    );

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfCompressImageTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makeImageFile('big-photo.jpg', 8_000_000);

    await act(async () => {
      setInputFiles(input, [file]);
    });

    const originalCreateObjectURL = window.URL.createObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:missedtarget');

    const button = container.querySelector(`.${pdfToolStyles['tool-primary-action']}`);
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const stats = container.querySelector(`.${styles['compression-stats']}`);
    expect(stats).not.toBeNull();
    expect(stats.textContent).toContain('Closest achievable size');
    expect(stats.textContent).toContain('100 KB');

    window.URL.createObjectURL = originalCreateObjectURL;
  });
});
