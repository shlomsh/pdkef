// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import Sortable from 'sortablejs';
import PdfMergeTool from './PdfMergeTool.tsx';
import * as mergeLib from './merge.js';
import * as thumbnailsLib from '../../lib/thumbnails.js';
import * as draftStore from '../../lib/drafts/draftStore.js';
import dropzoneStyles from '../../shell/Dropzone.module.css';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import railStyles from './components/MergeRail.module.css';
import docStyles from './components/MergeDocument.module.css';
import downloadStyles from './components/DownloadElement.module.css';
import { mockNativeFileShare } from '../../test/mockFileShare.js';
import { setInputFiles } from '../../test/setInputFiles.js';

function makePdfFile(name, { type = 'application/pdf', size = 8 } = {}) {
  return new File(['%PDF-1.4'.padEnd(size, ' ')], name, { type });
}

// Every fixture "has" two pages unless a test says otherwise, so the plan
// and the identity line have real counts to show.
const pageCounts = new Map();

vi.mock('./merge.js', () => {
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
vi.mock('../../lib/drafts/draftStore.js', () => ({
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
vi.mock('./components/MergeDraftPersistence.tsx', () => ({
  default: (props) => {
    draftProbe.props = props;
    return null;
  },
}));

vi.mock('../../lib/thumbnails.js', () => ({
  renderThumbnail: vi.fn(() => Promise.resolve('data:image/png;base64,mock')),
  renderThumbnailWithMeta: vi.fn(() => Promise.resolve({ dataUrl: 'data:image/png;base64,mock', pageCount: 2, width: 150, height: 194 })),
  renderPdfThumbnails: vi.fn(() => Promise.resolve(0)),
  openThumbnailSource: vi.fn(),
}));

const flush = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

describe('PdfMergeTool UI flow', () => {
  let container;
  let originalCreateObjectURL;
  let originalScrollTo;

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
    // Same reason loadDraft gets reset above: vi.mock factory mocks keep
    // whatever a previous test left them at (restoreAllMocks only touches
    // real spies), and the one test below that needs hasMergeDraftHint() to
    // read true sets it explicitly - every other test needs it back at false.
    draftStore.hasDraftHint.mockReset();
    draftStore.hasDraftHint.mockReturnValue(false);
    originalCreateObjectURL = window.URL.createObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:testurl');
    window.URL.revokeObjectURL = vi.fn();
    originalScrollTo = window.scrollTo;
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    window.URL.createObjectURL = originalCreateObjectURL;
    window.scrollTo = originalScrollTo;
    vi.restoreAllMocks();
    // Safety net: if a fake-timers test above threw before reaching its own
    // vi.useRealTimers(), don't leak the fake clock into the next test.
    vi.useRealTimers();
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

  // Item 5 (Shlomi's follow-up, 2026-09-13): Merge always opts into the
  // desktop-only empty-state band (BasePdfTool's `emptyVariant="band"`); the
  // band's own two lines and the Choose files button are in the markup
  // regardless of viewport (Dropzone.module.css's `[data-variant="band"]`
  // media query is what actually shows them only at 1024px and up).
  it('opts the empty state into the band variant, with its own heading, body and Choose files', () => {
    mount();
    const dropzone = container.querySelector(`.${dropzoneStyles.dropzone}`);
    expect(dropzone.getAttribute('data-variant')).toBe('band');
    expect(dropzone.textContent).toContain('Drop PDFs here, or paste');
    expect(dropzone.textContent).toContain('Your pages appear here, in order, before you download. Files never leave your device.');
    expect(dropzone.textContent).toContain('Choose files');
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

    // Review P1: no dead hand-off row or Options disclosure before there is
    // a merge to hand off - only the Download element's own text-plus-button
    // state, and its "Choose files" button (not a disabled-looking box) is
    // the one way to add a second file from here.
    const buttons = Array.from(container.querySelectorAll('button')).map((b) => b.textContent.trim());
    expect(buttons).not.toContain('Compress it');
    expect(buttons).not.toContain('Sign it');
    expect(buttons).not.toContain('Options');
    expect(container.querySelector(`details.${railStyles.options}`)).toBeNull();
    expect(container.querySelector(`.${railStyles['handoff-row']}`)).toBeNull();

    const chooseButton = Array.from(box.querySelectorAll('button')).find((b) => b.textContent === 'Choose files');
    expect(chooseButton).not.toBeUndefined();
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    await act(async () => chooseButton.click());
    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });

  it('brings back the hand-off row and the page-numbers row once a second file arrives', async () => {
    mount();
    await loadFiles(['one.pdf']);
    expect(container.querySelector(`.${railStyles['handoff-row']}`)).toBeNull();
    expect(container.querySelector(`.${railStyles['page-numbers-row']}`)).toBeNull();

    await loadFiles(['two.pdf']);
    expect(container.querySelector(`.${railStyles['handoff-row']}`)).not.toBeNull();
    // Shlomi (2026-09-13): the Options disclosure is gone - a plain checkbox
    // row directly above Download, no summary to open.
    expect(container.querySelector(`.${railStyles['page-numbers-row']}`)).not.toBeNull();
    const buttons = Array.from(container.querySelectorAll('button')).map((b) => b.textContent.trim());
    expect(buttons).toContain('Compress it');
    expect(buttons).toContain('Sign it');
    expect(buttons).not.toContain('Options');
  });

  // Item 2 (Shlomi's follow-up, 2026-09-13): jsdom cannot measure where an
  // ellipsis actually lands or prove a mixed-direction name renders right to
  // left correctly - this only asserts the two things that make that
  // possible: `dir="auto"` (so the browser picks the name's own direction,
  // not the page's) and the module class carrying `unicode-bidi: plaintext`
  // (so a Hebrew name's own trailing ".pdf" stays at its logical end under
  // ellipsis, rather than the Latin suffix flipping to the visual start).
  it('the rail row\'s file name is bidi plaintext with dir="auto"', async () => {
    mount();
    await loadFiles(['one.pdf']);
    const name = container.querySelector(`.${railStyles['file-row']} .${railStyles['file-name']}`);
    expect(name.getAttribute('dir')).toBe('auto');
    expect(name.className).toContain(railStyles['file-name']);
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

    // The undo window is UNDO_WINDOW_MS (5s) of real product time. Fake
    // timers (enabled only from here, after the setup above has settled on
    // real timers) let the two 3s waits below advance virtual time instead
    // of actually sleeping; the component's own undo-dismiss setTimeout is
    // created by the dispatches below, so it is scheduled under the fake
    // clock and genuinely exercises the restart logic.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    await act(async () => removeBtns()[1].dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(chip().textContent).toContain('Removed two.pdf');

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(chip()).not.toBeNull();

    // A second action 3s after the first restarts the window rather than
    // stacking - the chip now names the second removal.
    await act(async () => removeBtns()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(chip().textContent).toContain('Removed one.pdf');

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    // 6s since the first action, only 3s since the second: were the timer
    // not restarted, the first action's 5s window would already have closed
    // the chip by now.
    expect(chip()).not.toBeNull();
    expect(chip().textContent).toContain('Removed one.pdf');

    vi.useRealTimers();
  });

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

  it('sorts with the styled menu, Reverse folded in as its own option, and regroups the plan to match', async () => {
    mount();
    await loadFiles(['b.pdf', 'a.pdf', 'c.pdf']);
    const trigger = () => container.querySelector(`button.${railStyles['sort-trigger']}`);
    const choose = async (label) => {
      await act(async () => { trigger().click(); });
      const option = Array.from(document.body.querySelectorAll('[role="option"]')).find((item) => item.textContent.trim() === label);
      expect(option).not.toBeUndefined();
      await act(async () => { option.click(); });
    };
    expect(trigger()).not.toBeNull();

    await choose('Name A to Z');
    expect(fileNames()).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);

    await choose('Reversed');
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
  });

  it('shows the Add page numbers checkbox directly in the visible mobile file controls (Options removed, 2026-09-13)', async () => {
    mount();
    await loadFiles(['a.pdf', 'b.pdf']);
    expect(container.querySelectorAll('details')).toHaveLength(0);
    const buttons = Array.from(container.querySelectorAll('button')).map((b) => b.textContent.trim());
    expect(buttons).not.toContain('Options');
    const mobileControls = container.querySelector('[data-merge-file-controls]');
    expect(mobileControls).not.toBeNull();
    // The checkbox row is always in the DOM once there are two files: the
    // exposed mobile copy and the desktop rail's breakpoint-gated copy.
    const rows = container.querySelectorAll(`.${railStyles['page-numbers-row']}`);
    expect(rows.length).toBe(2);
    expect(mobileControls.querySelector(`.${railStyles['page-numbers-row']}`)).not.toBeNull();
  });

  it('exposes mobile file controls in order: Add files, Clear all, Sort, Reset order, Add page numbers', async () => {
    mount();
    await loadFiles(['b.pdf', 'a.pdf']);
    await settle();
    const controls = () => container.querySelector('[data-merge-file-controls]');
    const describe = (el) => {
      if (el.matches(`.${railStyles['sort-select-wrap']}`)) return 'sort';
      if (el.matches(`.${railStyles['rearranged-note']}`)) return 'reset-order';
      if (el.matches(`.${railStyles['page-numbers-row']}`)) return 'page-numbers';
      if (el.tagName === 'BUTTON') return el.textContent.trim();
      return el.textContent.trim();
    };
    expect(Array.from(controls().children).flatMap((el) => el.matches(`.${railStyles['quiet-row']}`)
      ? Array.from(el.children).map(describe)
      : [describe(el)])).toEqual(['Add files', 'Clear all', 'sort', 'page-numbers']);

    // Force the rearranged state (a plan interleaved across files) the same
    // way the draft-restore test above does, rather than fighting a real
    // drag in jsdom.
    await act(async () => {
      draftProbe.props.onRestore({
        files: [makePdfFile('x.pdf'), makePdfFile('y.pdf')],
        plan: [
          { key: '0:0', fileId: 0, pageIndex: 0, rotation: 0, skipped: false },
          { key: '1:0', fileId: 1, pageIndex: 0, rotation: 0, skipped: false },
          { key: '0:1', fileId: 0, pageIndex: 1, rotation: 0, skipped: false },
        ],
        options: { addPageNumbers: false },
        outputName: null,
      });
      await flush(10);
    });
    // Unlike the desktop rail, Sort stays in the mobile controls even once
    // rearranged - it regroups the plan and would itself resolve the
    // rearrangement, same as Reset order (team lead, second follow-up).
    expect(Array.from(controls().children).flatMap((el) => el.matches(`.${railStyles['quiet-row']}`)
      ? Array.from(el.children).map(describe)
      : [describe(el)])).toEqual(['Add files', 'Clear all', 'sort', 'reset-order', 'page-numbers']);
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

  // Both hand-off buttons disable themselves for the navigation they start, so
  // a restored page used to bring them back permanently greyed out
  // (lib/useNavigatingAway.ts).
  it('offers the hand-offs again after a restore, rather than coming back greyed out', async () => {
    const navigate = vi.fn();
    mount({ navigate });
    await loadFiles(['a.pdf', 'b.pdf']);
    await settle();
    const handoff = (label) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label);

    await act(async () => {
      handoff('Compress it').click();
      await flush(10);
    });
    expect(navigate).toHaveBeenCalledWith('/compress/');
    expect(handoff('Sign it').disabled).toBe(true);

    await act(async () => {
      const restore = new Event('pageshow');
      restore.persisted = true;
      window.dispatchEvent(restore);
    });

    expect(handoff('Sign it').disabled).toBe(false);
    await act(async () => {
      handoff('Sign it').click();
      await flush(10);
    });
    expect(navigate).toHaveBeenLastCalledWith('/sign/');
  });

  // MEM-01/02: this used to ask first, and on confirmation call
  // draftStore.deleteDraft('sign') before handing off - see PdfMergeTool.tsx's
  // performHandoff comment for why that was a holdover from the old
  // one-slot-per-tool draft model. Under the entry model, opening the merged
  // output in Sign (useEditorDraftPersistence's beforeRestore -> cacheRecentFile)
  // just moves Sign's pointer to this new entry; whatever Sign was previously
  // pointed at, and its work, is untouched - there is nothing left to confirm
  // or to discard, so the hand-off now goes straight through, exactly like the
  // Compress case above.
  it('hands the merged result to Sign without asking, even when Sign already has a draft of its own (MEM-01/02)', async () => {
    // Still returns a 'sign' record so this test would catch a regression
    // that brings the old ask-first check back; performHandoff no longer
    // calls loadDraft('sign') at all, so this is never actually read.
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
    expect(draftStore.saveHandoff).toHaveBeenCalledTimes(1);
    expect(draftStore.saveHandoff.mock.calls[0][0]).toBe('sign');
    // Sign's existing entry (and its work) is never touched by this hand-off.
    expect(draftStore.deleteDraft).not.toHaveBeenCalled();
    expect(Array.from(container.querySelectorAll('dialog')).find((d) => d.textContent.includes('contract.pdf'))).toBeUndefined();
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

  it('says "Draft not saved" when the draft could not be written, for instance a set over MERGE_DRAFT_MAX_BYTES (MERGE-20)', async () => {
    // draftStore refuses a multi-file draft over its byte cap by resolving
    // false (draftStore.test.js) and the hook turns that into 'error'
    // (useMergeDraft.test.tsx); this is the last link, the island showing a
    // state for it instead of silently not saving.
    mount();
    await loadFiles(['a.pdf', 'b.pdf']);
    await settle();
    await act(async () => {
      draftProbe.props.onStateChange({ isRestoring: false, draftSaveState: 'error' });
      await flush(10);
    });
    const statusRow = container.querySelector(`.${railStyles['draft-status-row']}`);
    expect(statusRow).not.toBeNull();
    expect(statusRow.textContent).toBe('Draft not saved');
    expect(container.textContent).not.toContain('Draft saved');
  });

  it('restores a saved draft into the list, the plan and the options, and clears it on Start again (MERGE-13)', async () => {
    // The picked-up-sentence-to-chip flip below advances virtual time via
    // fake timers instead of waiting out a real 5s timer.
    const clearDraft = vi.fn(async () => true);
    // MEM-01: hasMergeDraftHint() now goes through draftStore's own
    // hasDraftHint (a pointer + recency-index check) instead of reading a
    // localStorage key directly, so the mocked module is what needs to say
    // "yes, there's something to check" here.
    draftStore.hasDraftHint.mockReturnValue(true);
    document.documentElement.setAttribute('data-draft-hint', '1');
    mount();
    expect(document.documentElement.hasAttribute('data-draft-hint')).toBe(true);
    // The hint alone holds the empty state back before the module has loaded.
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    await act(async () => { await flush(10); });
    expect(draftProbe.props).not.toBeNull();

    // Fake timers from here on: the onRestore call below is what starts the
    // component's own 5s "picked up" -> chip setTimeout, so it must already
    // be running under the fake clock for the advance further down to move
    // it. The pre-merge debounce that fires during this window is also
    // driven by advancing virtual time (in place of settle()'s real flush).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
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
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(fileNames()).toEqual(['x.pdf', 'y.pdf']);
    // The pre-paint hint attribute is gone once the check settled, so a later
    // Clear all shows the dropzone instead of a blank card.
    expect(document.documentElement.hasAttribute('data-draft-hint')).toBe(false);
    expect(container.querySelector(`.${railStyles['page-numbers-row']} input`).checked).toBe(true);
    // The restored-draft sentence shows first, for its five seconds; only
    // after that does the small "Draft saved" chip take its place.
    expect(container.textContent).toContain('Picked up where you left off');
    // Equivalent to settle() (pre-merge debounce + merge), advanced virtually.
    await act(async () => { await vi.advanceTimersByTimeAsync(30); });
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
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
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    vi.useRealTimers();
    expect(container.textContent).not.toContain('Picked up where you left off');
    expect(container.textContent).toContain('Draft saved');

    await act(async () => downloadLink().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    const startAgain = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Start again');
    await act(async () => startAgain.click());
    expect(clearDraft).toHaveBeenCalledTimes(1);
    expect(fileNames()).toEqual([]);
  });

  it('keeps visible mobile controls outside the sortable chip list', async () => {
    mount();
    await loadFiles(['a.pdf', 'b.pdf']);
    const chipRow = container.querySelector(`ul.${docStyles['chip-row']}`);
    const controls = container.querySelector('[data-merge-file-controls]');
    expect(chipRow).not.toBeNull();
    expect(controls).not.toBeNull();
    expect(chipRow.contains(controls)).toBe(false);
    expect(chipRow.querySelector('button, select, input')).toBeNull();
  });

  // Review P2, item 3: "Picked up where you left off · Start fresh" lived
  // only in the rail, which is CSS-hidden below 768px, so it never reached a
  // phone. The document header's right slot (where the Undo chip also
  // lives) now carries the same sentence for that placement.
  it('shows the restored-draft sentence in the document header, for phones (MERGE-13)', async () => {
    const clearDraft = vi.fn(async () => true);
    mount();
    await act(async () => { await flush(10); });
    expect(draftProbe.props).not.toBeNull();
    await act(async () => {
      draftProbe.props.registerClear(clearDraft);
      draftProbe.props.onStateChange({ isRestoring: false, draftSaveState: 'saved' });
      draftProbe.props.onRestore({
        files: [makePdfFile('x.pdf'), makePdfFile('y.pdf')],
        plan: [
          { key: '0:0', fileId: 0, pageIndex: 0, rotation: 0, skipped: false },
          { key: '1:0', fileId: 1, pageIndex: 0, rotation: 0, skipped: false },
        ],
        options: { addPageNumbers: false },
      });
      await flush(10);
    });

    const headerChip = container.querySelector(`.${docStyles['doc-header-right']} .${docStyles['header-draft-chip']}`);
    expect(headerChip).not.toBeNull();
    expect(headerChip.textContent).toContain('Picked up where you left off');
    const startFresh = Array.from(headerChip.querySelectorAll('button')).find((b) => b.textContent === 'Start fresh');
    expect(startFresh).not.toBeUndefined();
  });

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
    expect(createSpy).toHaveBeenCalledWith(chipRow, expect.objectContaining({
      draggable: `.${docStyles.chip}`,
      delay: 100,
      delayOnTouchOnly: true,
      touchStartThreshold: 10,
    }));
  });

  it('keeps whole-file drag enabled after pages are rearranged and regroups on drop', async () => {
    const createSpy = vi.spyOn(Sortable, 'create');
    mount();
    await loadFiles(['a.pdf', 'b.pdf']);

    const list = container.querySelector(`ul.${railStyles['file-list']}`);
    const railCallIndex = createSpy.mock.calls.findIndex(([element]) => element === list);
    const railOptions = createSpy.mock.calls[railCallIndex][1];
    const railSortable = createSpy.mock.results[railCallIndex].value;

    await act(async () => {
      draftProbe.props.onRestore({
        files: [makePdfFile('x.pdf'), makePdfFile('y.pdf')],
        plan: [
          { key: '0:0', fileId: 0, pageIndex: 0, rotation: 0, skipped: false },
          { key: '1:0', fileId: 1, pageIndex: 0, rotation: 0, skipped: false },
          { key: '0:1', fileId: 0, pageIndex: 1, rotation: 0, skipped: false },
        ],
        options: { addPageNumbers: false },
        outputName: null,
      });
      await flush(10);
    });

    expect(container.textContent).toContain('Pages were rearranged');
    expect(container.querySelectorAll(`.${railStyles.grip}`)).toHaveLength(2);
    expect(railSortable.option('disabled')).toBe(false);

    await act(async () => {
      railOptions.onEnd({ oldIndex: 0, newIndex: 1 });
      await flush(0);
    });
    expect(fileNames()).toEqual(['y.pdf', 'x.pdf']);
    expect(container.textContent).not.toContain('Pages were rearranged');
  });

  // MERGE-11 (2026-09-13, Shlomi's WYSIWYG rebuild): the document heading's
  // name IS the editable output file name now - one contenteditable span,
  // never a button swapped for an input. `type()` stands in for real typing:
  // jsdom does not synthesize keyboard input into a contenteditable region,
  // so tests set `textContent` directly (as a person's keystrokes would
  // leave it) rather than dispatching an `input` event nothing here listens
  // for.
  describe('renaming the output file name', () => {
    const nameEl = () => container.querySelector(`.${docStyles.name}`);
    const beginEdit = async () => {
      await act(async () => {
        nameEl().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      });
    };
    const type = async (text) => {
      await act(async () => { nameEl().textContent = text; });
    };
    const pressEnter = async () => {
      await act(async () => {
        nameEl().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      });
    };
    const pressEscape = async () => {
      await act(async () => {
        nameEl().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      });
    };

    it('click to rename; Enter commits, and the download attribute and PDF Title follow it, with zero layout chrome added', async () => {
      mount();
      await loadFiles(['Invoice 2024-03-01.pdf', 'doc2.pdf']);
      await settle();

      expect(nameEl().textContent).toBe('merged_Invoice 2024-03-01');
      expect(nameEl().getAttribute('contenteditable')).toBe('false');

      await beginEdit();
      expect(nameEl().getAttribute('contenteditable')).not.toBe('false');
      expect(nameEl().getAttribute('role')).toBe('textbox');
      // No border/background/input chrome ever appears - the name is one
      // element throughout, so there is nothing to swap in or out.
      expect(container.querySelector(`.${docStyles['name-input']}`)).toBeNull();
      expect(container.querySelector(`.${docStyles['name-button']}`)).toBeNull();

      await type('March invoices');
      await pressEnter();
      await settle();

      expect(nameEl().textContent).toBe('March invoices');
      expect(nameEl().getAttribute('contenteditable')).toBe('false');
      expect(container.querySelector(`.${docStyles['doc-heading-ext']}`).textContent).toBe('.pdf');
      const link = downloadLink();
      expect(link.getAttribute('download')).toBe('March invoices.pdf');
      const [, options] = mergeLib.mergePdfs.mock.calls.at(-1);
      expect(options.title).toBe('March invoices');
    });

    it('Escape cancels the rename, restoring the previous text and leaving edit mode', async () => {
      mount();
      await loadFiles(['a.pdf', 'b.pdf']);
      await settle();
      const original = nameEl().textContent;

      await beginEdit();
      await type('Something else entirely');
      await pressEscape();

      expect(nameEl().getAttribute('contenteditable')).toBe('false');
      expect(nameEl().textContent).toBe(original);
    });

    it('an empty (or all-sanitised-away) name reverts to the automatic one', async () => {
      mount();
      await loadFiles(['a.pdf', 'b.pdf']);
      await settle();
      const original = nameEl().textContent;

      await beginEdit();
      await type('   ');
      await act(async () => { nameEl().blur(); });

      expect(nameEl().textContent).toBe(original);
    });

    it('sanitises on commit: strips path separators and control characters, trims, and caps at 120 characters', async () => {
      mount();
      await loadFiles(['a.pdf', 'b.pdf']);
      await settle();

      await beginEdit();
      await type('  ../evil\\name  ' + 'x'.repeat(200));
      await act(async () => { nameEl().blur(); });

      const committed = nameEl().textContent;
      expect(committed).not.toContain('/');
      expect(committed).not.toContain('\\');
      expect(committed.startsWith('..evilname')).toBe(true);
      expect(Array.from(committed)).toHaveLength(120);
    });

    it('once edited, the name survives adding, removing and reordering files, and Clear all resets it', async () => {
      mount();
      await loadFiles(['a.pdf', 'b.pdf']);
      await settle();

      await beginEdit();
      await type('My renamed merge');
      // blur in its own act(): dispatching it in the same tick as the text
      // change would read the pre-update DOM from onBlur's stale closure,
      // which no real typing-then-tabbing-away sequence can actually produce.
      await act(async () => { nameEl().blur(); });
      expect(nameEl().textContent).toBe('My renamed merge');

      // Adding a file would normally change the automatic "merged_<first>"
      // name; the edited one does not move.
      await loadFiles(['c.pdf']);
      expect(nameEl().textContent).toBe('My renamed merge');

      // Nor does removing one.
      const removeButtons = Array.from(container.querySelectorAll(`.${railStyles['file-remove']}`));
      await act(async () => removeButtons[0].click());
      expect(nameEl().textContent).toBe('My renamed merge');

      // Clear all resets it - the next set of files gets the automatic name.
      // The trigger opens a confirm dialog first (BasePdfTool's requestClear);
      // both it and the dialog's own confirm button read "Clear all", so the
      // second match once the dialog is open is the one to click.
      const clearTrigger = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Clear all');
      await act(async () => clearTrigger.click());
      const clearButtons = Array.from(container.querySelectorAll('button')).filter((b) => b.textContent.trim() === 'Clear all');
      await act(async () => clearButtons.at(-1).click());
      await loadFiles(['fresh.pdf', 'other.pdf']);
      await settle();
      expect(nameEl().textContent).toBe('merged_fresh');
    });

    it('passes the edited name down for draft persistence, and restores it as the customised name', async () => {
      mount();
      await loadFiles(['a.pdf', 'b.pdf']);
      await settle();
      expect(draftProbe.props.outputName).toBeNull();

      await beginEdit();
      await type('Persisted name');
      await act(async () => { nameEl().blur(); });
      expect(draftProbe.props.outputName).toBe('Persisted name');

      // A restore that carries an outputName brings the renamed heading back,
      // and it is still "theirs" (a later file add does not regenerate it).
      await act(async () => {
        draftProbe.props.onRestore({
          files: [makePdfFile('x.pdf'), makePdfFile('y.pdf')],
          plan: [
            { key: '0:0', fileId: 0, pageIndex: 0, rotation: 0, skipped: false },
            { key: '1:0', fileId: 1, pageIndex: 0, rotation: 0, skipped: false },
          ],
          options: { addPageNumbers: false },
          outputName: 'Restored name',
        });
        await flush(10);
      });
      expect(nameEl().textContent).toBe('Restored name');
    });
  });
});

import fs from 'fs';
import path from 'path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

describe('merge.js library integration with real fixtures', () => {
  function getFixtureFile(name) {
    const filePath = path.resolve(__dirname, '../../lib/__fixtures__', name);
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
    const { mergePdfs } = await vi.importActual('./merge.js');
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
    const { mergePdfs } = await vi.importActual('./merge.js');
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
