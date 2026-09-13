// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import Sortable from 'sortablejs';
import PdfMergeTool from './PdfMergeTool.tsx';
import * as mergeLib from '../lib/merge.js';
import * as thumbnailsLib from '../lib/thumbnails.js';
import * as draftStore from '../editor/workspace/draftStore.js';
import dropzoneStyles from './Dropzone.module.css';
import pdfToolStyles from './PdfTool.module.css';
import railStyles from './MergeTool/MergeRail.module.css';
import docStyles from './MergeTool/MergeDocument.module.css';
import downloadStyles from './MergeTool/DownloadElement.module.css';
import { mockNativeFileShare } from '../test/mockFileShare.js';
import { setInputFiles } from '../test/setInputFiles.js';

function makePdfFile(name, { type = 'application/pdf', size = 8 } = {}) {
  return new File(['%PDF-1.4'.padEnd(size, ' ')], name, { type });
}

// Every fixture "has" two pages unless a test says otherwise, so the plan
// and the identity line have real counts to show.
const pageCounts = new Map();

vi.mock('../lib/merge.js', () => {
  class MergeFileError extends Error {
    constructor(message, { fileIndex, reason, cause } = {}) {
      super(message);
      this.name = 'MergeFileError';
      this.fileIndex = fileIndex;
      this.reason = reason;
      this.cause = cause;
    }
  }
  return {
    MergeFileError,
    mergePdfs: vi.fn(() => Promise.resolve(new Blob(['%PDF-1.4-merged'], { type: 'application/pdf' }))),
    inspectPdf: vi.fn((file) => {
      const spec = pageCounts.get(file.name) ?? { pageCount: 2, encrypted: false };
      if (spec.unreadable) return Promise.reject(new MergeFileError('bad', { fileIndex: 0, reason: 'unreadable' }));
      return Promise.resolve({ pageCount: spec.pageCount, encrypted: spec.encrypted, creationDate: null });
    }),
    resolvePdfCreationDate: vi.fn(() => Promise.resolve(null)),
  };
});

// The island's own hand-off calls plus what the MERGE-13 draft component
// (loaded through a dynamic import) needs to mount quietly with no draft.
vi.mock('../editor/workspace/draftStore.js', () => ({
  saveHandoff: vi.fn(async () => true),
  loadDraft: vi.fn(async () => null),
  deleteDraft: vi.fn(async () => true),
  saveDraft: vi.fn(async () => true),
  hasDraftHint: vi.fn(() => false),
  subscribeToDraftChanges: vi.fn(() => () => {}),
  attachDraftPreview: vi.fn(() => false),
  readDraftMeta: vi.fn(() => null),
}));

// The MERGE-13 draft component is exercised through its props here; the hook
// itself has its own suite (useMergeDraft.test.tsx).
const draftProbe = { props: null };
vi.mock('./MergeTool/MergeDraftPersistence.tsx', () => ({
  default: (props) => {
    draftProbe.props = props;
    return null;
  },
}));

vi.mock('../lib/thumbnails.js', () => ({
  renderThumbnail: vi.fn(() => Promise.resolve('data:image/png;base64,mock')),
  renderThumbnailWithMeta: vi.fn(() => Promise.resolve({ dataUrl: 'data:image/png;base64,mock', pageCount: 2, width: 150, height: 194 })),
  renderPdfThumbnails: vi.fn(() => Promise.resolve(0)),
  openThumbnailSource: vi.fn(),
}));

const flush = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

describe('PdfMergeTool UI flow', () => {
  let container;
  let originalCreateObjectURL;

  beforeEach(() => {
    pageCounts.clear();
    localStorage.clear();
    draftProbe.props = null;
    // vi.mock factories keep their call history across tests; restoreAllMocks
    // only touches spies.
    mergeLib.mergePdfs.mockClear();
    mergeLib.inspectPdf.mockClear();
    draftStore.saveHandoff.mockClear();
    draftStore.deleteDraft.mockClear();
    draftStore.loadDraft.mockReset();
    draftStore.loadDraft.mockImplementation(async () => null);
    originalCreateObjectURL = window.URL.createObjectURL;
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
    vi.restoreAllMocks();
  });

  function mount(props = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfMergeTool prepareDelayMs={5} {...props} />, container);
    });
  }

  async function loadFiles(files) {
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      setInputFiles(input, files.map((f) => (typeof f === 'string' ? makePdfFile(f) : f)));
      await flush(10); // let inspection and thumbnails resolve
    });
  }

  // Waits out the pre-merge debounce (5ms in tests) and the merge itself.
  async function settle() {
    await act(async () => {
      await flush(30);
    });
  }

  const fileNames = () => Array.from(container.querySelectorAll(`.${railStyles['file-name']}`)).map((el) => el.textContent);
  const downloadBox = () => container.querySelector(`.${downloadStyles.box}`);
  // A real download only exists once the Download element carries an href
  // (state 'ready' or 'saved'); every other state is a plain trigger.
  const downloadLink = () => container.querySelector(`.${downloadStyles.box}[href]`);

  it('renders the initial file dropper zone', () => {
    mount();
    const dropzone = container.querySelector(`.${dropzoneStyles.dropzone}`);
    expect(dropzone).not.toBeNull();
    expect(dropzone.textContent).toContain('Drop PDFs here');
  });

  it('lists one file with its page count and asks for one more PDF instead of offering Download', async () => {
    mount();
    pageCounts.set('one.pdf', { pageCount: 3, encrypted: false });
    await loadFiles(['one.pdf']);

    expect(fileNames()).toEqual(['one.pdf']);
    expect(container.querySelector(`.${railStyles['file-pages']}`).textContent).toBe('3');

    const box = downloadBox();
    expect(box.getAttribute('data-state')).toBe('one-file');
    expect(box.hasAttribute('disabled')).toBe(false);
    expect(box.textContent).toContain('Add one more PDF to merge');
    expect(downloadLink()).toBeNull();
    expect(mergeLib.mergePdfs).not.toHaveBeenCalled();
  });

  it('pre-merges two files on idle and turns Download into the only primary control, named after the first file', async () => {
    const nativeShare = mockNativeFileShare();
    mount();
    await loadFiles(['Invoice 2024-03-01.pdf', 'doc2.pdf']);

    // Before the idle wait ends the Download element still reads preparing,
    // never a separate Merge step.
    const box = downloadBox();
    expect(box).not.toBeNull();
    expect(box.getAttribute('data-state')).toBe('preparing');
    expect(container.textContent).not.toContain('Merge 2 PDFs');

    await settle();

    expect(mergeLib.mergePdfs).toHaveBeenCalledTimes(1);
    const [files, options] = mergeLib.mergePdfs.mock.calls[0];
    expect(files.map((f) => f.name)).toEqual(['Invoice 2024-03-01.pdf', 'doc2.pdf']);
    expect(options.title).toBe('merged_Invoice 2024-03-01');
    expect(options.plan).toHaveLength(4);
    expect(options.plan[2]).toEqual({ fileIndex: 1, pageIndex: 0, rotation: 0, skipped: false });

    const link = downloadLink();
    expect(link).not.toBeNull();
    expect(link.getAttribute('data-state')).toBe('ready');
    expect(link.getAttribute('href')).toBe('blob:testurl');
    expect(link.getAttribute('download')).toBe('merged_Invoice 2024-03-01.pdf');
    expect(link.textContent).toContain('4 pages');
    // Exactly one Download element, same node throughout: no separate
    // "Merge" control ever appears.
    expect(container.querySelectorAll(`.${downloadStyles.box}`)).toHaveLength(1);

    // The document heading carries the total page count once every file is read.
    expect(container.querySelector(`.${docStyles['doc-heading']}`).textContent).toContain('4 pages');

    // Direction A: Share sits in the rail's hand-off row with the row's own
    // button class, so it is found by its accessible name, not the dialog look.
    const shareButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Share');
    expect(shareButton).not.toBeNull();
    await act(async () => shareButton.click());
    expect(nativeShare.share).toHaveBeenCalledOnce();
    expect(nativeShare.share.mock.calls[0][0].files[0].name).toBe('merged_Invoice 2024-03-01.pdf');
    nativeShare.restore();
  });

  it('the heading shows "N rendered" only while rendering, and drops it once every cell has a thumbnail', async () => {
    // A controllable IntersectionObserver: setup.js's global stub never
    // fires, which is right for tests that don't care, but this one has to
    // drive PageStrip's render queue to completion to prove the quieter
    // "rendered" span goes away once it does.
    const originalIO = globalThis.IntersectionObserver;
    const instances = [];
    globalThis.IntersectionObserver = class {
      constructor(callback) {
        this.callback = callback;
        this.targets = new Set();
        instances.push(this);
      }
      observe(target) { this.targets.add(target); }
      unobserve(target) { this.targets.delete(target); }
      disconnect() { this.targets.clear(); }
    };
    thumbnailsLib.openThumbnailSource.mockImplementation(async () => ({
      render: async () => 'data:image/png;base64,x',
      destroy: async () => {},
    }));

    mount();
    await loadFiles(['a.pdf', 'b.pdf']);
    // The grid (PageStrip) itself arrives through a dynamic import(); give
    // it a beat to mount and start observing before the IntersectionObserver
    // instance it creates is read below.
    await act(async () => { await flush(20); });
    // Four pages total (two files, two pages each); rendering has not
    // started yet, so the heading names the total and says none are done.
    const heading = () => container.querySelector(`.${docStyles['doc-heading']}`);
    expect(heading().textContent).toContain('4 pages');
    expect(heading().textContent).toContain('0 rendered');

    // Drive every observed cell "into view" and let the queue drain.
    const io = instances.at(-1);
    await act(async () => {
      io.callback(Array.from(io.targets).map((target) => ({ target, isIntersecting: true })));
      await flush(50);
    });
    expect(heading().textContent).not.toContain('rendered');

    globalThis.IntersectionObserver = originalIO;
  });

  it('a tap while the pre-merge is still running shows progress and delivers the file when it lands (MERGE-12)', async () => {
    let resolveMerge;
    mergeLib.mergePdfs.mockImplementationOnce(() => new Promise((resolve) => { resolveMerge = resolve; }));
    mount();
    await loadFiles(['a.pdf', 'b.pdf']);
    await act(async () => { await flush(8); });
    expect(mergeLib.mergePdfs).toHaveBeenCalledTimes(1);

    // The Download element is itself an <a> in every state now (MERGE-18),
    // so the click spy below (which stands in for the browser's own download
    // navigation once the app calls .click() on the ready link) must not
    // intercept this test's own tap on the still-preparing element - dispatch
    // a plain click event instead of calling the (about to be mocked) native
    // .click() method.
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await act(async () => {
      downloadBox().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(downloadBox().getAttribute('aria-busy')).toBe('true');
    expect(downloadBox().textContent).toContain('Preparing');

    await act(async () => {
      resolveMerge(new Blob(['%PDF'], { type: 'application/pdf' }));
      await flush(5);
    });
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(downloadLink()).not.toBeNull();
    expect(container.textContent).toContain('Start again');
    clickSpy.mockRestore();
  });

  it('any change to the list cancels the pending pre-merge and starts a new one', async () => {
    mount();
    await loadFiles(['a.pdf', 'b.pdf']);
    await settle();
    expect(mergeLib.mergePdfs).toHaveBeenCalledTimes(1);
    const firstSignal = mergeLib.mergePdfs.mock.calls[0][3];
    expect(firstSignal).toBeInstanceOf(AbortSignal);

    await loadFiles(['c.pdf']);
    // The blob for the old order is withdrawn at once, before the new one exists.
    expect(downloadLink()).toBeNull();
    await settle();
    expect(mergeLib.mergePdfs).toHaveBeenCalledTimes(2);
    expect(mergeLib.mergePdfs.mock.calls[1][0].map((f) => f.name)).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
    expect(downloadLink().getAttribute('download')).toBe('merged_a.pdf');
  });

  it('a thumbnail that arrives after the pre-merge started does not restart it', async () => {
    thumbnailsLib.renderThumbnail.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve('data:image/png;base64,late'), 25)),
    );
    mount();
    await loadFiles(['a.pdf', 'b.pdf']);
    await settle();
    expect(mergeLib.mergePdfs).toHaveBeenCalledTimes(1);
    await act(async () => { await flush(30); });
    // The late thumbnail resolves (renderThumbnail is used for the rail's
    // internal entry state) without ever restarting the pre-merge.
    expect(mergeLib.mergePdfs).toHaveBeenCalledTimes(1);
    expect(downloadLink()).not.toBeNull();
  });

  it('accepts a .pdf with an empty MIME type and still skips a real non-PDF (MERGE-02)', async () => {
    mount();
    await loadFiles([makePdfFile('typeless.pdf', { type: '' }), makePdfFile('report.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), makePdfFile('photo.png', { type: 'image/png' })]);

    expect(fileNames()).toEqual(['typeless.pdf']);
    const hint = container.querySelector(`.${pdfToolStyles['hint-message']}`);
    expect(hint.textContent).toContain('Skipped 2 files');
  });

  it('removes a file and offers Undo, which puts it back at its old position (MERGE-07)', async () => {
    mount();
    await loadFiles(['one.pdf', 'two.pdf', 'three.pdf']);
    await settle();

    const removeBtns = container.querySelectorAll(`.${railStyles['file-remove']}`);
    await act(async () => {
      removeBtns[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(fileNames()).toEqual(['one.pdf', 'three.pdf']);
    const status = container.querySelector(`.${docStyles['undo-chip']}`);
    expect(status.textContent).toContain('Removed two.pdf');

    const undo = status.querySelector('button');
    await act(async () => undo.click());
    expect(fileNames()).toEqual(['one.pdf', 'two.pdf', 'three.pdf']);
    expect(container.querySelector(`.${docStyles['undo-chip']}`)).toBeNull();
    await settle();
    const lastCall = mergeLib.mergePdfs.mock.calls.at(-1);
    expect(lastCall[0].map((f) => f.name)).toEqual(['one.pdf', 'two.pdf', 'three.pdf']);
    expect(lastCall[1].plan.map((p) => p.fileIndex)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('a second undoable action 3s later restarts the 5s window, keeping the chip visible at 6s (wave 3)', async () => {
    mount();
    await loadFiles(['one.pdf', 'two.pdf', 'three.pdf']);
    await settle();

    const removeBtns = () => container.querySelectorAll(`.${railStyles['file-remove']}`);
    const chip = () => container.querySelector(`.${docStyles['undo-chip']}`);

    await act(async () => removeBtns()[1].dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(chip().textContent).toContain('Removed two.pdf');

    await act(async () => { await flush(3000); });
    expect(chip()).not.toBeNull();

    // A second action 3s after the first restarts the window rather than
    // stacking - the chip now names the second removal.
    await act(async () => removeBtns()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(chip().textContent).toContain('Removed one.pdf');

    await act(async () => { await flush(3000); });
    // 6s since the first action, only 3s since the second: were the timer
    // not restarted, the first action's 5s window would already have closed
    // the chip by now.
    expect(chip()).not.toBeNull();
    expect(chip().textContent).toContain('Removed one.pdf');
  }, 15000);

  it('nudges on a duplicate (same name and size) and lets it be added anyway (MERGE-07)', async () => {
    mount();
    await loadFiles(['dup.pdf', 'other.pdf']);
    await loadFiles(['dup.pdf']);

    expect(fileNames()).toEqual(['dup.pdf', 'other.pdf']);
    const status = container.querySelector(`.${pdfToolStyles['hint-message']}`);
    expect(status.textContent).toContain('"dup.pdf" is already in the list');

    await act(async () => {
      status.querySelector('button').click();
      await flush(10);
    });
    expect(fileNames()).toEqual(['dup.pdf', 'other.pdf', 'dup.pdf']);
  });

  it('sorts with one select, Reverse folded in as its own option, and regroups the plan to match', async () => {
    mount();
    await loadFiles(['b.pdf', 'a.pdf', 'c.pdf']);
    const select = container.querySelector(`select.${railStyles['sort-select']}`);
    expect(select).not.toBeNull();

    await act(async () => {
      select.value = 'nameAsc';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(fileNames()).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);

    await act(async () => {
      select.value = 'reversed';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(fileNames()).toEqual(['c.pdf', 'b.pdf', 'a.pdf']);

    await settle();
    const [files, options] = mergeLib.mergePdfs.mock.calls.at(-1);
    expect(files.map((f) => f.name)).toEqual(['c.pdf', 'b.pdf', 'a.pdf']);
    expect(options.plan.map((p) => p.fileIndex)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('remembers Add page numbers on device and applies it on a fresh mount (MERGE-11)', async () => {
    mount();
    await loadFiles(['a.pdf', 'b.pdf']);
    const checkbox = container.querySelector(`.${railStyles['page-numbers-row']} input`);
    expect(checkbox.checked).toBe(false);
    expect(localStorage.getItem('pdf-toolkit:merge:options')).toBeNull();

    await act(async () => {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
    expect(mergeLib.mergePdfs.mock.calls.at(-1)[1].addPageNumbers).toBe(true);
    expect(JSON.parse(localStorage.getItem('pdf-toolkit:merge:options'))).toEqual({ addPageNumbers: true });

    act(() => render(null, container));
    mount();
    await loadFiles(['c.pdf', 'd.pdf']);
    expect(container.querySelector(`.${railStyles['page-numbers-row']} input`).checked).toBe(true);
    // The options row itself stays collapsed until opened.
    expect(container.querySelector(`details.${railStyles.options}`).open).toBe(false);
  });

  it('the phone hand-off row\'s Options button opens the same options panel the desktop summary does (wave 4)', async () => {
    mount();
    await loadFiles(['a.pdf', 'b.pdf']);
    const details = container.querySelector(`details.${railStyles.options}`);
    const phoneToggle = container.querySelector(`.${railStyles['options-toggle']}`);
    expect(details.open).toBe(false);
    expect(phoneToggle.getAttribute('aria-expanded')).toBe('false');

    await act(async () => phoneToggle.click());
    expect(details.open).toBe(true);
    expect(phoneToggle.getAttribute('aria-expanded')).toBe('true');
    // One options-body for both breakpoints: the checkbox row is now open,
    // reachable through either trigger.
    expect(container.querySelector(`.${railStyles['page-numbers-row']}`)).not.toBeNull();

    await act(async () => phoneToggle.click());
    expect(details.open).toBe(false);
    expect(phoneToggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('names an encrypted file, links to Unlock, and merges the rest on the one offered action (MERGE-04)', async () => {
    pageCounts.set('locked.pdf', { pageCount: 1, encrypted: true });
    mount();
    await loadFiles(['a.pdf', 'locked.pdf', 'b.pdf']);
    await settle();

    expect(mergeLib.mergePdfs).not.toHaveBeenCalled();
    const alert = container.querySelector('[role="alert"]');
    expect(alert.textContent).toContain('"locked.pdf" is password-protected');
    expect(alert.querySelector('a').getAttribute('href')).toBe('/unlock/');
    expect(container.querySelector(`.${railStyles['file-row']}[data-error="encrypted"] .${railStyles['file-name']}`).textContent).toBe('locked.pdf');
    expect(downloadBox().getAttribute('data-state')).toBe('error');

    await act(async () => {
      alert.querySelector('button').click();
    });
    await settle();
    expect(fileNames()).toEqual(['a.pdf', 'b.pdf']);
    expect(mergeLib.mergePdfs).toHaveBeenCalledTimes(1);
    expect(mergeLib.mergePdfs.mock.calls[0][0].map((f) => f.name)).toEqual(['a.pdf', 'b.pdf']);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('reports an unreadable file by name when the merge itself rejects it (MERGE-04)', async () => {
    mergeLib.mergePdfs.mockImplementationOnce(() => Promise.reject(new mergeLib.MergeFileError('bad', { fileIndex: 1, reason: 'unreadable' })));
    mount();
    await loadFiles(['a.pdf', 'broken.pdf']);
    await settle();

    const alert = container.querySelector('[role="alert"]');
    expect(alert.textContent).toContain('"broken.pdf" could not be read');
    expect(alert.querySelector('a')).toBeNull();
  });

  it('hands the merged result to Compress without re-picking, keeping the merge draft (MERGE-14)', async () => {
    const navigate = vi.fn();
    mount({ navigate });
    await loadFiles(['a.pdf', 'b.pdf']);
    await settle();

    // Buttons, not links, and no Split: the row is Compress and Sign only.
    expect(container.querySelector('a[href="/compress/"]')).toBeNull();
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent === 'Split it')).toBe(false);
    const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Compress it');
    await act(async () => {
      button.click();
      await flush(10);
    });
    expect(draftStore.saveHandoff).toHaveBeenCalledTimes(1);
    const [tool, record] = draftStore.saveHandoff.mock.calls[0];
    expect(tool).toBe('compress');
    expect(record.fileName).toBe('merged_a.pdf');
    expect(record.fileBytes).toBeInstanceOf(ArrayBuffer);
    expect(draftStore.deleteDraft).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/compress/');
  });

  it('asks before replacing a saved Sign draft on hand-off (MERGE-14)', async () => {
    // Keyed by tool: the draft component also asks the store about 'merge' on mount.
    draftStore.loadDraft.mockImplementation(async (tool) => (tool === 'sign' ? { fileName: 'contract.pdf', fileBytes: new ArrayBuffer(4) } : null));
    const navigate = vi.fn();
    mount({ navigate });
    await loadFiles(['a.pdf', 'b.pdf']);
    await settle();

    const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Sign it');
    await act(async () => {
      button.click();
      await flush(10);
    });
    expect(draftStore.saveHandoff).not.toHaveBeenCalled();
    const dialog = Array.from(container.querySelectorAll('dialog')).find((d) => d.textContent.includes('contract.pdf'));
    expect(dialog).not.toBeUndefined();
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Replace and open');
    await act(async () => {
      confirm.click();
      await flush(10);
    });
    expect(draftStore.deleteDraft).toHaveBeenCalledWith('sign');
    expect(draftStore.saveHandoff.mock.calls[0][0]).toBe('sign');
    expect(navigate).toHaveBeenCalledWith('/sign/');
  });

  it('shows the install line once per browser, after the first result, under the saved state (MERGE-17)', async () => {
    mount();
    await loadFiles(['a.pdf', 'b.pdf']);
    expect(container.querySelector('[data-install-line]')).toBeNull();
    await settle();
    // The install line appears only once the Download element has actually
    // been used (its "saved" state), not merely once it is ready.
    expect(container.querySelector('[data-install-line]')).toBeNull();
    await act(async () => downloadLink().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    const line = container.querySelector('[data-install-line]');
    expect(line).not.toBeNull();
    expect(line.textContent).toContain('works even without a connection');
    expect(localStorage.getItem('pdf-toolkit:merge:first-result-seen')).toBe('1');

    act(() => render(null, container));
    mount();
    await loadFiles(['c.pdf', 'd.pdf']);
    await settle();
    expect(downloadLink()).not.toBeNull();
    expect(container.querySelector('[data-install-line]')).toBeNull();
  });

  it('restores a saved draft into the list, the plan and the options, and clears it on Start again (MERGE-13)', async () => {
    // The picked-up-sentence-to-chip flip below waits out a real 5s timer.
    const clearDraft = vi.fn(async () => true);
    localStorage.setItem('pdf-toolkit:workspace:has-draft:merge', '1');
    document.documentElement.setAttribute('data-draft-hint', '1');
    mount();
    expect(document.documentElement.hasAttribute('data-draft-hint')).toBe(true);
    // The hint alone holds the empty state back before the module has loaded.
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    await act(async () => { await flush(10); });
    expect(draftProbe.props).not.toBeNull();
    await act(async () => {
      draftProbe.props.registerClear(clearDraft);
      draftProbe.props.onStateChange({ isRestoring: false, draftSaveState: 'saved' });
      draftProbe.props.onRestore({
        files: [makePdfFile('x.pdf'), makePdfFile('y.pdf')],
        plan: [
          { key: '0:0', fileId: 0, pageIndex: 0, rotation: 90, skipped: false },
          { key: '1:0', fileId: 1, pageIndex: 0, rotation: 0, skipped: true },
          { key: '0:1', fileId: 0, pageIndex: 1, rotation: 0, skipped: false },
          { key: '1:1', fileId: 1, pageIndex: 1, rotation: 0, skipped: false },
        ],
        options: { addPageNumbers: true },
      });
      await flush(10);
    });
    expect(fileNames()).toEqual(['x.pdf', 'y.pdf']);
    // The pre-paint hint attribute is gone once the check settled, so a later
    // Clear all shows the dropzone instead of a blank card.
    expect(document.documentElement.hasAttribute('data-draft-hint')).toBe(false);
    expect(container.querySelector(`.${railStyles['page-numbers-row']} input`).checked).toBe(true);
    // The restored-draft sentence shows first, for its five seconds; only
    // after that does the small "Draft saved" chip take its place.
    expect(container.textContent).toContain('Picked up where you left off');
    await settle();
    const [files, options] = mergeLib.mergePdfs.mock.calls.at(-1);
    expect(files.map((f) => f.name)).toEqual(['x.pdf', 'y.pdf']);
    expect(options.plan).toEqual([
      { fileIndex: 0, pageIndex: 0, rotation: 90, skipped: false },
      { fileIndex: 1, pageIndex: 0, rotation: 0, skipped: true },
      { fileIndex: 0, pageIndex: 1, rotation: 0, skipped: false },
      { fileIndex: 1, pageIndex: 1, rotation: 0, skipped: false },
    ]);
    expect(options.addPageNumbers).toBe(true);
    // Pages were interleaved across files, so the list shows the rearranged note.
    expect(container.textContent).toContain('Pages were rearranged');

    // After its five seconds the sentence gives way to the small chip for
    // the rest of the session.
    await act(async () => { await flush(5000); });
    expect(container.textContent).not.toContain('Picked up where you left off');
    expect(container.textContent).toContain('Draft saved');

    await act(async () => downloadLink().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    const startAgain = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Start again');
    await act(async () => startAgain.click());
    expect(clearDraft).toHaveBeenCalledTimes(1);
    expect(fileNames()).toEqual([]);
  }, 10000);

  it('attaches a Sortable instance to the rail file list and the phone chip row once files are added', async () => {
    const createSpy = vi.spyOn(Sortable, 'create');
    mount();

    expect(createSpy).not.toHaveBeenCalled();

    await loadFiles(['a.pdf', 'b.pdf']);

    const list = container.querySelector(`ul.${railStyles['file-list']}`);
    const chipRow = container.querySelector(`ul.${docStyles['chip-row']}`);
    expect(list).not.toBeNull();
    expect(chipRow).not.toBeNull();
    expect(createSpy).toHaveBeenCalledTimes(2);
    expect(createSpy).toHaveBeenCalledWith(list, expect.any(Object));
    expect(createSpy).toHaveBeenCalledWith(chipRow, expect.any(Object));
  });
});

import fs from 'fs';
import path from 'path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

describe('merge.js library integration with real fixtures', () => {
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

  it('merges num-1, num-2, num-3, num-4 in order', async () => {
    const { mergePdfs } = await vi.importActual('../lib/merge.js');
    const files = [
      getFixtureFile('num-1.pdf'),
      getFixtureFile('num-2.pdf'),
      getFixtureFile('num-3.pdf'),
      getFixtureFile('num-4.pdf'),
    ];
    const progressCalls = [];
    const mergedBlob = await mergePdfs(files, (p) => progressCalls.push(p));

    expect(mergedBlob).toBeInstanceOf(Blob);
    const texts = await extractTextFromPdfBlob(mergedBlob);
    expect(texts).toEqual(['1', '2', '3', '4']);
    expect(progressCalls).toEqual([0.25, 0.5, 0.75, 1]);
  });

  it('merges in a reordered input to preserve input order, not sorted order', async () => {
    const { mergePdfs } = await vi.importActual('../lib/merge.js');
    const files = [
      getFixtureFile('num-3.pdf'),
      getFixtureFile('num-1.pdf'),
      getFixtureFile('num-4.pdf'),
      getFixtureFile('num-2.pdf'),
    ];
    const mergedBlob = await mergePdfs(files);
    expect(mergedBlob).toBeInstanceOf(Blob);
    const texts = await extractTextFromPdfBlob(mergedBlob);
    expect(texts).toEqual(['3', '1', '4', '2']);
  });
});
