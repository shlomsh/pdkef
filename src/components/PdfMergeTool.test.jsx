import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import Sortable from 'sortablejs';
import PdfMergeTool from './PdfMergeTool.jsx';
import * as mergeLib from '../lib/merge.js';
import * as thumbnailsLib from '../lib/thumbnails.js';

function makePdfFile(name) {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

vi.mock('../lib/merge.js', () => ({
  mergePdfs: vi.fn(() => Promise.resolve(new Blob(['%PDF-1.4-merged'], { type: 'application/pdf' }))),
  resolvePdfCreationDate: vi.fn(() => Promise.resolve(new Date())),
}));

vi.mock('../lib/thumbnails.js', () => ({
  renderThumbnail: vi.fn(() => Promise.resolve('data:image/png;base64,mock')),
}));

describe('PdfMergeTool UI flow', () => {
  let container;

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.restoreAllMocks();
  });

  function mount() {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfMergeTool />, container);
    });
  }

  async function loadFiles(names = ['a.pdf', 'b.pdf']) {
    const input = container.querySelector('input[type="file"]');
    const files = names.map(makePdfFile);
    await act(async () => {
      Object.defineProperty(input, 'files', { value: files, configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 10)); // let thumbnails resolve
    });
  }

  it('renders the initial file dropper zone', () => {
    mount();
    const dropzone = container.querySelector('.dropzone');
    expect(dropzone).not.toBeNull();
    expect(dropzone.textContent).toContain('Drop PDFs here');
  });

  it('lists added files and disables merge if less than 2 files', async () => {
    mount();
    await loadFiles(['one.pdf']);

    const header = container.querySelector('.list-count');
    expect(header.textContent).toContain('1 PDF');

    const fileNames = Array.from(container.querySelectorAll('.file-name')).map(el => el.textContent);
    expect(fileNames).toEqual(['one.pdf']);

    const mergeBtn = container.querySelector('.merge-button');
    expect(mergeBtn.disabled).toBe(true);
    expect(mergeBtn.textContent).toContain('Add 1 more to merge');
  });

  it('enables merge button with 2 or more files and merges them', async () => {
    mount();
    await loadFiles(['doc1.pdf', 'doc2.pdf']);

    const mergeBtn = container.querySelector('.merge-button');
    expect(mergeBtn.disabled).toBe(false);
    expect(mergeBtn.textContent).toContain('Merge 2 PDFs');

    const originalCreateObjectURL = window.URL.createObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:testurl');

    await act(async () => {
      mergeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    expect(mergeLib.mergePdfs).toHaveBeenCalled();
    const downloadBtn = container.querySelector('.download-button');
    expect(downloadBtn).not.toBeNull();
    expect(downloadBtn.getAttribute('href')).toBe('blob:testurl');
    expect(downloadBtn.getAttribute('download')).toBe('merged.pdf');

    window.URL.createObjectURL = originalCreateObjectURL;
  });

  it('removes a file when the remove button is clicked', async () => {
    mount();
    await loadFiles(['one.pdf', 'two.pdf']);

    let fileNames = Array.from(container.querySelectorAll('.file-name')).map(el => el.textContent);
    expect(fileNames).toEqual(['one.pdf', 'two.pdf']);

    const removeBtns = container.querySelectorAll('.remove-button');
    await act(async () => {
      removeBtns[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    fileNames = Array.from(container.querySelectorAll('.file-name')).map(el => el.textContent);
    expect(fileNames).toEqual(['two.pdf']);
  });

  it('attaches a Sortable instance to the file list once files are added', async () => {
    const createSpy = vi.spyOn(Sortable, 'create');
    mount();

    expect(createSpy).not.toHaveBeenCalled();
    
    await loadFiles(['a.pdf', 'b.pdf']);

    const list = container.querySelector('ul.file-list');
    expect(list).not.toBeNull();
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith(list, expect.any(Object));
  });
});
