import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import Sortable from 'sortablejs';
import PdfImageToPdfTool from './PdfImageToPdfTool.jsx';
import * as imageToPdfLib from '../lib/imageToPdf.js';
import styles from './FileList.module.css';
import dropzoneStyles from './Dropzone.module.css';
import pdfToolStyles from './PdfTool.module.css';
import { mockNativeFileShare } from '../test/mockFileShare.js';

function makeImageFile(name, type = 'image/png') {
  return new File(['fake-image-bytes'], name, { type });
}

vi.mock('../lib/imageToPdf.js', () => ({
  imagesToPdf: vi.fn(() => Promise.resolve(new Blob(['%PDF-1.4'], { type: 'application/pdf' }))),
  UnsupportedImageError: class UnsupportedImageError extends Error {},
}));

describe('PdfImageToPdfTool UI flow', () => {
  let container;
  let originalCreateObjectURL;
  let originalRevokeObjectURL;

  beforeEach(() => {
    originalCreateObjectURL = window.URL.createObjectURL;
    originalRevokeObjectURL = window.URL.revokeObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:testurl');
    window.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  function mount() {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfImageToPdfTool />, container);
    });
  }

  async function loadFiles(names = ['a.png', 'b.jpg']) {
    const input = container.querySelector('input[type="file"]');
    const files = names.map((n) => makeImageFile(n, n.endsWith('.jpg') ? 'image/jpeg' : 'image/png'));
    await act(async () => {
      Object.defineProperty(input, 'files', { value: files, configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  it('renders the initial file dropper zone', () => {
    mount();
    const dropzone = container.querySelector(`.${dropzoneStyles.dropzone}`);
    expect(dropzone).not.toBeNull();
    expect(dropzone.textContent).toContain('Drop images here');
  });

  it('lists added images and enables convert with 1 or more files', async () => {
    mount();
    await loadFiles(['one.png']);

    const header = container.querySelector(`.${pdfToolStyles['list-count']}`);
    expect(header.textContent).toContain('1 image');

    const fileNames = Array.from(container.querySelectorAll(`.${styles['file-name']}`)).map((el) => el.textContent);
    expect(fileNames).toEqual(['one.png']);

    const convertBtn = container.querySelector(`.${pdfToolStyles['merge-button']}`);
    expect(convertBtn.disabled).toBe(false);
    expect(convertBtn.textContent).toContain('Convert 1 image to PDF');
  });

  it('skips non-image files and shows a hint', async () => {
    mount();
    const input = container.querySelector('input[type="file"]');
    const files = [makeImageFile('doc.pdf', 'application/pdf')];
    await act(async () => {
      Object.defineProperty(input, 'files', { value: files, configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const hint = container.querySelector('.hint-message');
    expect(hint.textContent).toContain('not a JPG or PNG');
  });

  it('converts images and produces a download link', async () => {
    const nativeShare = mockNativeFileShare();
    mount();
    await loadFiles(['doc1.png', 'doc2.jpg']);

    const convertBtn = container.querySelector(`.${pdfToolStyles['merge-button']}`);
    expect(convertBtn.textContent).toContain('Convert 2 images to PDF');

    await act(async () => {
      convertBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(imageToPdfLib.imagesToPdf).toHaveBeenCalled();
    const downloadBtn = container.querySelector(`.${pdfToolStyles['download-button']}`);
    expect(downloadBtn).not.toBeNull();
    expect(downloadBtn.getAttribute('href')).toBe('blob:testurl');
    expect(downloadBtn.getAttribute('download')).toBe('images.pdf');

    const shareButton = container.querySelector(`.${pdfToolStyles['pdf-share-button']}`);
    expect(shareButton).not.toBeNull();
    await act(async () => shareButton.click());
    expect(nativeShare.share.mock.calls[0][0].files[0].name).toBe('images.pdf');
    nativeShare.restore();
  });

  it('removes an image when the remove button is clicked', async () => {
    mount();
    await loadFiles(['one.png', 'two.png']);

    let fileNames = Array.from(container.querySelectorAll(`.${styles['file-name']}`)).map((el) => el.textContent);
    expect(fileNames).toEqual(['one.png', 'two.png']);

    const removeBtns = container.querySelectorAll(`.${styles['remove-button']}`);
    await act(async () => {
      removeBtns[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    fileNames = Array.from(container.querySelectorAll(`.${styles['file-name']}`)).map((el) => el.textContent);
    expect(fileNames).toEqual(['two.png']);
  });

  it('attaches a Sortable instance to the file list once files are added', async () => {
    const createSpy = vi.spyOn(Sortable, 'create');
    mount();

    expect(createSpy).not.toHaveBeenCalled();

    await loadFiles(['a.png', 'b.png']);

    const list = container.querySelector(`ul.${styles['file-list']}`);
    expect(list).not.toBeNull();
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith(list, expect.any(Object));
  });
});
