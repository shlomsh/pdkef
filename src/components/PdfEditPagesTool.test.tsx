// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import PdfEditPagesTool from './PdfEditPagesTool.tsx';
import { editPages } from '../lib/editPages.js';
import dropzoneStyles from './Dropzone.module.css';
import toolShellStyles from './ToolShell.module.css';
import pageGridStyles from './PageGrid.module.css';
import pdfToolStyles from './PdfTool.module.css';
import { mockNativeFileShare } from '../test/mockFileShare.js';
import { setInputFiles } from '../test/setInputFiles.js';

function makePdfFile(name) {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

const { mockState } = vi.hoisted(() => ({ mockState: { numPages: 3 } }));

// Mock pdf-lib
vi.mock('@cantoo/pdf-lib', () => {
  return {
    PDFDocument: {
      load: vi.fn(() => Promise.resolve({
        getPageCount: () => mockState.numPages,
      })),
    },
  };
});

// Mock thumbnails loader
vi.mock('../lib/thumbnails.js', () => {
  return {
    renderPdfThumbnails: vi.fn((file, onPageRender) => {
      for (let i = 1; i <= mockState.numPages; i++) {
        onPageRender(i, `data:image/png;base64,fake-thumbnail-${i}`);
      }
      return Promise.resolve(mockState.numPages);
    }),
  };
});

// Mock core page editing logic
vi.mock('../lib/editPages.js', () => {
  return {
    editPages: vi.fn(() => Promise.resolve(new Blob(['modified-pdf-bytes'], { type: 'application/pdf' }))),
  };
});

describe('PdfEditPagesTool UI flow', () => {
  let container;

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    mockState.numPages = 3;
    vi.restoreAllMocks();
  });

  it('renders the initial file dropper zone', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfEditPagesTool />, container);
    });

    const dropzone = container.querySelector(`.${dropzoneStyles.dropzone}`);
    expect(dropzone).not.toBeNull();
    expect(dropzone.textContent).toContain('Drop PDF here');
  });

  it('loads the PDF and displays the page thumbnails in a grid', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfEditPagesTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makePdfFile('document.pdf');

    await act(async () => {
      setInputFiles(input, [file]);
    });

    // Wait for the async loads to resolve
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Check that the file bar shows the file name and page count
    const fileBar = container.querySelector(`.${toolShellStyles.identity}`);
    expect(fileBar).not.toBeNull();
    expect(fileBar.textContent).toContain('document.pdf');
    expect(fileBar.textContent).toContain('3 pages');

    // Check that we have 3 page cards
    const cards = container.querySelectorAll(`.${pageGridStyles['page-card']}`);
    expect(cards.length).toBe(3);
    expect(cards[0].textContent).toContain('Page 1');
    expect(cards[1].textContent).toContain('Page 2');
    expect(cards[2].textContent).toContain('Page 3');
  });

  it('toggles page removal state when page cards are clicked', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfEditPagesTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makePdfFile('document.pdf');

    await act(async () => {
      setInputFiles(input, [file]);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const cards = container.querySelectorAll(`.${pageGridStyles['page-card']}`);
    const actionButton = container.querySelector(`.${pdfToolStyles['tool-primary-action']}`);

    // Default: no pages selected for removal, button says "Make edits to apply"
    expect(actionButton.textContent).toContain('Make edits to apply');
    expect(actionButton.disabled).toBe(true);

    // Click Page 2 to mark it for removal
    await act(async () => {
      cards[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Page 2 should have is-removed class and button should be active
    expect(cards[1].className).toContain(pageGridStyles['is-removed']);
    expect(actionButton.disabled).toBe(false);
    expect(actionButton.textContent).toContain('Apply Changes');

    // Click Page 2 again to keep it
    await act(async () => {
      cards[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(cards[1].className).not.toContain(pageGridStyles['is-removed']);
    expect(actionButton.disabled).toBe(true);
  });

  it('handles toolbar selection controls correctly', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfEditPagesTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makePdfFile('document.pdf');

    await act(async () => {
      setInputFiles(input, [file]);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const buttons = container.querySelectorAll(`.${pageGridStyles['grid-actions']} button`);
    const keepAllBtn = Array.from(buttons).find(b => b.textContent === 'Keep all');
    const removeAllBtn = Array.from(buttons).find(b => b.textContent === 'Remove all');
    const invertBtn = Array.from(buttons).find(b => b.textContent === 'Invert');

    // Click Remove all
    await act(async () => {
      removeAllBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const cards = container.querySelectorAll(`.${pageGridStyles['page-card']}`);
    expect(Array.from(cards).every(c => c.classList.contains(pageGridStyles['is-removed']))).toBe(true);

    const actionButton = container.querySelector(`.${pdfToolStyles['tool-primary-action']}`);
    expect(actionButton.textContent).toContain('Cannot remove all pages');
    expect(actionButton.disabled).toBe(true);

    // Click Keep all
    await act(async () => {
      keepAllBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(Array.from(cards).some(c => c.classList.contains(pageGridStyles['is-removed']))).toBe(false);
    expect(actionButton.textContent).toContain('Make edits to apply');

    // Click Page 1, then Invert
    await act(async () => {
      cards[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(cards[0].className).toContain(pageGridStyles['is-removed']);

    await act(async () => {
      invertBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(cards[0].className).not.toContain(pageGridStyles['is-removed']);
    expect(cards[1].className).toContain(pageGridStyles['is-removed']);
    expect(cards[2].className).toContain(pageGridStyles['is-removed']);
    expect(actionButton.textContent).toContain('Apply Changes');
  });

  it('runs page removal and produces download URL', async () => {
    const nativeShare = mockNativeFileShare();
    const originalCreateObjectURL = window.URL.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:testurl');
    window.URL.revokeObjectURL = vi.fn();

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfEditPagesTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makePdfFile('document.pdf');

    await act(async () => {
      setInputFiles(input, [file]);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const cards = container.querySelectorAll(`.${pageGridStyles['page-card']}`);
    await act(async () => {
      cards[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const actionButton = container.querySelector(`.${pdfToolStyles['tool-primary-action']}`);
    expect(actionButton.textContent).toContain('Apply Changes');

    await act(async () => {
      actionButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Check download button is present
    const downloadBtn = container.querySelector(`.${pdfToolStyles['download-button']}`);
    expect(downloadBtn).not.toBeNull();
    expect(downloadBtn.getAttribute('href')).toBe('blob:testurl');
    expect(downloadBtn.getAttribute('download')).toBe('document_modified.pdf');

    const shareButton = container.querySelector(`.${pdfToolStyles['pdf-share-button']}`);
    expect(shareButton).not.toBeNull();
    await act(async () => shareButton.click());
    expect(nativeShare.share.mock.calls[0][0].files[0].name).toBe('document_modified.pdf');

    // There is no Start over button under the result any more, and none in the
    // header above it either: both meant "give me a different file", so the one
    // Replace control in the shell says it. Picking a replacement on top of page
    // changes has to ask first - this tool used to discard them silently.
    expect(container.querySelector(`.${toolShellStyles.action}`).textContent).toContain('Replace');

    const replacement = new File([new Uint8Array([1, 2, 3])], 'other.pdf', { type: 'application/pdf' });
    const replaceInput = container.querySelector('input[type="file"]');
    await act(async () => {
      Object.defineProperty(replaceInput, 'files', { value: [replacement], configurable: true });
      replaceInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const confirmation = container.querySelector('dialog[aria-labelledby="confirm-replace-title"]');
    expect(confirmation.open).toBe(true);
    expect(confirmation.textContent).toContain('discards your page changes');

    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
    nativeShare.restore();
  });
});
