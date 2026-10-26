// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import PdfEditPagesTool from './PdfEditPagesTool.tsx';
import { editPages } from './editPages.js';
import dropzoneStyles from '../../shell/Dropzone.module.css';
import toolShellStyles from '../../shell/ToolShell.module.css';
import { workspaceStyles } from '../../shell/pageWorkspace/PageWorkspace.tsx';
import { mockNativeFileShare } from '../../test/mockFileShare.js';
import { setInputFiles } from '../../test/setInputFiles.js';
import { reportError } from '../../lib/errorReport.ts';

function makePdfFile(name) {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

const { mockState } = vi.hoisted(() => ({ mockState: { numPages: 3 } }));

vi.mock('../../lib/errorReport.ts', async (importOriginal) => ({
  ...(await importOriginal()),
  reportError: vi.fn(),
}));

// Mock pdf-lib
vi.mock('@cantoo/pdf-lib', () => ({
  PDFDocument: {
    load: vi.fn(() => Promise.resolve({
      getPageCount: () => mockState.numPages,
    })),
  },
}));

// The shared grid reads pdf.js through this source; no real rendering here.
vi.mock('../../lib/thumbnails.js', () => ({
  openThumbnailSource: vi.fn(async (file) => ({
    file,
    pageCount: mockState.numPages,
    render: vi.fn(async (pageIndex) => `data:image/png;base64,fake-${pageIndex}`),
    destroy: vi.fn(async () => {}),
  })),
  renderThumbnail: vi.fn(() => Promise.resolve(null)),
  renderPdfThumbnails: vi.fn(async () => 0),
}));

// Mock core page editing logic
vi.mock('./editPages.js', () => ({
  editPages: vi.fn(() => Promise.resolve(new Blob(['modified-pdf-bytes'], { type: 'application/pdf' }))),
}));

const { takeHandoffMock, saveHandoffMock } = vi.hoisted(() => ({
  takeHandoffMock: vi.fn(() => Promise.resolve(null)),
  saveHandoffMock: vi.fn(() => Promise.resolve(true)),
}));

// SITE-42: the home page hands picked files over through the draft store's hand-off slot.
vi.mock('../../lib/drafts/draftStore.js', async (importOriginal) => ({
  ...(await importOriginal()),
  takeHandoff: takeHandoffMock,
  saveHandoff: saveHandoffMock,
}));

const flush = (ms = 50) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

describe('PdfEditPagesTool UI flow', () => {
  let container;

  beforeEach(() => {
    editPages.mockClear();
    reportError.mockClear();
    saveHandoffMock.mockClear();
    window.URL.createObjectURL = vi.fn(() => 'blob:testurl');
    window.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    mockState.numPages = 3;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function load(name = 'document.pdf') {
    container = document.createElement('div');
    document.body.appendChild(container);
    // jsdom cannot follow a download link.
    container.addEventListener('click', (e) => e.preventDefault());
    act(() => { render(<PdfEditPagesTool />, container); });
    await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), [makePdfFile(name)]); });
    await flush();
  }

  const cells = () => Array.from(container.querySelectorAll('ul[data-page-grid] > li[data-key]'));
  const button = (label) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label);
  const heading = () => container.querySelector('#page-grid-heading');
  const skipButton = (number) => container.querySelector(`[aria-label="Skip page ${number}"], [aria-label="Include page ${number}"]`);
  // The rail's Download element, the one with a state; the phone bar's quiet button has none.
  const downloadElement = () => container.querySelector('a[data-state]');
  // A pointer on the Download element asks for the build now instead of after the quiet wait.
  const prepareNow = async () => {
    await act(async () => { downloadElement().dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    await flush();
  };

  it('skipping every page says so on the Download element, not that it is preparing', async () => {
    await load();
    await click(button('Skip all'));
    await flush();
    expect(downloadElement().getAttribute('data-state')).toBe('nothing');
    expect(downloadElement().textContent).toContain('Every page is skipped');
    expect(downloadElement().textContent).not.toContain('Preparing 0');
  });

  it('renders the initial file dropper zone', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { render(<PdfEditPagesTool />, container); });

    const dropzone = container.querySelector(`.${dropzoneStyles.dropzone}`);
    expect(dropzone).not.toBeNull();
    expect(dropzone.textContent).toContain('Drop PDF here');
  });

  it('loads the PDF into the shared grid under a heading that names the output and its pages', async () => {
    await load();

    expect(cells().map((c) => c.dataset.key)).toEqual(['0:0', '0:1', '0:2']);
    expect(heading().textContent).toContain('document_modified.pdf');
    expect(heading().textContent).toContain('3 pages');
    // The heading names the file, so the shell's own identity row is not shown.
    expect(container.querySelector(`.${toolShellStyles.identity}`)).toBeNull();
    // There is no Apply button: the Download element is the whole finish.
    expect(downloadElement().textContent).toContain('3 pages');
    expect(container.textContent).not.toContain('Apply Changes');
  });

  it('shows the loading line while the structure loads', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { render(<PdfEditPagesTool />, container); });
    await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), [makePdfFile('document.pdf')]); });
    expect(container.textContent).toContain('Loading PDF file structure');
    await flush();
    expect(container.textContent).not.toContain('Loading PDF file structure');
  });

  it('skipping a page dims it and counts the skipped page in the heading and the Download element', async () => {
    await load();

    await click(skipButton(2));
    expect(cells()[1].hasAttribute('data-skipped')).toBe(true);
    expect(heading().textContent).toContain('2 pages');
    expect(heading().textContent).toContain('1 page skipped');
    expect(downloadElement().textContent).toContain('2 pages');

    await click(skipButton(2));
    expect(cells()[1].hasAttribute('data-skipped')).toBe(false);
    expect(heading().textContent).not.toContain('skipped');
  });

  // UX guideline 20: the output choice, then which pages, then Download and hand-offs, Replace file last.
  it('runs the rail in order of consequence, with Replace file last', async () => {
    await load();
    const rail = container.querySelector(`.${workspaceStyles.rail}`);
    const order = Array.from(rail.querySelectorAll('input, button, a[data-state]'))
      .map((el) => (el.hasAttribute('data-state') ? 'download' : (el as HTMLInputElement).type === 'checkbox' ? 'page numbers' : el.textContent.trim()));
    expect(order.slice(0, 5)).toEqual(['page numbers', 'Include all', 'Skip all', 'Invert', 'download']);
    expect(order[order.length - 1]).toBe('Replace file');
  });

  it('Include all, Skip all and Invert each change the pages in one step', async () => {
    await load();
    const skipped = () => cells().map((c) => c.hasAttribute('data-skipped'));

    await click(button('Skip all'));
    expect(skipped()).toEqual([true, true, true]);
    await click(button('Include all'));
    expect(skipped()).toEqual([false, false, false]);

    await click(skipButton(1));
    await click(button('Invert'));
    expect(skipped()).toEqual([false, true, true]);
  });

  it('a failed build points to Unlock, where a protected PDF can be opened', async () => {
    editPages.mockRejectedValueOnce(new Error('This PDF is password protected.'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await load();
    await click(skipButton(2));
    await prepareNow();

    const alert = container.querySelector('[role="alert"]');
    expect(alert.querySelector('a[href="/unlock/"]')).not.toBeNull();
    expect(downloadElement().dataset.state).toBe('error');
    expect(reportError).toHaveBeenCalledWith('pdf_tool_run', expect.any(Error), 'apply_page_edits');
  });

  it('builds the edited PDF from the plan and offers it as a download under the output name', async () => {
    await load();
    await click(skipButton(2));
    await prepareNow();

    expect(editPages).toHaveBeenCalledTimes(1);
    const [, options] = editPages.mock.calls[0];
    expect(options).toEqual({
      pageOrder: [1, 2, 3],
      removedPageNums: new Set([2]),
      rotations: {},
      addPageNumbers: false,
    });
    const link = downloadElement();
    expect(link.dataset.state).toBe('ready');
    expect(link.getAttribute('href')).toBe('blob:testurl');
    expect(link.getAttribute('download')).toBe('document_modified.pdf');
    expect(link.textContent).toContain('Download edited PDF');
  });

  it('Add page numbers is part of the build', async () => {
    await load();
    await click(container.querySelector('input[type="checkbox"]'));
    await prepareNow();
    expect(editPages.mock.calls.at(-1)[1].addPageNumbers).toBe(true);
  });

  it('a tap on a ready Download opens the done strip with Share and the hand-offs', async () => {
    const nativeShare = mockNativeFileShare();
    await load();
    await prepareNow();
    expect(downloadElement().dataset.state).toBe('ready');

    await click(container.querySelector('[data-quiet-download]'));
    expect(downloadElement().dataset.state).toBe('saved');
    const strip = container.querySelector('section[aria-label="Your edited PDF is ready."]');
    expect(strip).not.toBeNull();
    expect(strip.textContent).toContain('document_modified.pdf');
    expect(strip.textContent).toContain('Compress');
    expect(strip.textContent).toContain('Sign');

    const share = Array.from(container.querySelectorAll(`.${workspaceStyles['handoff-row']} button`)).find((b) => b.textContent.includes('Share'));
    expect(share).toBeTruthy();
    await act(async () => share.click());
    expect(nativeShare.share.mock.calls[0][0].files[0].name).toBe('document_modified.pdf');
    nativeShare.restore();
  });

  it('the rail hands the result to Compress and parks its bytes', async () => {
    await load();
    await prepareNow();
    const compress = Array.from(container.querySelectorAll(`.${workspaceStyles['handoff-row']} button`)).find((b) => b.textContent === 'Compress');
    vi.stubGlobal('location', { href: '/organize-pdf/' });
    await act(async () => { compress.click(); await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(saveHandoffMock).toHaveBeenCalledWith('compress', expect.objectContaining({
      fileName: 'document_modified.pdf', fileType: 'application/pdf', fileBytes: expect.any(ArrayBuffer),
    }));
    expect(window.location.href).toBe('/compress/');
  });

  it('Replace file asks first and names what stays in recents', async () => {
    await load();
    await click(button('Replace file'));
    const confirmation = container.querySelector('dialog[aria-labelledby="confirm-replace-title"]');
    expect(confirmation.open).toBe(true);
    expect(confirmation.textContent).toContain('stays in your recent files');
    expect(confirmation.textContent).toContain('document.pdf');
  });

  it('loads a PDF handed off from the home page as if picked', async () => {
    takeHandoffMock.mockResolvedValueOnce({
      fileName: 'handed.pdf',
      fileType: 'application/pdf',
      fileBytes: new TextEncoder().encode('%PDF-1.4').buffer,
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { render(<PdfEditPagesTool />, container); });
    await flush();
    await flush();
    expect(takeHandoffMock).toHaveBeenCalledWith('edit-pdf');
    expect(heading().textContent).toContain('handed_modified.pdf');
    expect(cells().length).toBe(3);
  });

  // Picking another file through the Replace dialog, as a person does.
  const replaceWith = async (file) => {
    await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), [file]); });
    const dialog = container.querySelector('dialog[aria-labelledby="confirm-replace-title"]');
    await act(async () => Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Replace file').click());
    await flush();
    await flush();
  };

  it('replacing the file drops a Download tapped before the build landed', async () => {
    let finishFirst;
    editPages.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
    await load('a.pdf');
    await prepareNow();
    await click(downloadElement());
    expect(downloadElement().dataset.state).toBe('preparing');

    await replaceWith(makePdfFile('b.pdf'));
    await prepareNow();
    expect(downloadElement().dataset.state).toBe('ready');
    finishFirst?.(new Blob(['late']));
  });

  it('renaming the output keeps the built PDF: no rebuild, still ready', async () => {
    await load();
    await prepareNow();
    expect(editPages).toHaveBeenCalledTimes(1);
    const name = container.querySelector('[contenteditable]');
    await act(async () => { name.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    await act(async () => { name.textContent = 'my edit'; });
    await act(async () => { name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
    await flush();
    expect(downloadElement().getAttribute('download')).toBe('my edit.pdf');
    expect(downloadElement().getAttribute('href')).toBe('blob:testurl');
    expect(editPages).toHaveBeenCalledTimes(1);
  });

  it('a different file with the same name, size and date is built, not served from the cache', async () => {
    const same = () => new File(['%PDF-1.4'], 'same.pdf', { type: 'application/pdf', lastModified: 1000 });
    container = document.createElement('div');
    document.body.appendChild(container);
    container.addEventListener('click', (e) => e.preventDefault());
    act(() => { render(<PdfEditPagesTool />, container); });
    await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), [same()]); });
    await flush();
    await prepareNow();
    expect(editPages).toHaveBeenCalledTimes(1);

    await replaceWith(same());
    await prepareNow();
    expect(editPages).toHaveBeenCalledTimes(2);
  });

  it('the signal of a superseded build is aborted and handed to editPages', async () => {
    await load();
    await prepareNow();
    expect(editPages.mock.calls[0][3]).toBeInstanceOf(AbortSignal);
  });
});
