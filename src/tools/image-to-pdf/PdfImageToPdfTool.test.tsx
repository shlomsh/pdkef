// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import Sortable from 'sortablejs';
import PdfImageToPdfTool from './PdfImageToPdfTool.tsx';
import * as imageToPdfLib from './imageToPdf.js';
import styles from '../../shell/FileList.module.css';
import dropzoneStyles from '../../shell/Dropzone.module.css';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import toolShellStyles from '../../shell/ToolShell.module.css';
import { mockNativeFileShare } from '../../test/mockFileShare.js';
import { setInputFiles } from '../../test/setInputFiles.js';
import { recentActions, resetActionTrailForTests } from '../../lib/actionTrail.ts';

function makeImageFile(name, type = 'image/png') {
  return new File(['fake-image-bytes'], name, { type });
}


const { takeHandoffMock } = vi.hoisted(() => ({ takeHandoffMock: vi.fn(() => Promise.resolve(null)) }));

// SITE-42: the home page hands picked files over through the draft store's hand-off slot.
vi.mock('../../lib/drafts/draftStore.js', async (importOriginal) => ({
  ...(await importOriginal()),
  takeHandoff: takeHandoffMock,
}));

vi.mock('./imageToPdf.js', () => ({
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
      setInputFiles(input, files);
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

    // The count moved into the read-only identity line when the header row
    // it used to share with Clear all was dissolved.
    const identity = container.querySelector(`.${toolShellStyles.name}`);
    expect(identity.textContent).toContain('1 image');

    const fileNames = Array.from(container.querySelectorAll(`.${styles['file-name']}`)).map((el) => el.textContent);
    expect(fileNames).toEqual(['one.png']);

    const convertBtn = container.querySelector(`.${pdfToolStyles['tool-primary-action']}`);
    expect(convertBtn.disabled).toBe(false);
    expect(convertBtn.textContent).toContain('Convert 1 image to PDF');
  });

  it('revokes every thumbnail URL on unmount, including ones added after the first render', async () => {
    let n = 0;
    const created = [];
    window.URL.createObjectURL = vi.fn(() => {
      const url = `blob:thumb-${++n}`;
      created.push(url);
      return url;
    });
    mount();
    await loadFiles(['a.png']);
    await loadFiles(['b.jpg', 'c.png']);
    expect(created.length).toBeGreaterThanOrEqual(3);
    window.URL.revokeObjectURL.mockClear();

    act(() => render(null, container));

    const revoked = window.URL.revokeObjectURL.mock.calls.map((c) => c[0]);
    for (const url of created) expect(revoked).toContain(url);
  });

  it('skips non-image files and shows a hint', async () => {
    mount();
    const input = container.querySelector('input[type="file"]');
    const files = [makeImageFile('doc.pdf', 'application/pdf')];
    await act(async () => {
      setInputFiles(input, files);
    });

    const hint = container.querySelector(`.${pdfToolStyles['hint-message']}`);
    expect(hint.textContent).toContain('not a JPG or PNG');
  });

  it('converts images and produces a download link', async () => {
    const nativeShare = mockNativeFileShare();
    mount();
    await loadFiles(['doc1.png', 'doc2.jpg']);

    const convertBtn = container.querySelector(`.${pdfToolStyles['tool-primary-action']}`);
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

  it('records what the person did, by name only, in order', async () => {
    resetActionTrailForTests();
    mount();
    await loadFiles(['a.png', 'b.jpg']);
    await act(async () => {
      container.querySelector(`.${styles['remove-button']}`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector(`.${pdfToolStyles['tool-primary-action']}`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(recentActions()).toEqual(['add_files', 'remove_file', 'export']);
  });

  it('loads photos handed off from the home page, in pick order', async () => {
    takeHandoffMock.mockResolvedValueOnce({
      files: [
        { fileName: 'first.jpg', fileType: 'image/jpeg', fileBytes: new Uint8Array(2).buffer },
        { fileName: 'second.png', fileType: 'image/png', fileBytes: new Uint8Array(3).buffer },
      ],
    });
    mount();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(takeHandoffMock).toHaveBeenCalledWith('image-to-pdf');
    const fileNames = Array.from(container.querySelectorAll(`.${styles['file-name']}`)).map((el) => el.textContent);
    expect(fileNames).toEqual(['first.jpg', 'second.png']);
  });
});
