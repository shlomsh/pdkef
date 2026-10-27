// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import fs from 'fs';
import path from 'path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import Sortable from 'sortablejs';
import PdfMergeTool from './PdfMergeTool.tsx';
import { mergePdfs } from './lib/merge.js';
import * as mergeLib from './lib/merge.js';
import { MERGE_DRAFT_SCHEMA_VERSION } from './hooks/useMergeDraft.ts';
import { saveDraft, saveHandoff } from '../../lib/drafts/draftStore.ts';
import { getPdfLib } from '../../lib/pdfLib.js';
import dropzoneStyles from '../../shell/Dropzone.module.css';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import railStyles from './components/MergeRail.module.css';
import sortMenuStyles from '../../shell/SortMenu.module.css';
import docStyles from './components/MergeDocument.module.css';
import outputNameStyles from '../../shell/OutputName.module.css';
import downloadStyles from '../../shell/DownloadElement.module.css';
import { workspaceStyles } from '../../shell/pageWorkspace/PageWorkspace.tsx';
import { mockNativeFileShare } from '../../test/support/mockFileShare.js';
import { buildPdf, noPagesKey } from '../../test/support/pdfPageTreeFixtures.ts';
import { installToolHarness, type ToolHarness } from '../../test/harness/toolHarness.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { until } from '../../test/support/until.js';
import { waitUntil } from '../../test/harness/waitUntil.ts';
import { hebrewMergeMessages } from './messages';
import { hebrewShellMessages } from '../../shell/shellMessages';
import { recentActions } from '../../lib/actionTrail.ts';

// The pdf.js edge (the encryption probe, the thumbnail source) is the harness's: harness.pdfjs. Everything else
// (analytics, error reports, draftStore, the merge itself, the draft hook, the hand-off intake) runs for
// real over it.

/* The fixtures are real files. Every page of every fixture PDF is told apart by its MediaBox: the
   width names the file (a registry, reset per test) and the height the page number in it, so a merged
   output read back with pdf-lib says which page came from where. A test steers a fixture's shape
   through `pageCounts` below. */
const FIXTURES = path.resolve(__dirname, '../../lib/__fixtures__');
const readFixture = (...parts) => new Uint8Array(fs.readFileSync(path.join(FIXTURES, ...parts)));
const JPEG_BYTES = readFixture('photo-1.jpg');
const PNG_BYTES = readFixture('photo-2.png');
const OWNER_ONLY_BYTES = readFixture('encrypted', 'owner-only.pdf');

const widthOf = new Map();
const widthFor = (name) => {
  if (!widthOf.has(name)) widthOf.set(name, 100 + 10 * widthOf.size);
  return widthOf.get(name);
};
const labelOfWidth = (width) => {
  const found = [...widthOf].find(([, w]) => w === width);
  return found ? found[0].replace('.pdf', '') : `?${width}`;
};

function pagesPdf(name, count) {
  const width = widthFor(name);
  const kids = Array.from({ length: count }, (_, i) => `${i + 3} 0 R`).join(' ');
  const objs = {
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    2: `<< /Type /Pages /Kids [${kids}] /Count ${count} >>`,
  };
  for (let i = 0; i < count; i += 1) objs[i + 3] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${300 + 10 * i}] >>`;
  return buildPdf(objs);
}

// Every fixture "has" two pages unless a test says otherwise, so the plan
// and the identity line have real counts to show. A spec can also make the
// file protected (`encrypted`), garbage that pdf-lib cannot parse (`unreadable`),
// or a PDF whose page list is lost, which only fails once its pages are counted (`crash`).
const pageCounts = new Map();

function fixtureBytes(name) {
  const spec = pageCounts.get(name) ?? {};
  if (/\.jpe?g$/i.test(name)) return JPEG_BYTES;
  if (/\.png$/i.test(name)) return PNG_BYTES;
  if (spec.encrypted) return OWNER_ONLY_BYTES;
  if (spec.unreadable) return new TextEncoder().encode('%PDF-1.4 this is not a PDF');
  if (spec.crash) return noPagesKey();
  return pagesPdf(name, spec.pageCount ?? 2);
}

function makePdfFile(name, { type = 'application/pdf' } = {}) {
  return new File([fixtureBytes(name)], name, { type });
}

/* Steers when a File gives up its bytes, so a test can hold one stage of the real pipeline open.
   Merge reads a file once to inspect it and once to merge it: `holdFrom(1)` lets the inspection through
   and blocks the merge's read until `release()`, `failFrom(1)` rejects it. Without a number the
   first read still to come is the one. */
function controlReads(file) {
  const real = file.arrayBuffer.bind(file);
  let reads = 0;
  let holdAt = Infinity;
  let failAt = Infinity;
  let blocked = false;
  let release = () => {};
  const gate = new Promise((resolve) => { release = resolve; });
  file.arrayBuffer = async () => {
    const nth = reads;
    reads += 1;
    if (nth >= failAt) throw new Error('could not read');
    if (nth >= holdAt) { blocked = true; await gate; }
    return real();
  };
  return {
    holdFrom(nth = reads) { holdAt = nth; },
    failFrom(nth = reads) { failAt = nth; },
    release() { holdAt = Infinity; release(); },
    isBlocked: () => blocked,
  };
}

const bufferOf = (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

// The real draft store, holding Merge's multi-file draft the way an earlier visit left it.
async function seedMergeDraft(names, { plan, options = { addPageNumbers: false }, outputName = null, title } = {}) {
  const files = names.map((fileName) => ({ fileName, fileType: 'application/pdf', fileBytes: bufferOf(fixtureBytes(fileName)) }));
  const entries = plan ?? names.flatMap((_, i) => [0, 1].map((p) => ({ key: `${i}:${p}`, fileId: i, pageIndex: p, rotation: 0, skipped: false })));
  const saved = await saveDraft('merge', {
    files,
    plan: entries,
    options,
    fileName: title ?? `merged_${names[0].replace('.pdf', '')}`,
    outputName,
    pageCount: entries.filter((e) => !e.skipped).length,
    fileCount: names.length,
    schemaVersion: MERGE_DRAFT_SCHEMA_VERSION,
  });
  expect(saved).toBe(true);
}

const handoffOf = (...names) => ({
  files: names.map((fileName) => ({
    fileName,
    fileType: /\.jpe?g$/i.test(fileName) ? 'image/jpeg' : 'application/pdf',
    fileBytes: bufferOf(fixtureBytes(fileName)),
  })),
});

// A merged output read back with pdf-lib: one `name:page:rotation` per page, and the document title.
async function readOutput(blob) {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.load(await blob.arrayBuffer());
  const pages = doc.getPages().map((page) => `${labelOfWidth(page.getSize().width)}:${(page.getSize().height - 300) / 10}:${page.getRotation().angle}`);
  return { pages, title: doc.getTitle() };
}

// What each output page says in text: only the stamped page numbers are text in these fixtures.
async function pageTexts(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false });
  const pdf = await loadingTask.promise;
  const texts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    texts.push(textContent.items.map((item) => item.str).join('').trim());
  }
  await loadingTask.destroy();
  return texts;
}

// Tests that are not about timing build after 5ms instead of the real 1500ms.
const FAST_QUIET = { baseMs: 5, stepMs: 0, maxMs: 5, burstWindowMs: 1 };
const flush = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

describe('PdfMergeTool UI flow', () => {
  let container;
  let harness: ToolHarness;
  let originalScrollTo;

  beforeEach(() => {
    harness = installToolHarness();
    pageCounts.clear();
    widthOf.clear();
    originalScrollTo = window.scrollTo;
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    window.scrollTo = originalScrollTo;
    harness.restore();
    vi.restoreAllMocks();
    // Safety net: if a fake-timers test above threw before reaching its own
    // vi.useRealTimers(), don't leak the fake clock into the next test.
    vi.useRealTimers();
  });

  function mount(props = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfMergeTool quietPolicy={FAST_QUIET} {...props} />, container);
    });
  }

  // Every row has been read: a page count, or the lock or error it turned out to carry.
  const rowsRead = () => Array.from(container.querySelectorAll(`.${railStyles['file-row']}`)).every((row) => (
    row.hasAttribute('data-error') || row.hasAttribute('data-locked') || !row.querySelector(`.${railStyles['file-pages']}`).textContent.includes('\u2026')
  ));

  async function loadFiles(files, { wait = true } = {}) {
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      setInputFiles(input, files.map((f) => (typeof f === 'string' ? makePdfFile(f) : f)));
      await flush(10);
    });
    if (wait) await until(rowsRead); // inspection is real work now
  }

  // Waits out the pre-merge debounce (5ms in tests) and the merge itself: until the Download element
  // is ready with its link, or has settled into a state with nothing to build.
  async function settle() {
    await act(async () => {
      await flush(30);
    });
    await until(() => {
      const box = downloadBox();
      if (!box) return true;
      const state = box.getAttribute('data-state');
      return box.hasAttribute('href') || (state !== 'ready' && state !== 'preparing');
    });
  }

  const fileNames = () => Array.from(container.querySelectorAll(`.${railStyles['file-name']}`)).map((el) => el.textContent);
  const undoButton = () => container.querySelector('button[aria-label="Undo last change"]');
  const redoButton = () => container.querySelector('button[aria-label="Redo last undone change"]');
  const downloadBox = () => container.querySelector(`.${downloadStyles.box}`);
  // A real download only exists once the Download element carries an href
  // (state 'ready' or 'saved'); every other state is a plain trigger.
  const downloadLink = () => container.querySelector(`.${downloadStyles.box}[href]`);
  // The merged file the Download link points at, read back through the real object URL.
  const outputOfLink = () => readOutput(harness.blobForUrl(downloadLink().getAttribute('href')));

  // The page plan as the grid shows it: `name:page:rotation:skipped` per cell, in order.
  const cells = () => Array.from(container.querySelectorAll('ul[data-page-grid] > li[data-key]'));
  const planOf = () => {
    const names = new Map(Array.from(container.querySelectorAll(`.${railStyles['file-row']}`))
      .map((row) => [row.getAttribute('data-file-id'), row.querySelector(`.${railStyles['file-name']}`).textContent]));
    return cells().map((cell) => `${names.get(cell.getAttribute('data-file-id')).replace('.pdf', '')}:${cell.getAttribute('data-key').split(':')[1]}:${cell.getAttribute('data-rotation') ?? 0}:${cell.hasAttribute('data-skipped') ? 's' : '-'}`);
  };
  const clearAll = async () => {
    const clearTrigger = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Clear all files');
    await act(async () => clearTrigger.click());
    const clearButtons = Array.from(container.querySelectorAll('button')).filter((b) => b.textContent.trim() === 'Clear all');
    await act(async () => clearButtons.at(-1).click());
  };
  // Resolves once the real autosave has written a draft (the rail says so).
  const draftSaved = () => until(() => container.textContent.includes('Draft saved'));
  // Waits on an async read, for example the stored draft.
  const untilAsync = async (read, timeout = 8000) => {
    const start = Date.now();
    for (;;) {
      const value = await read();
      if (value) return value;
      if (Date.now() - start > timeout) throw new Error('condition not met');
      await act(async () => { await flush(20); });
    }
  };

  it('renders the initial file dropper zone', () => {
    mount();
    const dropzone = container.querySelector(`.${dropzoneStyles.dropzone}`);
    expect(dropzone).not.toBeNull();
    expect(dropzone.textContent).toContain('Drop PDFs or photos here');
  });

  // Merge's empty-state sheet carries its own heading and body line (BasePdfTool's
  // `emptyHeading` / `emptyBody`) beside the Choose files button.
  it('shows the empty-state sheet with its own heading, body and Choose files', () => {
    mount();
    const dropzone = container.querySelector(`.${dropzoneStyles.dropzone}`);
    // Desktop heading and the phone heading (t.dropHere) are both in the markup; CSS shows one.
    const spans = [...dropzone.querySelectorAll('strong > span')].map((n) => n.textContent);
    expect(spans).toEqual(['Drop PDFs or photos here', 'Drop PDFs or photos here, or paste']);
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
    expect(box.textContent).toContain('Add one more file to merge');
    expect(downloadLink()).toBeNull();
    expect(harness.createdBlobs()).toHaveLength(0);

    // Review P1: no dead hand-off row or Options disclosure before there is
    // a merge to hand off - only the Download element's own text-plus-button
    // state, and its "Choose files" button (not a disabled-looking box) is
    // the one way to add a second file from here.
    const buttons = Array.from(container.querySelectorAll('button')).map((b) => b.textContent.trim());
    expect(buttons).not.toContain('Compress');
    expect(buttons).not.toContain('Sign');
    expect(buttons).not.toContain('Options');
    expect(container.querySelector(`details.${railStyles.options}`)).toBeNull();
    expect(container.querySelector(`.${workspaceStyles['handoff-row']}`)).toBeNull();

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
    expect(container.querySelector(`.${workspaceStyles['handoff-row']}`)).toBeNull();
    expect(container.querySelector(`.${workspaceStyles['page-numbers-row']}`)).toBeNull();

    await loadFiles(['two.pdf']);
    expect(container.querySelector(`.${workspaceStyles['handoff-row']}`)).not.toBeNull();
    // Shlomi (2026-09-13): the Options disclosure is gone - a plain checkbox
    // row directly above Download, no summary to open.
    expect(container.querySelector(`.${workspaceStyles['page-numbers-row']}`)).not.toBeNull();
    const buttons = Array.from(container.querySelectorAll('button')).map((b) => b.textContent.trim());
    expect(buttons).toContain('Compress');
    expect(buttons).toContain('Sign');
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

    // Before the quiet wait ends the Download element already keeps its ready
    // look (no link yet), never a separate Merge step.
    const box = downloadBox();
    expect(box).not.toBeNull();
    expect(box.getAttribute('data-state')).toBe('ready');
    expect(box.hasAttribute('href')).toBe(false);
    expect(container.textContent).not.toContain('Merge 2 PDFs');

    await settle();

    expect(harness.createdBlobs()).toHaveLength(1);
    const output = await outputOfLink();
    expect(output.title).toBe('merged_Invoice 2024-03-01');
    expect(output.pages).toEqual(['Invoice 2024-03-01:0:0', 'Invoice 2024-03-01:1:0', 'doc2:0:0', 'doc2:1:0']);

    const link = downloadLink();
    expect(link).not.toBeNull();
    expect(link.getAttribute('data-state')).toBe('ready');
    expect(harness.blobForUrl(link.getAttribute('href'))).toBe(harness.createdBlobs()[0]);
    expect(link.getAttribute('download')).toBe('merged_Invoice 2024-03-01.pdf');
    expect(link.textContent).toContain('4 pages');
    // Exactly one Download element, same node throughout: no separate
    // "Merge" control ever appears.
    expect(container.querySelectorAll(`.${downloadStyles.box}`)).toHaveLength(1);

    // The document heading carries the total page count once every file is read.
    expect(container.querySelector(`.${workspaceStyles['doc-heading']}`).textContent).toContain('4 pages');

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
    // drive PageGrid's render queue to completion to prove the quieter
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
    harness.pdfjs.thumbnails.openThumbnailSource.mockImplementation(async () => ({
      render: async () => 'data:image/png;base64,x',
      destroy: async () => {},
    }));

    mount();
    await loadFiles(['a.pdf', 'b.pdf']);
    // The grid (PageGrid) itself arrives through a dynamic import(); give
    // it a beat to mount and start observing before the IntersectionObserver
    // instance it creates is read below.
    await waitUntil(() => expect(instances.at(-1)?.targets.size).toBeGreaterThan(0));
    // Four pages total (two files, two pages each); rendering has not
    // started yet, so the heading names the total and says none are done.
    const heading = () => container.querySelector(`.${workspaceStyles['doc-heading']}`);
    expect(heading().textContent).toContain('4 pages');
    expect(heading().textContent).toContain('0 rendered');

    // Drive every observed cell "into view" and let the queue drain.
    const io = instances.at(-1);
    await act(async () => {
      io.callback(Array.from(io.targets).map((target) => ({ target, isIntersecting: true })));
    });
    await waitUntil(() => expect(heading().textContent).not.toContain('rendered'));

    globalThis.IntersectionObserver = originalIO;
  });

  it('a tap while the pre-merge is still running shows progress and delivers the file when it lands (MERGE-12)', async () => {
    // The merge reads each file once more after its inspection: hold that read open, so the build is in flight.
    const a = makePdfFile('a.pdf');
    const reads = controlReads(a);
    reads.holdFrom(1);
    mount();
    await loadFiles([a, 'b.pdf']);
    await until(reads.isBlocked);

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

    await act(async () => { reads.release(); });
    await until(() => downloadLink() !== null);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect((await outputOfLink()).pages).toHaveLength(4);
    expect(container.textContent).toContain('Start again');
    clickSpy.mockRestore();
  });

  it('any change to the list cancels the pending pre-merge and starts a new one', async () => {
    // The first build is held in flight when the list changes, so the abort is what has to stop it.
    const mergeSpy = vi.spyOn(mergeLib, 'mergePdfs');
    const a = makePdfFile('a.pdf');
    const reads = controlReads(a);
    reads.holdFrom(1);
    mount();
    await loadFiles([a, 'b.pdf']);
    await until(reads.isBlocked);
    expect(mergeSpy).toHaveBeenCalledTimes(1);
    const firstSignal = mergeSpy.mock.calls[0][3] as AbortSignal;
    expect(firstSignal).toBeInstanceOf(AbortSignal);
    expect(firstSignal.aborted).toBe(false);

    await loadFiles(['c.pdf']);
    // The build for the old order was told to stop.
    expect(firstSignal.aborted).toBe(true);
    // Nothing is on offer for the old order while the new one is still to come.
    expect(downloadLink()).toBeNull();
    await act(async () => { reads.release(); });
    await settle();
    // Only the build for the new list landed: the held one was cancelled and never produced a file.
    expect(harness.createdBlobs()).toHaveLength(1);
    expect((await outputOfLink()).pages).toEqual(['a:0:0', 'a:1:0', 'b:0:0', 'b:1:0', 'c:0:0', 'c:1:0']);
    expect(downloadLink().getAttribute('download')).toBe('merged_a.pdf');
  });

  it('a thumbnail that arrives after the pre-merge started does not restart it', async () => {
    harness.pdfjs.thumbnails.renderThumbnail.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve('data:image/png;base64,late'), 25)),
    );
    mount();
    await loadFiles(['a.pdf', 'b.pdf']);
    await settle();
    expect(harness.createdBlobs()).toHaveLength(1);
    await act(async () => { await flush(60); });
    // The late thumbnail resolves (renderThumbnail is used for the rail's
    // internal entry state) without ever restarting the pre-merge.
    expect(harness.createdBlobs()).toHaveLength(1);
    expect(downloadLink()).not.toBeNull();
  });

  it('accepts a .pdf and photos with an empty MIME type and still skips a real non-photo (MERGE-02, MERGE-22)', async () => {
    mount();
    await loadFiles([
      makePdfFile('typeless.pdf', { type: '' }),
      makePdfFile('report.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      makePdfFile('photo.png', { type: 'image/png' }),
      makePdfFile('scan.jpg', { type: '' }),
      makePdfFile('notes.txt', { type: 'text/plain' }),
    ]);

    expect(fileNames()).toEqual(['typeless.pdf', 'photo.png', 'scan.jpg']);
    const hint = container.querySelector(`.${pdfToolStyles['hint-message']}`);
    expect(hint.textContent).toContain('Skipped 2 files');
  });

  it('takes a mixed pick in pick order and gives each photo one plan page (MERGE-22)', async () => {
    pageCounts.set('b.pdf', { pageCount: 3 });
    mount();
    await loadFiles([
      makePdfFile('a.pdf'),
      makePdfFile('shot.jpg', { type: 'image/jpeg' }),
      makePdfFile('b.pdf'),
      makePdfFile('pic.png', { type: 'image/png' }),
    ]);
    await settle();
    expect(fileNames()).toEqual(['a.pdf', 'shot.jpg', 'b.pdf', 'pic.png']);
    await until(() => cells().length === 7);
    expect(planOf()).toEqual(['a:0:0:-', 'a:1:0:-', 'shot.jpg:0:0:-', 'b:0:0:-', 'b:1:0:-', 'b:2:0:-', 'pic.png:0:0:-']);
    expect((await outputOfLink()).pages).toHaveLength(7);
  });

  it('lets the file picker choose JPEG and PNG photos beside PDFs (MERGE-22)', () => {
    mount();
    const accept = container.querySelector('input[type="file"]').getAttribute('accept');
    expect(accept).toContain('application/pdf');
    expect(accept).toContain('image/jpeg');
    expect(accept).toContain('image/png');
  });

  it('removes a file and Undo puts it back at its old position, Redo removes it again (MERGE-07)', async () => {
    mount();
    await loadFiles(['one.pdf', 'two.pdf', 'three.pdf']);
    await settle();
    expect(undoButton().disabled).toBe(true);

    const removeBtns = container.querySelectorAll(`.${railStyles['file-remove']}`);
    await act(async () => {
      removeBtns[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(fileNames()).toEqual(['one.pdf', 'three.pdf']);

    await act(async () => undoButton().click());
    expect(fileNames()).toEqual(['one.pdf', 'two.pdf', 'three.pdf']);
    await settle();
    expect((await outputOfLink()).pages).toEqual(['one:0:0', 'one:1:0', 'two:0:0', 'two:1:0', 'three:0:0', 'three:1:0']);

    await act(async () => redoButton().click());
    expect(fileNames()).toEqual(['one.pdf', 'three.pdf']);
    expect(redoButton().disabled).toBe(true);
  });

  // GRID-03: one Undo/Redo stack over { entries, plan }.
  describe('undo and redo', () => {
    const pageButton = (label) => container.querySelector(`button[aria-label="${label}"]`);
    const press = (init) => act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
    });

    async function mountWithPages() {
      mount();
      await loadFiles(['a.pdf', 'b.pdf']);
      await settle();
      await until(() => cells().length === 4);
    }

    it('skips a page, then Undo includes it and Redo skips it again', async () => {
      await mountWithPages();
      await act(async () => pageButton('Hide page 1 from the merged PDF').click());
      expect(planOf()[0]).toBe('a:0:0:s');
      await act(async () => undoButton().click());
      expect(planOf()[0]).toBe('a:0:0:-');
      await act(async () => redoButton().click());
      expect(planOf()[0]).toBe('a:0:0:s');
    });

    it('skipping every page says so on the Download element, not that it is preparing', async () => {
      await mountWithPages();
      for (let hide = container.querySelector('button[aria-label^="Hide page"]'); hide; hide = container.querySelector('button[aria-label^="Hide page"]')) {
        await act(async () => hide.click());
      }
      await settle();
      expect(downloadBox().getAttribute('data-state')).toBe('nothing');
      expect(downloadBox().textContent).toContain('Every page is skipped');
      expect(downloadBox().textContent).not.toContain('Preparing 0');
    });

    it('rotates a page, then Undo and Redo move it back and forth', async () => {
      await mountWithPages();
      await act(async () => pageButton('Rotate page 2').click());
      expect(planOf()[1]).toBe('a:1:90:-');
      await act(async () => undoButton().click());
      expect(planOf()[1]).toBe('a:1:0:-');
      await act(async () => redoButton().click());
      expect(planOf()[1]).toBe('a:1:90:-');
    });

    it('moves a page, then Undo and Redo restore the order', async () => {
      await mountWithPages();
      const cell = container.querySelector('[data-key]');
      await act(async () => { cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); });
      expect(planOf().slice(0, 2)).toEqual(['a:1:0:-', 'a:0:0:-']);
      await act(async () => undoButton().click());
      expect(planOf().slice(0, 2)).toEqual(['a:0:0:-', 'a:1:0:-']);
      await act(async () => redoButton().click());
      expect(planOf().slice(0, 2)).toEqual(['a:1:0:-', 'a:0:0:-']);
    });

    it('reorders files, then Undo and Redo restore the list and the pages', async () => {
      await mountWithPages();
      const grip = container.querySelector(`.${railStyles.grip}`);
      await act(async () => { grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })); });
      expect(fileNames()).toEqual(['b.pdf', 'a.pdf']);
      expect(planOf()[0]).toBe('b:0:0:-');
      await act(async () => undoButton().click());
      expect(fileNames()).toEqual(['a.pdf', 'b.pdf']);
      expect(planOf()[0]).toBe('a:0:0:-');
      await act(async () => redoButton().click());
      expect(fileNames()).toEqual(['b.pdf', 'a.pdf']);
    });

    it.each([['after', true], ['before', false]])('a file removed before its inspection finished still gets its pages when it finishes %s Undo', async (_, afterUndo) => {
      mount();
      // slow.pdf's inspection is held open: its bytes are not given up until it is released.
      pageCounts.set('slow.pdf', { pageCount: 3 });
      const slow = makePdfFile('slow.pdf');
      const reads = controlReads(slow);
      reads.holdFrom(0);
      const finish = () => reads.release();
      await loadFiles([slow, 'b.pdf'], { wait: false });
      await until(() => cells().length === 2);
      expect(planOf()).toEqual(['b:0:0:-', 'b:1:0:-']);
      await act(async () => {
        container.querySelector(`.${railStyles['file-remove']}`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(fileNames()).toEqual(['b.pdf']);
      if (!afterUndo) await act(async () => { finish(); await flush(10); });
      await act(async () => undoButton().click());
      expect(fileNames()).toEqual(['slow.pdf', 'b.pdf']);
      if (afterUndo) await act(async () => { finish(); await flush(10); });
      await until(() => planOf().filter((p) => p.startsWith('slow:')).length === 3);
      expect(planOf().filter((p) => p.startsWith('slow:'))).toHaveLength(3);
    });

    it('adding files is not a step', async () => {
      await mountWithPages();
      await loadFiles(['c.pdf']);
      expect(fileNames()).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
      expect(undoButton().disabled).toBe(true);
      await act(async () => pageButton('Rotate page 1').click());
      await loadFiles(['d.pdf']);
      await act(async () => undoButton().click());
      expect(fileNames()).toEqual(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf']);
      expect(planOf()[0]).toBe('a:0:0:-');
      expect(planOf()).toHaveLength(8);
    });

    it('a restored draft is not a step', async () => {
      await seedMergeDraft(['x.pdf', 'y.pdf']);
      mount();
      await until(() => fileNames().length === 2 && rowsRead());
      expect(fileNames()).toEqual(['x.pdf', 'y.pdf']);
      expect(undoButton().disabled).toBe(true);
    });

    it('Cmd+Z undoes and Shift+Cmd+Z redoes, and both record the action', async () => {
      await mountWithPages();
      await act(async () => pageButton('Rotate page 1').click());
      await press({ key: 'z', metaKey: true });
      expect(planOf()[0]).toBe('a:0:0:-');
      expect(recentActions()).toContain('undo');
      await press({ key: 'z', metaKey: true, shiftKey: true });
      expect(planOf()[0]).toBe('a:0:90:-');
      expect(recentActions()).toContain('redo');
    });

    it('Cmd+Z is left to the field while typing in an input', async () => {
      await mountWithPages();
      await act(async () => pageButton('Rotate page 1').click());
      const input = container.querySelector(`.${workspaceStyles['page-numbers-row']} input`);
      input.focus();
      await press({ key: 'z', metaKey: true });
      expect(planOf()[0]).toBe('a:0:90:-');
    });

    it('Cmd+Z is left to the output name while renaming it', async () => {
      await mountWithPages();
      await act(async () => pageButton('Rotate page 1').click());
      const name = container.querySelector(`.${outputNameStyles.name}`);
      name.tabIndex = -1;
      // jsdom does not implement isContentEditable
      Object.defineProperty(name, 'isContentEditable', { value: true });
      name.focus();
      await press({ key: 'z', metaKey: true });
      expect(planOf()[0]).toBe('a:0:90:-');
    });
  });

  it('DEBT-58: the first files arriving are not an edit; a remove and a later add are', async () => {
    // A first edit is sent once per accepted file, so each kind of change starts from a fresh page load.
    const firstEdits = async () => { await harness.flush(); return harness.usageEvents('tool_first_edit').map((event) => event.properties.tool); };
    mount();
    await loadFiles(['one.pdf', 'two.pdf']);
    await settle();
    expect(await firstEdits()).toEqual([]);

    const removeBtns = container.querySelectorAll(`.${railStyles['file-remove']}`);
    await act(async () => {
      removeBtns[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(await firstEdits()).toEqual(['merge']);

    act(() => render(null, container));
    container.remove();
    harness.resetUsage();
    harness.clearBeacons();
    mount();
    await loadFiles(['one.pdf', 'two.pdf']);
    expect(await firstEdits()).toEqual([]);
    await loadFiles(['three.pdf']);
    expect(await firstEdits()).toEqual(['merge']);
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
    });
    await waitUntil(() => expect(fileNames()).toEqual(['dup.pdf', 'other.pdf', 'dup.pdf']));
  });

  it('sorts with the styled menu, Reverse folded in as its own option, and regroups the plan to match', async () => {
    mount();
    await loadFiles(['b.pdf', 'a.pdf', 'c.pdf']);
    const trigger = () => container.querySelector(`button.${sortMenuStyles['sort-trigger']}`);
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
    expect((await outputOfLink()).pages).toEqual(['c:0:0', 'c:1:0', 'b:0:0', 'b:1:0', 'a:0:0', 'a:1:0']);
  });

  it('undoing a sort brings back the file order and the sort choice together', async () => {
    mount();
    await loadFiles(['b.pdf', 'a.pdf', 'c.pdf']);
    const trigger = () => container.querySelector(`button.${sortMenuStyles['sort-trigger']}`);
    await act(async () => { trigger().click(); });
    const option = Array.from(document.body.querySelectorAll('[role="option"]')).find((item) => item.textContent.trim() === 'Name A to Z');
    await act(async () => { option.click(); });
    expect(fileNames()).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
    expect(trigger().textContent).toContain('Name A to Z');

    await act(async () => undoButton().click());
    expect(fileNames()).toEqual(['b.pdf', 'a.pdf', 'c.pdf']);
    expect(trigger().textContent).not.toContain('Name A to Z');

    await act(async () => redoButton().click());
    expect(fileNames()).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
    expect(trigger().textContent).toContain('Name A to Z');
  });

  it('remembers Add page numbers on device and applies it on a fresh mount (MERGE-11)', async () => {
    mount();
    await loadFiles(['a.pdf', 'b.pdf']);
    const checkbox = container.querySelector(`.${workspaceStyles['page-numbers-row']} input`);
    expect(checkbox.checked).toBe(false);
    expect(localStorage.getItem('pdf-toolkit:merge:options')).toBeNull();

    await act(async () => {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
    expect(await pageTexts(harness.blobForUrl(downloadLink().getAttribute('href')))).toEqual(['1', '2', '3', '4']);
    expect(JSON.parse(localStorage.getItem('pdf-toolkit:merge:options'))).toEqual({ addPageNumbers: true });

    act(() => render(null, container));
    mount();
    await loadFiles(['c.pdf', 'd.pdf']);
    expect(container.querySelector(`.${workspaceStyles['page-numbers-row']} input`).checked).toBe(true);
  });

  it('keeps Add page numbers in the completion row, once, and out of the compact toolbar (MERGE-24, 2026-10-23)', async () => {
    mount();
    await loadFiles(['a.pdf', 'b.pdf']);
    expect(container.querySelectorAll('details')).toHaveLength(0);
    const buttons = Array.from(container.querySelectorAll('button')).map((b) => b.textContent.trim());
    expect(buttons).not.toContain('Options');
    const mobileControls = container.querySelector('[data-merge-file-controls]');
    expect(mobileControls).not.toBeNull();
    const rows = container.querySelectorAll(`.${workspaceStyles['page-numbers-row']}`);
    expect(rows.length).toBe(1);
    expect(mobileControls.querySelector(`.${workspaceStyles['page-numbers-row']}`)).toBeNull();
    expect(rows[0].closest(`.${workspaceStyles['rail-pinned']}`)).not.toBeNull();
  });

  it('renders no quiet Download in the file row for one file (MERGE-24)', async () => {
    mount();
    await loadFiles(['a.pdf']);
    await settle();
    expect(container.querySelector('[data-quiet-download]')).toBeNull();
  });

  it('puts a quiet Download in the sticky file row that matches the main one once ready (MERGE-24)', async () => {
    mount();
    await loadFiles(['a.pdf', 'b.pdf']);
    await settle();
    const quiet = container.querySelector('.' + workspaceStyles['chip-bar'] + ' [data-quiet-download]');
    expect(quiet).not.toBeNull();
    expect(quiet.textContent).toContain('Download');
    const main = downloadLink();
    expect(main).not.toBeNull();
    expect(quiet.getAttribute('href')).toBe(main.getAttribute('href'));
    expect(quiet.getAttribute('download')).toBe(main.getAttribute('download'));
  });

  it('gives Add files and Clear all files an icon each, in the rail and the phone controls, and Clear all files still asks first', async () => {
    mount();
    await loadFiles(['a.pdf', 'b.pdf']);
    await settle();
    const fileButtons = Array.from(container.querySelectorAll('button'))
      .filter((b) => ['Add files', 'Clear all files'].includes(b.textContent.trim()));
    expect(fileButtons.map((b) => b.textContent.trim())).toEqual(['Add files', 'Clear all files', 'Add files', 'Clear all files']);
    for (const b of fileButtons) expect(b.querySelector('svg[aria-hidden="true"]')).not.toBeNull();

    await act(async () => fileButtons[1].click());
    const dialog = Array.from(container.querySelectorAll('dialog')).find((d) => d.open);
    expect(dialog?.textContent).toContain('Clear all files?');
    expect(container.querySelector(`ul.${railStyles['file-list']}`)).not.toBeNull();
  });

  it('exposes mobile file controls in order: Add files, Clear all files, Sort, Reset order', async () => {
    mount();
    await loadFiles(['b.pdf', 'a.pdf']);
    await settle();
    const controls = () => container.querySelector('[data-merge-file-controls]');
    const describe = (el) => {
      if (el.matches(`.${sortMenuStyles['sort-select-wrap']}`)) return 'sort';
      if (el.matches(`.${railStyles['rearranged-note']}`)) return 'reset-order';
      if (el.matches(`.${workspaceStyles['page-numbers-row']}`)) return 'page-numbers';
      if (el.tagName === 'BUTTON') return el.textContent.trim();
      return el.textContent.trim();
    };
    expect(Array.from(controls().children).flatMap((el) => el.matches(`.${workspaceStyles['quiet-row']}`)
      ? Array.from(el.children).map(describe)
      : [describe(el)])).toEqual(['Add files', 'Clear all files', 'sort']);

    // Reach the rearranged state (a plan interleaved across files) with the keyboard move the page
    // grid offers, rather than fighting a real drag in jsdom: b's last page moves one place right.
    await until(() => cells().length === 4);
    await act(async () => { cells()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); });
    expect(planOf().slice(0, 3)).toEqual(['b:0:0:-', 'a:0:0:-', 'b:1:0:-']);
    // Unlike the desktop rail, Sort stays in the mobile controls even once
    // rearranged - it regroups the plan and would itself resolve the
    // rearrangement, same as Reset order (team lead, second follow-up).
    expect(Array.from(controls().children).flatMap((el) => el.matches(`.${workspaceStyles['quiet-row']}`)
      ? Array.from(el.children).map(describe)
      : [describe(el)])).toEqual(['Add files', 'Clear all files', 'sort', 'reset-order']);
  });

  it('names an encrypted file, links to Unlock, and merges the rest on the one offered action (MERGE-04)', async () => {
    pageCounts.set('locked.pdf', { pageCount: 1, encrypted: true });
    mount();
    await loadFiles(['a.pdf', 'locked.pdf', 'b.pdf']);
    await settle();

    expect(harness.createdBlobs()).toHaveLength(0);
    const notice = container.querySelector('[data-locked-notice]');
    expect(notice.textContent).toContain('"locked.pdf" is password-protected');
    expect(notice.querySelector('a').getAttribute('href')).toBe('/unlock/');
    expect(container.textContent).not.toContain("That didn't work");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    const row = container.querySelector(`.${railStyles['file-row']}[data-locked]`);
    expect(row.querySelector(`.${railStyles['file-name']}`).textContent).toBe('locked.pdf');
    expect(row.hasAttribute('data-error')).toBe(false);
    expect(row.querySelector(`.${railStyles['file-pages']}`).textContent).not.toMatch(/\d/);
    // The lock is read out, not only drawn: true of a password and an owner-only lock alike.
    expect(row.querySelector(`.${railStyles['file-pages']}`).textContent).toBe('This PDF is protected');
    // The phone chip agrees with the rail row: a lock, not a page count.
    const chip = container.querySelector(`.${docStyles.chip}[data-locked]`);
    expect(chip.querySelector(`.${docStyles['chip-pages']}`).textContent).toBe('This PDF is protected');
    expect(downloadBox().getAttribute('data-state')).toBe('error');

    await act(async () => {
      notice.querySelector('button').click();
    });
    await settle();
    expect(fileNames()).toEqual(['a.pdf', 'b.pdf']);
    expect(harness.createdBlobs()).toHaveLength(1);
    expect((await outputOfLink()).pages).toEqual(['a:0:0', 'a:1:0', 'b:0:0', 'b:1:0']);
    expect(container.querySelector('[data-locked-notice]')).toBeNull();
  });

  it.each([
    ['owner-only.pdf', 'owner-restricted'],
    ['needs-password.pdf', 'needs-password'],
  ])('a single protected file (%s) shows the locked state in place of the result area', async (fixture, kind) => {
    const bytes = fs.readFileSync(path.resolve(__dirname, '../../lib/__fixtures__/encrypted', fixture));
    harness.pdfjs.probeAs(kind);
    mount();
    await loadFiles([new File([bytes], fixture, { type: 'application/pdf' })]);
    await settle();
    await act(async () => { await flush(20); });

    expect(container.querySelector('[data-needs-unlock]').getAttribute('data-needs-unlock')).toBe(kind);
    expect(container.textContent).not.toContain("That didn't work");
    expect(container.textContent).not.toContain('0 pages');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[aria-label="Undo last change"]')).toBeNull();
    expect(fileNames()).toEqual([fixture]);
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent.includes('Add files'))).toBe(true);
  });

  it('shows no error while it is still checking how a single protected file is locked', async () => {
    harness.pdfjs.probeNeverAnswers();
    pageCounts.set('locked.pdf', { pageCount: 1, encrypted: true });
    mount();
    await loadFiles(['locked.pdf']);
    await settle();
    await act(async () => { await flush(20); });

    expect(container.textContent).not.toContain("That didn't work");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    // Nor the one-file box and the output heading, which would flash away once the panel comes.
    expect(container.querySelector('[data-state="one-file"]')).toBeNull();
    expect(container.querySelector('#page-grid-heading')).toBeNull();
  });

  it('shows the Hebrew locked-state copy on the /he/ edition', async () => {
    harness.pdfjs.probeAs('needs-password');
    pageCounts.set('locked.pdf', { pageCount: 1, encrypted: true });
    mount({ messages: hebrewMergeMessages, shellMessages: hebrewShellMessages });
    await loadFiles(['locked.pdf']);
    await settle();
    await waitUntil(() => {
      expect(container.textContent).toContain(hebrewMergeMessages.protectedNeedsPasswordTitle);
      expect(container.textContent).toContain(hebrewMergeMessages.protectedUnlockIt);
    });
  });

  it('keeps the inline error when a protected file sits among several (MERGE-04)', async () => {
    harness.pdfjs.probeAs('needs-password');
    pageCounts.set('locked.pdf', { pageCount: 1, encrypted: true });
    mount();
    await loadFiles(['a.pdf', 'locked.pdf']);
    await settle();
    expect(container.querySelector('[data-needs-unlock]')).toBeNull();
    expect(container.querySelector('[data-locked-notice]').textContent).toContain('is password-protected');
  });

  it('names the output after the first readable file, not a locked one that leads', async () => {
    harness.pdfjs.probeAs('needs-password');
    pageCounts.set('locked.pdf', { pageCount: 1, encrypted: true });
    mount();
    await loadFiles(['locked.pdf', 'plain.pdf']);
    await settle();
    expect(container.querySelector(`.${outputNameStyles.name}`).textContent).toBe('merged_plain');
  });

  it('offers no "add one more file" box beside the locked state of a single protected file', async () => {
    harness.pdfjs.probeAs('needs-password');
    pageCounts.set('locked.pdf', { pageCount: 1, encrypted: true });
    mount();
    await loadFiles(['locked.pdf']);
    await settle();
    await waitUntil(() => expect(container.querySelector('[data-needs-unlock]')).not.toBeNull());
    await act(async () => { await flush(20); }); // the absence below keeps its window
    expect(container.querySelector('[data-state="one-file"]')).toBeNull();
  });

  it('reports an unreadable file by name when the merge itself rejects it (MERGE-04)', async () => {
    // broken.pdf is readable when it is inspected and gives out when the merge reads it.
    const broken = makePdfFile('broken.pdf');
    const reads = controlReads(broken);
    reads.failFrom(1);
    mount();
    await loadFiles(['a.pdf', broken]);
    await settle();

    const alert = container.querySelector('[role="alert"]');
    expect(alert.textContent).toContain('"broken.pdf" could not be read');
    expect(alert.querySelector('a')).toBeNull();
  });

  const failedEvents = async () => { await harness.flush(); return harness.usageEvents('tool_operation_failed'); };

  it('does not count a file flagged encrypted by inspection as a failed operation (DEBT-44)', async () => {
    pageCounts.set('locked.pdf', { pageCount: 1, encrypted: true });
    mount();
    await loadFiles(['a.pdf', 'locked.pdf']);
    await settle();

    expect(downloadBox().getAttribute('data-state')).toBe('error');
    expect(await failedEvents()).toEqual([]);
  });

  it('does not count a file inspection finds unreadable, but reports the library error behind it', async () => {
    pageCounts.set('broken.pdf', { unreadable: true });
    mount();
    await loadFiles(['a.pdf', 'broken.pdf']);
    await settle();

    expect(container.querySelector('[role="alert"]').textContent).toContain('"broken.pdf" could not be read');
    expect(await failedEvents()).toEqual([]);
    // The report is of the library's own error behind it, not of the wrapper merge.js puts around it.
    expect(harness.reports()).toMatchObject([{ area: 'pdf_tool_run', step: 'inspect_pdf', type: 'TypeError' }]);
  });

  it('reports an unexpected inspection failure and still shows the file unreadable (DEBT-44)', async () => {
    pageCounts.set('odd.pdf', { crash: true });
    mount();
    await loadFiles(['a.pdf', 'odd.pdf']);
    await settle();

    await harness.flush();
    expect(harness.reports()).toMatchObject([{ area: 'pdf_tool_run', step: 'inspect_pdf' }]);
    expect(container.querySelector('[role="alert"]').textContent).toContain('"odd.pdf" could not be read');
    expect(await failedEvents()).toEqual([]);
  });

  it('still counts a failure of the merge run itself (DEBT-44)', async () => {
    const b = makePdfFile('b.pdf');
    const reads = controlReads(b);
    reads.failFrom(1);
    mount();
    await loadFiles(['a.pdf', b]);
    await settle();

    expect(await failedEvents()).toHaveLength(1);
  });

  it('hands the merged result to Compress without re-picking, keeping the merge draft (MERGE-14)', async () => {
    const navigate = vi.fn();
    mount({ navigate });
    await loadFiles(['a.pdf', 'b.pdf']);
    await settle();
    await draftSaved();

    // Buttons, not links, and no Split: the row is Compress and Sign only.
    expect(container.querySelector('a[href="/compress/"]')).toBeNull();
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent === 'Split it')).toBe(false);
    const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Compress');
    await act(async () => {
      button.click();
    });
    await until(() => navigate.mock.calls.length > 0);
    // The hand-off is what Compress will find: the merged file, whole.
    const record = await harness.takeHandoff('compress');
    expect(record.fileName).toBe('merged_a.pdf');
    expect(Object.prototype.toString.call(record.fileBytes)).toBe('[object ArrayBuffer]');
    expect((await readOutput(new Blob([record.fileBytes]))).pages).toEqual(['a:0:0', 'a:1:0', 'b:0:0', 'b:1:0']);
    // Merge's own draft is still stored.
    expect((await harness.storedDraft('merge'))?.files.map((f) => f.fileName)).toEqual(['a.pdf', 'b.pdf']);
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
      handoff('Compress').click();
    });
    await waitUntil(() => expect(navigate).toHaveBeenCalledWith('/compress/'));
    expect(handoff('Sign').disabled).toBe(true);

    await act(async () => {
      const restore = new Event('pageshow');
      restore.persisted = true;
      window.dispatchEvent(restore);
    });

    expect(handoff('Sign').disabled).toBe(false);
    await act(async () => {
      handoff('Sign').click();
    });
    await waitUntil(() => expect(navigate).toHaveBeenLastCalledWith('/sign/'));
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
    // Sign has a draft of its own, so this test would catch a regression that brings the old
    // ask-first check back.
    expect(await saveDraft('sign', { fileName: 'contract.pdf', fileType: 'application/pdf', fileBytes: bufferOf(pagesPdf('contract.pdf', 1)) })).toBe(true);
    const navigate = vi.fn();
    mount({ navigate });
    await loadFiles(['a.pdf', 'b.pdf']);
    await settle();

    const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Sign');
    await act(async () => {
      button.click();
    });
    await until(() => navigate.mock.calls.length > 0);
    expect((await harness.takeHandoff('sign'))?.fileName).toBe('merged_a.pdf');
    // Sign's existing entry (and its work) is never touched by this hand-off.
    expect((await harness.storedDraft('sign'))?.fileName).toBe('contract.pdf');
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
    // state for it instead of silently not saving. The cap is 200 MB, so the failed
    // write here is the other way a save fails: there is no IndexedDB.
    globalThis.indexedDB = undefined;
    mount();
    await loadFiles(['a.pdf', 'b.pdf']);
    await settle();
    await until(() => container.querySelector(`.${railStyles['draft-status-row']}`)?.textContent === 'Draft not saved');
    const statusRow = container.querySelector(`.${railStyles['draft-status-row']}`);
    expect(statusRow).not.toBeNull();
    expect(statusRow.textContent).toBe('Draft not saved');
    expect(container.textContent).not.toContain('Draft saved');
    // MEM-11: the retention hint never rides along with the error state.
    expect(statusRow.querySelector('[tabindex="0"][aria-describedby]')).toBeNull();
  });

  it('restores a saved draft into the list, the plan and the options, and clears it on Start again (MERGE-13)', async () => {
    // The picked-up-sentence-to-chip flip below advances virtual time via
    // fake timers instead of waiting out a real 5s timer; the real IndexedDB and the lazy
    // chunks answer on the real event loop, so each wait gives it a turn between advances.
    const untilFake = async (cond, timeout = 8000) => {
      const start = Date.now();
      while (!cond()) {
        if (Date.now() - start > timeout) throw new Error(`condition not met within ${timeout}ms: ${cond}`);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(10);
          await new Promise((resolve) => setImmediate(resolve));
        });
      }
    };
    await seedMergeDraft(['x.pdf', 'y.pdf'], {
      plan: [
        { key: '0:0', fileId: 0, pageIndex: 0, rotation: 90, skipped: false },
        { key: '1:0', fileId: 1, pageIndex: 0, rotation: 0, skipped: true },
        { key: '0:1', fileId: 0, pageIndex: 1, rotation: 0, skipped: false },
        { key: '1:1', fileId: 1, pageIndex: 1, rotation: 0, skipped: false },
      ],
      options: { addPageNumbers: true },
    });
    // The pre-paint script sets this when the pointer to a draft exists (hasDraftHint is true here, for real).
    document.documentElement.setAttribute('data-draft-hint', '1');
    // Fake timers from here on: the restore starts the component's own 5s "picked up" -> chip
    // setTimeout, so it must already be running under the fake clock for the advance further down to
    // move it. The pre-merge debounce that fires during this window is also driven by advancing
    // virtual time (in place of settle()'s real flush).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    mount();
    expect(document.documentElement.hasAttribute('data-draft-hint')).toBe(true);
    // The hint alone holds the empty state back before the module has loaded.
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    await untilFake(() => fileNames().length === 2);
    expect(fileNames()).toEqual(['x.pdf', 'y.pdf']);
    // The pre-paint hint attribute is gone once the check settled, so a later
    // Clear all shows the dropzone instead of a blank card.
    expect(document.documentElement.hasAttribute('data-draft-hint')).toBe(false);
    expect(container.querySelector(`.${workspaceStyles['page-numbers-row']} input`).checked).toBe(true);
    // The restored-draft sentence shows first, for its five seconds; only
    // after that does the small "Draft saved" chip take its place.
    expect(container.textContent).toContain('Picked up where you left off');
    await untilFake(() => downloadLink() !== null);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    const blob = harness.blobForUrl(downloadLink().getAttribute('href'));
    expect((await readOutput(blob)).pages).toEqual(['x:0:90', 'x:1:0', 'y:1:0']);
    expect(await pageTexts(blob)).toEqual(['1', '2', '3']);
    // Pages were interleaved across files, so the list shows the rearranged note.
    expect(container.textContent).toContain('Pages moved across files');

    // After its five seconds the sentence gives way to the small chip for
    // the rest of the session.
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(container.textContent).not.toContain('Picked up where you left off');
    // A restored workspace is not saved again until the person changes it; the first change is.
    await act(async () => container.querySelector('button[aria-label="Rotate page 3"]').click());
    await untilFake(() => container.textContent.includes('Draft saved'));
    vi.useRealTimers();
    // MEM-11: the retention hint's trigger rides along with the saved chip.
    const statusRow = container.querySelector(`.${railStyles['draft-status-row']}`);
    expect(statusRow.querySelector('[tabindex="0"][aria-describedby]')).not.toBeNull();
    expect((await harness.storedDraft('merge')).plan.map((p) => p.rotation)).toEqual([90, 0, 0, 90]);

    await until(() => downloadLink() !== null);
    await act(async () => downloadLink().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    const startAgain = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Start again');
    await act(async () => startAgain.click());
    await untilAsync(async () => (await harness.storedDraft('merge')) === null);
    expect(fileNames()).toEqual([]);
  });

  // SITE-42: the home launcher hands several files to Merge as a fresh set.
  describe('a hand-off from the home page (SITE-42)', () => {
    // EDGE: an IndexedDB that is slow to answer its first request, which is the hand-off read (the
    // draft restore only starts once its lazy module has loaded). `release()` lets that answer through.
    function slowFirstOpen() {
      const realOpen = indexedDB.open.bind(indexedDB);
      let opened = 0;
      let release = () => {};
      const gate = new Promise((resolve) => { release = resolve; });
      indexedDB.open = (...args) => {
        const request = realOpen(...args);
        opened += 1;
        if (opened > 1) return request;
        let handler = null;
        Object.defineProperty(request, 'onsuccess', {
          configurable: true,
          get: () => (handler ? (event) => { gate.then(() => handler(event)); } : handler),
          set: (fn) => { handler = fn; },
        });
        return request;
      };
      return release;
    }

    it('loads the handed-off files as the set, in pick order, named like a manual pick', async () => {
      expect(await saveHandoff('merge', handoffOf('c.pdf', 'a.pdf', 'b.pdf'))).toBe(true);
      mount();
      await until(() => fileNames().length === 3);
      expect(fileNames()).toEqual(['c.pdf', 'a.pdf', 'b.pdf']);
      // It was taken, not copied: the hand-off is gone.
      expect(await harness.takeHandoff('merge')).toBeNull();
      await settle();
      expect(container.textContent).toContain('merged_c.pdf');
    });

    it('lands a PDF and a photo from the home page in order (MERGE-22)', async () => {
      expect(await saveHandoff('merge', handoffOf('a.pdf', 'snap.jpg'))).toBe(true);
      mount();
      await until(() => fileNames().length === 2);
      expect(fileNames()).toEqual(['a.pdf', 'snap.jpg']);
    });

    it('wins over a restore that lands after it, and leaves the saved set alone', async () => {
      await seedMergeDraft(['old1.pdf', 'old2.pdf']);
      expect(await saveHandoff('merge', handoffOf('new1.pdf', 'new2.pdf'))).toBe(true);
      mount();
      await until(() => fileNames().length === 2 && rowsRead());
      await act(async () => { await flush(60); });
      expect(fileNames()).toEqual(['new1.pdf', 'new2.pdf']);
      // The saved set is still stored, with its work, in the recents.
      expect(harness.recents().filter((entry) => entry.hasWork.includes('merge')).map((entry) => entry.fileName)).toContain('merged_old1');
      // And the stored body is intact, not cleared or replaced by the hand-off.
      expect((await harness.storedDraft('merge'))?.files.map((f) => f.fileName)).toEqual(['old1.pdf', 'old2.pdf']);
    });

    it('replaces a restore that landed first instead of appending to it', async () => {
      await seedMergeDraft(['old1.pdf', 'old2.pdf']);
      expect(await saveHandoff('merge', handoffOf('new1.pdf', 'new2.pdf'))).toBe(true);
      const release = slowFirstOpen();
      mount();
      await until(() => fileNames().length === 2 && rowsRead());
      expect(fileNames()).toEqual(['old1.pdf', 'old2.pdf']);
      await act(async () => { release(); });
      await until(() => fileNames().join() === 'new1.pdf,new2.pdf');
      expect(fileNames()).toEqual(['new1.pdf', 'new2.pdf']);
      expect(container.textContent).not.toContain('Picked up where you left off');
      expect(harness.recents().filter((entry) => entry.hasWork.includes('merge')).map((entry) => entry.fileName)).toContain('merged_old1');
      // And the stored body is intact, not cleared or replaced by the hand-off.
      expect((await harness.storedDraft('merge'))?.files.map((f) => f.fileName)).toEqual(['old1.pdf', 'old2.pdf']);
    });

    it('clears everything else the replaced set left behind: sort mode and history', async () => {
      await seedMergeDraft(['b.pdf', 'a.pdf', 'c.pdf']);
      expect(await saveHandoff('merge', handoffOf('z.pdf', 'y.pdf'))).toBe(true);
      const release = slowFirstOpen();
      mount();
      await until(() => fileNames().length === 3 && rowsRead());
      const trigger = () => container.querySelector(`button.${sortMenuStyles['sort-trigger']}`);
      await act(async () => { trigger().click(); });
      const option = Array.from(document.body.querySelectorAll('[role="option"]')).find((item) => item.textContent.trim() === 'Name A to Z');
      await act(async () => { option.click(); });
      await act(async () => {
        container.querySelector(`.${railStyles['file-remove']}`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(trigger().textContent).toContain('Name A to Z');
      expect(undoButton().disabled).toBe(false);

      await act(async () => { release(); });
      await until(() => fileNames().join() === 'z.pdf,y.pdf');
      expect(fileNames()).toEqual(['z.pdf', 'y.pdf']);
      expect(trigger().textContent).not.toContain('Name A to Z');
      expect(undoButton().disabled).toBe(true);
    });
  });

  it('keeps visible mobile controls outside the sortable chip list', async () => {
    mount();
    await loadFiles(['a.pdf', 'b.pdf']);
    const chipRow = container.querySelector(`ul.${docStyles['chip-row']}`);
    const controls = container.querySelector('[data-merge-file-controls]');
    expect(chipRow).not.toBeNull();
    expect(controls).not.toBeNull();
    expect(chipRow.contains(controls)).toBe(false);
    expect(chipRow.querySelector('select, input')).toBeNull();
  });

  it('each chip has a remove button that removes that file (MERGE-24)', async () => {
    mount();
    await loadFiles(['one.pdf', 'two.pdf', 'three.pdf']);
    await settle();
    const chipRow = container.querySelector(`ul.${docStyles['chip-row']}`);
    const remove = chipRow.querySelector('button[aria-label*="two.pdf"]');
    expect(remove).not.toBeNull();
    expect(remove.classList.contains(docStyles['chip-remove'])).toBe(true);
    await act(async () => {
      remove.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(chipRow.querySelectorAll(`.${docStyles.chip}`).length).toBe(2);
    expect(chipRow.textContent).not.toContain('two.pdf');
  });

  // Review P2, item 3: "Picked up where you left off · Start fresh" lived
  // only in the rail, which is CSS-hidden below 768px, so it never reached a
  // phone. The document header's right slot (where the Undo chip also
  // lives) now carries the same sentence for that placement.
  it('shows the restored-draft sentence in the document header, for phones (MERGE-13)', async () => {
    await seedMergeDraft(['x.pdf', 'y.pdf']);
    mount();
    await until(() => fileNames().length === 2);

    const headerChip = container.querySelector(`.${workspaceStyles['doc-header-right']} .${docStyles['header-draft-chip']}`);
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

  it('re-creates a live Sortable on the rail and chip row after Clear all and re-adding files, without destroying a destroyed instance', async () => {
    // Sortable's destroy() nulls its element, so a second destroy() on the same
    // instance throws. Re-running the effects after their cleanup must not.
    const errors = [];
    const onError = (e) => { errors.push(e.error || e.message); e.preventDefault(); };
    window.addEventListener('error', onError);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mount();
      await loadFiles(['a.pdf', 'b.pdf']);

      const clearTrigger = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Clear all files');
      await act(async () => clearTrigger.click());
      const clearButtons = Array.from(container.querySelectorAll('button')).filter((b) => b.textContent.trim() === 'Clear all');
      await act(async () => clearButtons.at(-1).click());
      expect(container.querySelector(`ul.${railStyles['file-list']}`)).toBeNull();

      await loadFiles(['c.pdf', 'd.pdf']);
      const listOf = () => container.querySelector(`ul.${railStyles['file-list']}`);
      const chipRowOf = () => container.querySelector(`ul.${docStyles['chip-row']}`);
      await waitUntil(() => {
        expect(listOf()).not.toBeNull();
        expect(chipRowOf()).not.toBeNull();
        expect(Sortable.get(listOf())).toBeDefined();
        expect(Sortable.get(chipRowOf())).toBeDefined();
      });
      await flush(10); // the error checks below are absences: keep a window
      const list = listOf();
      const chipRow = chipRowOf();
      expect(list).not.toBeNull();
      expect(chipRow).not.toBeNull();
      expect(errors).toEqual([]);
      expect(consoleError).not.toHaveBeenCalled();
      expect(Sortable.get(list)).toBeDefined();
      expect(Sortable.get(chipRow)).toBeDefined();
    } finally {
      window.removeEventListener('error', onError);
    }
  });

  it('records what the person did, in order, through Clear all and adding again (DEBT-31)', async () => {
    mount();
    await loadFiles(['a.pdf', 'b.pdf']);
    const clearTrigger = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Clear all files');
    await act(async () => clearTrigger.click());
    const clearButtons = Array.from(container.querySelectorAll('button')).filter((b) => b.textContent.trim() === 'Clear all');
    await act(async () => clearButtons.at(-1).click());
    await loadFiles(['c.pdf', 'd.pdf']);
    expect(recentActions()).toEqual(['add_files', 'clear_all', 'add_files']);
  });

  it('keeps whole-file drag enabled after pages are rearranged and regroups on drop', async () => {
    const createSpy = vi.spyOn(Sortable, 'create');
    mount();
    await loadFiles(['a.pdf', 'b.pdf']);

    const list = container.querySelector(`ul.${railStyles['file-list']}`);
    const railCallIndex = createSpy.mock.calls.findIndex(([element]) => element === list);
    const railOptions = createSpy.mock.calls[railCallIndex][1];
    const railSortable = createSpy.mock.results[railCallIndex].value;

    // A page moves across the file boundary with the grid's own keyboard move.
    await until(() => cells().length === 4);
    await act(async () => { cells()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); });

    expect(container.textContent).toContain('Pages moved across files');
    expect(container.querySelectorAll(`.${railStyles.grip}`)).toHaveLength(2);
    expect(railSortable.option('disabled')).toBe(false);

    await act(async () => {
      railOptions.onEnd({ oldIndex: 0, newIndex: 1 });
      await flush(0);
    });
    expect(fileNames()).toEqual(['b.pdf', 'a.pdf']);
    expect(container.textContent).not.toContain('Pages moved across files');
  });

  // MERGE-11 (2026-09-13, Shlomi's WYSIWYG rebuild): the document heading's
  // name IS the editable output file name now - one contenteditable span,
  // never a button swapped for an input. `type()` stands in for real typing:
  // jsdom does not synthesize keyboard input into a contenteditable region,
  // so tests set `textContent` directly (as a person's keystrokes would
  // leave it) rather than dispatching an `input` event nothing here listens
  // for.
  describe('renaming the output file name', () => {
    const nameEl = () => container.querySelector(`.${outputNameStyles.name}`);
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
      expect(container.querySelector(`.${outputNameStyles['doc-heading-ext']}`).textContent).toBe('.pdf');
      const link = downloadLink();
      expect(link.getAttribute('download')).toBe('March invoices.pdf');
      expect((await outputOfLink()).title).toBe('March invoices');
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

      // Clear all files resets it - the next set of files gets the automatic name.
      // The trigger opens a confirm dialog first (BasePdfTool's requestClear),
      // whose own confirm button reads "Clear all".
      const clearTrigger = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Clear all files');
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
      await draftSaved();
      expect((await harness.storedDraft('merge')).outputName).toBeNull();

      await beginEdit();
      await type('Persisted name');
      await act(async () => { nameEl().blur(); });
      await untilAsync(async () => (await harness.storedDraft('merge')).outputName === 'Persisted name');

      // A restore that carries an outputName brings the renamed heading back.
      act(() => render(null, container));
      container.remove();
      await seedMergeDraft(['x.pdf', 'y.pdf'], { outputName: 'Restored name' });
      mount();
      await until(() => fileNames().length === 2);
      expect(nameEl().textContent).toBe('Restored name');
    });
  });

  // The size ("1.0 KB") inside the Hebrew detail line must be bidi-isolated or
  // it renders reversed; English stays untouched.
  describe('the download detail line size', () => {
    const mergedDetail = async (props) => {
      mount(props);
      await loadFiles(['a.pdf', 'b.pdf']);
      await settle();
      return downloadBox().textContent;
    };

    it('wraps the size in LRI/PDI in Hebrew', async () => {
      const detail = await mergedDetail({ messages: hebrewMergeMessages, shellMessages: hebrewShellMessages });
      expect(detail).toMatch(/\u2066[^\u2066\u2069]*\d[^\u2066\u2069]*\u2069/);
    });

    it('adds no isolates in English', async () => {
      const detail = await mergedDetail({});
      expect(detail).toMatch(/\d (B|KB)/);
      expect(detail).not.toContain('\u2066');
      expect(detail).not.toContain('\u2069');
    });
  });

  // UX guideline 9: the heading is a file name ("merged_x" + ".pdf"), and in an RTL page
  // a ".pdf" outside any isolate lays out as "pdf." and sits on the wrong side of the name.
  // Name and extension are one isolate whose direction follows the name, with the extension
  // an LTR run inside it. jsdom has no layout, so this asserts the markup; the rendered
  // order is src/tools/merge/e2e/merge-rtl-file-name.spec.js.
  describe('the heading file name is one bidi isolate', () => {
    const headingUnit = async (props) => {
      mount(props);
      await loadFiles(['three-page-header.pdf', 'b.pdf']);
      await settle();
      const name = container.querySelector(`.${outputNameStyles.name}`);
      const ext = container.querySelector(`.${outputNameStyles['doc-heading-ext']}`);
      return { name, ext, unit: name.parentElement };
    };

    it.each([
      ['Hebrew', { messages: hebrewMergeMessages, shellMessages: hebrewShellMessages }],
      ['English', {}],
    ])('wraps the name and the .pdf in one auto-direction isolate in %s', async (_label, props) => {
      const { name, ext, unit } = await headingUnit(props);
      expect(ext.parentElement).toBe(unit);
      expect(unit.parentElement.id).toBe('page-grid-heading');
      expect(unit.tagName === 'BDI' || unit.getAttribute('dir') === 'auto').toBe(true);
      // The unit takes its direction from the name's own text, so the name carries no dir of
      // its own (an element with a dir attribute is skipped when `dir=auto` looks for a
      // first strong character).
      expect(name.hasAttribute('dir')).toBe(false);
      expect(name.textContent).toBe('merged_three-page-header');
    });

    it('keeps the .pdf as an LTR run inside the unit', async () => {
      const { ext } = await headingUnit({ messages: hebrewMergeMessages, shellMessages: hebrewShellMessages });
      expect(ext.getAttribute('dir')).toBe('ltr');
      expect(ext.textContent).toBe('.pdf');
    });
  });

  // Guideline 9, second half: a name composed into a sentence is isolated, or a name that
  // starts or ends in digits ("2025-one.pdf") reorders against the Hebrew around it. FSI ...
  // PDI, only when the catalogue is RTL; the English tests above pin English byte-for-byte.
  describe('a file name inside a Hebrew sentence is bidi-isolated', () => {
    const hebrew = { messages: hebrewMergeMessages, shellMessages: hebrewShellMessages };
    const isolated = (name) => `\u2068${name}\u2069`;

    it('in the duplicate notice', async () => {
      mount(hebrew);
      await loadFiles(['2025-dup.pdf', 'other.pdf']);
      await loadFiles(['2025-dup.pdf']);
      expect(container.querySelector(`.${pdfToolStyles['hint-message']}`).textContent).toContain(isolated('2025-dup.pdf'));
    });

    it('in the skipped-file notice', async () => {
      mount(hebrew);
      await loadFiles([makePdfFile('a.pdf'), makePdfFile('2025-notes.txt', { type: 'text/plain' })]);
      expect(container.querySelector(`.${pdfToolStyles['hint-message']}`).textContent).toContain(isolated('2025-notes.txt'));
    });

    it.each([
      ['an encrypted file', '2025-locked.pdf', { pageCount: 1, encrypted: true }],
      ['an unreadable file', '2025-broken.pdf', { unreadable: true }],
    ])('in the error for %s', async (_label, name, spec) => {
      pageCounts.set(name, spec);
      mount(hebrew);
      await loadFiles(['a.pdf', name, 'b.pdf']);
      await settle();
      expect(container.querySelector('[role="alert"], [data-locked-notice]').textContent).toContain(isolated(name));
    });
  });
});

describe('merge.js library integration with real fixtures', () => {
  function getFixtureFile(name) {
    return new File([fs.readFileSync(path.join(FIXTURES, name))], name, { type: 'application/pdf' });
  }

  const extractTextFromPdfBlob = pageTexts;

  it('merges num-1, num-2, num-3, num-4 in order', async () => {
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

// Guideline §2, "Quiet means quiet": nothing visibly changes while the person is still
// editing. These run the real 1500/2500ms policy under fake timers.
describe('PdfMergeTool quiet-time prepare', () => {
  let container;
  const box = () => container.querySelector(`.${downloadStyles.box}`);
  const pageNumbersBox = () => container.querySelector(`.${workspaceStyles['page-numbers-row']} input`);
  let harness: ToolHarness;
  let sources;
  let builtBefore;
  // Builds that have landed since the set was first built: distinct blobs, because a cached result
  // handed back for a state seen before is the same blob again.
  const built = () => new Set(harness.createdBlobs()).size - builtBefore;
  // The real IndexedDB, pdf-lib and the lazy chunks answer on the real event loop, and pdf-lib
  // yields on timers: move the fake clock in small steps and give the real loop a few turns after each.
  const advance = (ms) => act(async () => {
    for (let left = ms; left > 0; left -= 10) {
      await vi.advanceTimersByTimeAsync(Math.min(10, left));
      for (let turn = 0; turn < 3; turn += 1) await new Promise((resolve) => setImmediate(resolve));
    }
  });

  beforeEach(async () => {
    harness = installToolHarness();
    pageCounts.clear();
    widthOf.clear();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    window.scrollTo = vi.fn();
    sources = ['a.pdf', 'b.pdf', 'c.pdf'].map((n) => makePdfFile(n));
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<PdfMergeTool />, container));
    await act(async () => {
      setInputFiles(container.querySelector('input[type="file"]'), sources);
    });
    // Settle the inspection and the first build, past the 3s burst window, so each test starts from a built set.
    for (let i = 0; i < 60 && !(box()?.hasAttribute('href')); i += 1) await advance(100);
    await advance(4500);
    builtBefore = new Set(harness.createdBlobs()).size;
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    container = null;
    vi.useRealTimers();
    harness.restore();
    vi.restoreAllMocks();
  });

  it('keeps the ready look after a change and does not build before 1500ms', async () => {
    await act(async () => pageNumbersBox().click());
    await advance(1400);
    expect(box().getAttribute('data-state')).toBe('ready');
    expect(box().getAttribute('aria-busy')).toBeNull();
    expect(box().textContent).toContain('6 pages');
    expect(built()).toBe(0);
    await advance(200);
    await waitUntil(() => expect(built()).toBe(1), { dueFakeTimers: true });
    expect(box().getAttribute('href')).toBeTruthy();
  });

  it('builds once, 2500ms after the last of three quick changes', async () => {
    await act(async () => pageNumbersBox().click());
    await advance(500);
    await act(async () => pageNumbersBox().click());
    await advance(500);
    await act(async () => pageNumbersBox().click());
    await advance(2400);
    expect(built()).toBe(0);
    await advance(200);
    await waitUntil(() => expect(built()).toBe(1), { dueFakeTimers: true });
  });

  it('is ready at once, with no build, after an undo back to a built set', async () => {
    const removeButtons = container.querySelectorAll(`.${railStyles['file-remove']}`);
    await act(async () => removeButtons[1].dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await advance(300);
    const undo = container.querySelector('button[aria-label="Undo last change"]');
    await act(async () => undo.click());
    expect(box().getAttribute('data-state')).toBe('ready');
    expect(box().getAttribute('href')).toBeTruthy();
    await advance(5000);
    expect(built()).toBe(0);
  });

  it('shows preparing only after a tap before the build is done, then delivers', async () => {
    // The next build starts reading its files and is held there until the test lets it go.
    const reads = controlReads(sources[0]);
    reads.holdFrom();
    const finish = () => reads.release();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await act(async () => pageNumbersBox().click());
    await advance(1700);
    // The build loads pdf-lib and the page-number font before its first read: real work, not fake time.
    // Waits on the real loop only, so the fake clock stays at 1700 ms.
    await waitUntil(() => expect(reads.isBlocked()).toBe(true), { dueFakeTimers: true });
    expect(box().getAttribute('data-state')).toBe('ready');
    await act(async () => { box().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(box().getAttribute('data-state')).toBe('preparing');
    await act(async () => { finish(); await vi.advanceTimersByTimeAsync(50); });
    await waitUntil(() => expect(clickSpy).toHaveBeenCalledTimes(1), { dueFakeTimers: true });
    expect(box().getAttribute('data-state')).toBe('saved');
    clickSpy.mockRestore();
  });

  it('starts the build at once on pointerdown on Download', async () => {
    await act(async () => pageNumbersBox().click());
    await advance(200);
    expect(built()).toBe(0);
    await act(async () => { box().dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    // Well inside the quiet wait, the build is already under way and lands.
    await advance(300);
    await waitUntil(() => expect(built()).toBe(1), { dueFakeTimers: true });
  });
  // MERGE-24 review: the done strip's pending tap and wide screens.
  function stubMedia(initialMatches) {
    const listeners = new Set();
    const state = { matches: initialMatches };
    const original = window.matchMedia;
    window.matchMedia = (query) => ({
      get matches() { return query.includes('max-width: 1023px') ? state.matches : false; },
      media: query,
      onchange: null,
      addListener() {}, removeListener() {},
      addEventListener: (type, fn) => { if (query.includes('max-width: 1023px')) listeners.add(fn); },
      removeEventListener: (type, fn) => { listeners.delete(fn); },
      dispatchEvent() { return false; },
    });
    return {
      set(matches) { state.matches = matches; listeners.forEach((fn) => fn({ matches })); },
      restore() { window.matchMedia = original; },
    };
  }
  const strip = () => container.querySelector('[data-merge-done-strip]');

  it('opens the strip on delivery after a quiet Download tap that beat the build (tablet)', async () => {
    const media = stubMedia(true);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      await act(async () => pageNumbersBox().click());
      await advance(200);
      await act(async () => { container.querySelector('[data-quiet-download]').click(); });
      await advance(5000);
      await waitUntil(() => expect(box().getAttribute('data-state')).toBe('saved'), { dueFakeTimers: true });
      expect(strip()).not.toBeNull();
    } finally {
      clickSpy.mockRestore();
      media.restore();
    }
  });

  it('a stale quiet-tap flag does not open the strip for the completion row tap after Clear all', async () => {
    const media = stubMedia(true);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      // The build the page-numbers change starts never finishes.
      controlReads(sources[0]).holdFrom();
      await act(async () => pageNumbersBox().click());
      await advance(200);
      await act(async () => { container.querySelector('[data-quiet-download]').click(); });
      const clearTrigger = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Clear all files');
      await act(async () => clearTrigger.click());
      const clearButtons = Array.from(container.querySelectorAll('button')).filter((b) => b.textContent.trim() === 'Clear all');
      await act(async () => clearButtons.at(-1).click());
      await act(async () => {
        setInputFiles(container.querySelector('input[type="file"]'), ['d.pdf', 'e.pdf'].map((n) => makePdfFile(n)));
      });
      await advance(100);
      await act(async () => { box().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
      await advance(5000);
      expect(box().getAttribute('data-state')).toBe('saved');
      expect(strip()).toBeNull();
    } finally {
      clickSpy.mockRestore();
      media.restore();
    }
  });

  it('closes the open strip when the window widens past 1024px and gives the rating its slot back', async () => {
    const media = stubMedia(true);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      await act(async () => { container.querySelector('[data-quiet-download]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
      await advance(100);
      expect(strip()).not.toBeNull();
      media.set(false);
      await advance(10);
      expect(strip()).toBeNull();
    } finally {
      clickSpy.mockRestore();
      media.restore();
    }
  });
});
