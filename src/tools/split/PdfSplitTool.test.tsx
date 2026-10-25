// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import fs from 'fs';
import path from 'path';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { recentActions, resetActionTrailForTests } from '../../lib/actionTrail.ts';
import PdfSplitTool from './PdfSplitTool.tsx';
import dropzoneStyles from '../../shell/Dropzone.module.css';
import toolShellStyles from '../../shell/ToolShell.module.css';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import outputNameStyles from '../../shell/OutputName.module.css';
import { workspaceStyles } from '../../shell/pageWorkspace/PageWorkspace.tsx';
import { mockNativeFileShare } from '../../test/mockFileShare.js';
import { setInputFiles } from '../../test/setInputFiles.js';
import { hebrewSplitMessages, hebrewShellMessages } from '../../i18n/toolMessages';

const { lifecycleSpy, editSpy } = vi.hoisted(() => ({ lifecycleSpy: vi.fn(), editSpy: vi.fn() }));
vi.mock('../../lib/productAnalytics.ts', async (importOriginal) => ({
  ...(await importOriginal()),
  reportToolLifecycleEvent: lifecycleSpy,
  reportEdit: editSpy,
}));

const { saveHandoffMock, takeHandoffMock } = vi.hoisted(() => ({
  saveHandoffMock: vi.fn(),
  takeHandoffMock: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('../../lib/drafts/draftStore.js', async (importOriginal) => ({
  ...(await importOriginal()),
  saveHandoff: saveHandoffMock,
  takeHandoff: takeHandoffMock,
}));

const { probeMock, reportErrorMock } = vi.hoisted(() => ({ probeMock: vi.fn(), reportErrorMock: vi.fn() }));
vi.mock('../../lib/pdfEncryption.ts', () => ({ probeEncryption: probeMock }));
vi.mock('../../lib/errorReport.ts', async (importOriginal) => ({
  ...(await importOriginal()),
  reportError: reportErrorMock,
}));

// The page count and the repair are loadPdfWithPages' own tests (src/lib/loadPdfPages.test.ts).
const { mockState, loadMock } = vi.hoisted(() => ({
  mockState: { numPages: 5 },
  loadMock: { fn: null as any },
}));
vi.mock('../../lib/loadPdfPages.ts', () => ({
  loadPdfWithPages: (bytes: ArrayBuffer) => (loadMock.fn
    ? loadMock.fn(bytes)
    : Promise.resolve({ doc: null, pageCount: mockState.numPages, bytes, repaired: false })),
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

// Wraps the real splitPdf so every test still builds real PDFs, and records what it was asked for.
const { splitCalls } = vi.hoisted(() => ({ splitCalls: { calls: [] as any[], fail: false } }));
vi.mock('./split.js', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    splitPdf: (file: File, options: any) => {
      splitCalls.calls.push({ file, options });
      if (splitCalls.fail) return Promise.reject(new Error('split failed'));
      return actual.splitPdf(file, options);
    },
  };
});

// Tests that are not about timing build after 5ms instead of the real 1500ms.
const FAST_QUIET = { baseMs: 5, stepMs: 0, maxMs: 5, burstWindowMs: 1 };
const FIXTURE = path.resolve(__dirname, '../../lib/__fixtures__/num-5.pdf');
const wait = (ms) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

function fixtureFile(name = 'open.pdf') {
  return new File([fs.readFileSync(FIXTURE)], name, { type: 'application/pdf' });
}

describe('PdfSplitTool UI flow', () => {
  let container;

  beforeEach(() => {
    resetActionTrailForTests();
    probeMock.mockReset();
    probeMock.mockResolvedValue('open');
    reportErrorMock.mockClear();
    saveHandoffMock.mockReset();
    saveHandoffMock.mockResolvedValue(true);
    lifecycleSpy.mockClear();
    editSpy.mockClear();
    splitCalls.calls = [];
    splitCalls.fail = false;
    loadMock.fn = null;
    mockState.numPages = 5;
    URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    URL.revokeObjectURL = vi.fn();
    // jsdom's Blob has no arrayBuffer().
    if (!Blob.prototype.arrayBuffer) {
      Blob.prototype.arrayBuffer = function arrayBuffer() {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(this);
        });
      };
    }
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.restoreAllMocks();
  });

  function mount(props = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    // jsdom cannot follow a download link.
    container.addEventListener('click', (e) => { if (e.target.closest?.('a[download]')) e.preventDefault(); });
    act(() => render(<PdfSplitTool quietPolicy={FAST_QUIET} {...props} />, container));
  }
  const pick = async (file) => {
    await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), [file]); });
    await wait(50);
  };
  // A second file asks first (ConfirmDialog); the answer is Replace.
  const replaceWith = async (file) => {
    await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), [file]); });
    const dialog = container.querySelector('dialog[aria-labelledby="confirm-replace-title"]');
    await act(async () => Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Replace file').click());
    await wait(150);
  };
  // Mounts, picks the 5-page fixture and waits for the quiet build.
  async function open(props = {}, name = 'open.pdf') {
    mount(props);
    await pick(fixtureFile(name));
    await wait(150);
  }

  const cells = () => Array.from(container.querySelectorAll('ul[data-page-grid] > li[data-key]'));
  const button = (label) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label);
  const heading = () => container.querySelector('#page-grid-heading');
  const field = () => container.querySelector('#page-selector-input');
  const downloadElement = () => container.querySelector('a[data-state]');
  // By position in the grid: a page's label carries its output number, which shifts when earlier pages are skipped.
  const skipButton = (n) => cells()[n - 1].querySelector('[aria-label^="Skip page"], [aria-label^="Include page"]');
  const isSkipped = (n) => skipButton(n).getAttribute('aria-label').startsWith('Include');
  const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  const radio = (label) => Array.from(container.querySelectorAll('[role="radio"]')).find((r) => r.textContent === label);
  const type = (value) => act(async () => {
    field().value = value;
    field().dispatchEvent(new Event('input', { bubbles: true }));
  });
  const undo = () => click(container.querySelector('[aria-label="Undo last change"]'));
  const redo = () => click(container.querySelector('[aria-label="Redo last undone change"]'));
  const events = (name) => lifecycleSpy.mock.calls.filter(([event]) => event === name).length;

  it('renders initial dropzone', () => {
    mount();
    const dropzone = container.querySelector(`.${dropzoneStyles.dropzone}`);
    expect(dropzone).not.toBeNull();
    expect(dropzone.textContent).toContain('Drop PDF here');
  });

  it('loads the file into the shared grid under a heading that names the output', async () => {
    await open();
    expect(cells().map((c) => c.dataset.key)).toEqual(['0:0', '0:1', '0:2', '0:3', '0:4']);
    expect(heading().textContent).toContain('extracted_open.pdf');
    expect(heading().textContent).toContain('5 pages');
    // The heading names the output, so the shell's own identity row is not shown.
    expect(container.querySelector(`.${toolShellStyles.identity}`)).toBeNull();
    expect(field().value).toBe('1-5');
    expect(container.querySelector('label[for="page-selector-input"]').textContent).toBe('Pages');
    expect(container.querySelector('[role="radiogroup"]').getAttribute('aria-label')).toBe('What to save');
    expect(Array.from(container.querySelectorAll('[role="radiogroup"]')[1].querySelectorAll('[role="radio"]')).map((r) => r.textContent))
      .toEqual(['One PDF', 'One PDF per page']);
    expect(downloadElement().getAttribute('data-state')).toBe('ready');
    expect(downloadElement().textContent).toContain('Download 1 PDF');
    expect(downloadElement().textContent).toContain('5 pages');
    expect(splitCalls.calls.at(-1).options.pageNumbers).toEqual([1, 2, 3, 4, 5]);
  });

  // UX guideline 20: the output choice, then which pages, then Download and hand-offs, Replace file last.
  it('runs the rail in order of consequence, with Replace file last', async () => {
    await open();
    const rail = container.querySelector(`.${workspaceStyles.rail}`);
    const order = Array.from(rail.querySelectorAll('[role="radiogroup"], input, button, a[data-state]'))
      .filter((el) => !el.closest('[role="radiogroup"]') || el.getAttribute('role') === 'radiogroup')
      .map((el) => el.getAttribute('role') || el.id || (el.hasAttribute('data-state') ? 'download' : el.textContent.trim()));
    expect(order.slice(0, 6)).toEqual(['radiogroup', 'page-selector-input', 'Include all', 'Skip all', 'Invert', 'download']);
    expect(order[order.length - 1]).toBe('Replace file');
  });

  it('a skipped tile stays in place, the range follows, and the heading counts it', async () => {
    await open();
    await click(skipButton(2));
    expect(cells().map((c) => c.dataset.key)).toEqual(['0:0', '0:1', '0:2', '0:3', '0:4']);
    expect(isSkipped(2)).toBe(true);
    expect(field().value).toBe('1, 3-5');
    expect(heading().textContent).toContain('4 pages');
    expect(heading().textContent).toContain('1 page skipped');
  });

  it('typing a range skips the other pages, as one Undo step', async () => {
    await open();
    await type('2-3');
    expect([1, 2, 3, 4, 5].map(isSkipped)).toEqual([true, false, false, true, true]);
    expect(heading().textContent).toContain('2 pages');
    await undo();
    expect([1, 2, 3, 4, 5].map(isSkipped)).toEqual([false, false, false, false, false]);
    expect(field().value).toBe('1-5');
    await redo();
    expect(field().value).toBe('2-3');
    expect(recentActions()).toEqual(['add_files', 'select_pages', 'undo', 'redo']);
  });

  it('keeps the selection and shows the error for an invalid range', async () => {
    await open();
    await click(skipButton(1));
    await type('9');
    expect(container.querySelector('[role="alert"]').textContent).toBe('Page number 9 out of range (1-5)');
    expect(isSkipped(1)).toBe(true);
    expect(isSkipped(2)).toBe(false);
    await type('1-');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('Include all, Skip all and Invert are one step each, and none when nothing changes', async () => {
    await open();
    await click(button('Include all'));
    expect(container.querySelector('[aria-label="Undo last change"]').disabled).toBe(true);
    await click(button('Skip all'));
    expect(field().value).toBe('');
    expect(downloadElement().getAttribute('data-state')).toBe('nothing');
    expect(downloadElement().textContent).toContain('Every page is skipped');
    await click(button('Invert'));
    expect(field().value).toBe('1-5');
    await undo();
    expect(downloadElement().getAttribute('data-state')).toBe('nothing');
    await undo();
    expect(downloadElement().getAttribute('data-state')).not.toBe('nothing');
    expect(container.querySelector('[aria-label="Undo last change"]').disabled).toBe(true);
  });

  it('rotating a page is a step and reaches the build as a rotation of that page number', async () => {
    await open();
    await click(container.querySelector('[aria-label="Rotate page 2"]'));
    await wait(100);
    expect(splitCalls.calls.at(-1).options.rotations).toEqual({ 2: 90 });
    expect(isSkipped(2)).toBe(false);
    expect(recentActions()).toEqual(['add_files', 'rotate']);
    expect(container.querySelector('[aria-label="Undo last change"]').disabled).toBe(false);
  });

  it('switching to One PDF per page renames the heading and the Download, and drops the hand-offs', async () => {
    await open();
    expect(button('Compress')).toBeDefined();
    expect(button('Sign')).toBeDefined();
    await click(radio('One PDF per page'));
    await wait(100);
    expect(heading().textContent).toContain('open-page-N.pdf');
    expect(heading().textContent).toContain('5 PDFs');
    expect(heading().querySelector('[contenteditable]')).toBeNull();
    expect(container.querySelector(`.${outputNameStyles.name}`)).toBeNull();
    expect(downloadElement().textContent).toContain('Download 5 PDFs');
    expect(downloadElement().textContent).toContain('1 page each');
    expect(button('Compress')).toBeUndefined();
    expect(button('Sign')).toBeUndefined();
    await click(radio('One PDF'));
    expect(heading().textContent).toContain('extracted_open.pdf');
    expect(button('Compress')).toBeDefined();
  });

  it('One PDF per page builds a file for each kept page only', async () => {
    await open();
    await type('2, 4');
    await click(radio('One PDF per page'));
    await wait(100);
    expect(heading().textContent).toContain('2 PDFs');
    expect(downloadElement().textContent).toContain('Download 2 PDFs');
    expect(splitCalls.calls.at(-1).options.mode).toBe('separate');
    expect(splitCalls.calls.at(-1).options.pageNumbers).toEqual([2, 4]);
  });

  it('Download in One PDF per page saves every part, once each', async () => {
    await open();
    await click(radio('One PDF per page'));
    await wait(100);
    const saved = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function save() { if (this.download) saved.push(this.download); });
    await click(downloadElement());
    await wait(1200);
    expect(saved).toEqual(['open-page-1.pdf', 'open-page-2.pdf', 'open-page-3.pdf', 'open-page-4.pdf', 'open-page-5.pdf']);
    expect(downloadElement().getAttribute('data-state')).toBe('saved');
  });

  it('shares every part as native files in One PDF per page, and offers Share only', async () => {
    const nativeShare = mockNativeFileShare();
    await open();
    await click(radio('One PDF per page'));
    await wait(150);
    const share = button('Share');
    expect(share).toBeDefined();
    await click(share);
    const files = nativeShare.share.mock.calls[0][0].files;
    expect(files.map((f) => f.name)).toEqual(['open-page-1.pdf', 'open-page-2.pdf', 'open-page-3.pdf', 'open-page-4.pdf', 'open-page-5.pdf']);
    nativeShare.restore();
  });

  it('Share appears as soon as the output is ready, not only after a first save', async () => {
    const nativeShare = mockNativeFileShare();
    mount();
    await pick(fixtureFile());
    expect(button('Share')).toBeUndefined();
    await wait(150);
    expect(downloadElement().getAttribute('data-state')).toBe('ready');
    expect(button('Share')).toBeDefined();
    nativeShare.restore();
  });

  describe('the hand-offs in One PDF', () => {
    it.each([['Compress', '/compress/', 'compress'], ['Sign', '/sign/', 'sign']])('%s takes the extracted file', async (label, href, tool) => {
      const navigate = vi.fn();
      await open({ navigate });
      await click(skipButton(1));
      await wait(150);
      await act(async () => { button(label).click(); await new Promise((resolve) => setTimeout(resolve, 50)); });
      expect(saveHandoffMock).toHaveBeenCalledTimes(1);
      expect(saveHandoffMock.mock.calls[0][0]).toBe(tool);
      expect(saveHandoffMock.mock.calls[0][1].fileName).toBe('extracted_open.pdf');
      expect(navigate).toHaveBeenCalledWith(href);
    });
  });

  it('renaming the heading changes the combined file name without a rebuild', async () => {
    await open();
    const builds = splitCalls.calls.length;
    const nameEl = () => container.querySelector(`.${outputNameStyles.name}`);
    expect(nameEl().textContent).toBe('open');
    expect(downloadElement().getAttribute('download')).toBe('extracted_open.pdf');
    await act(async () => { nameEl().dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    await act(async () => { nameEl().textContent = 'chapter two'; });
    await act(async () => {
      nameEl().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    await wait(150);
    expect(heading().textContent).toContain('extracted_chapter two.pdf');
    expect(downloadElement().getAttribute('download')).toBe('extracted_chapter two.pdf');
    expect(splitCalls.calls.length).toBe(builds);
  });

  it('a new file starts over: combined, the source name, a fresh history', async () => {
    await open();
    await click(radio('One PDF per page'));
    await click(skipButton(1));
    await replaceWith(fixtureFile('next.pdf'));
    expect(heading().textContent).toContain('extracted_next.pdf');
    expect(radio('One PDF').getAttribute('aria-checked')).toBe('true');
    expect(container.querySelector('[aria-label="Undo last change"]').disabled).toBe(true);
    expect(field().value).toBe('1-5');
  });

  it('builds from the repaired copy when the page list had to be rebuilt, and keeps the person\'s file for the hand-off', async () => {
    const navigate = vi.fn();
    const repairedBytes = fs.readFileSync(FIXTURE);
    loadMock.fn = (bytes) => Promise.resolve({ doc: null, pageCount: 5, bytes: new Uint8Array(repairedBytes), repaired: true });
    await open({ navigate }, 'broken.pdf');
    const { file } = splitCalls.calls.at(-1);
    expect(file.name).toBe('broken.pdf');
    await act(async () => { button('Compress').click(); await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(saveHandoffMock.mock.calls[0][1].fileName).toBe('extracted_broken.pdf');
  });

  it('skips a file that is not a PDF with a note, in Hebrew only isolated', async () => {
    const note = async (props) => {
      mount(props);
      await act(async () => {
        setInputFiles(container.querySelector('input[type="file"]'), [new File(['plain text'], '2025-notes.txt', { type: 'text/plain' })]);
      });
      return container.querySelector(`.${pdfToolStyles['hint-message']}`).textContent;
    };
    expect(await note({ messages: hebrewSplitMessages })).toContain('⁨2025-notes.txt⁩');
    act(() => render(null, container));
    container.remove();
    const english = await note({});
    expect(english).toContain('2025-notes.txt');
    expect(english).not.toContain('⁨');
  });

  describe.each(['needs-password', 'owner-restricted'])('a %s PDF (DEBT-41)', (protection) => {
    it('shows NeedsUnlock, never builds, reports nothing, and is not a failed operation (DEBT-44)', async () => {
      probeMock.mockResolvedValue(protection);
      mount();
      await pick(fixtureFile('locked.pdf'));
      await wait(150);
      expect(container.textContent).toContain(protection === 'needs-password' ? 'This PDF has a password' : 'This PDF is protected');
      expect(button('Unlock it')).toBeDefined();
      expect(cells()).toHaveLength(0);
      expect(downloadElement()).toBeNull();
      expect(splitCalls.calls).toHaveLength(0);
      expect(reportErrorMock).not.toHaveBeenCalled();
      expect(events('tool_operation_failed')).toBe(0);
    });
  });

  it('ignores a load that was replaced before it finished (DEBT-18)', async () => {
    let releaseFirst;
    let call = 0;
    loadMock.fn = (bytes) => {
      call += 1;
      if (call === 1) {
        return new Promise((resolve) => { releaseFirst = () => resolve({ doc: null, pageCount: 300, bytes, repaired: false }); });
      }
      return Promise.resolve({ doc: null, pageCount: 3, bytes, repaired: false });
    };
    mount();
    await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), [fixtureFile('three-hundred.pdf')]); });
    await wait(20);
    expect(releaseFirst).toBeDefined();
    mockState.numPages = 3;
    await replaceWith(fixtureFile('three.pdf'));
    await act(async () => { releaseFirst(); await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(cells()).toHaveLength(3);
    expect(field().value).toBe('1-3');
    expect(heading().textContent).toContain('extracted_three.pdf');
  });

  it('a build that fails says so on the Download element and counts as a failed operation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    splitCalls.fail = true;
    mount();
    await pick(fixtureFile());
    await act(async () => { downloadElement().dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    await wait(150);
    expect(downloadElement().getAttribute('data-state')).toBe('error');
    expect(container.querySelector('[role="alert"] a[href="/unlock/"]')).not.toBeNull();
    expect(reportErrorMock).toHaveBeenCalledWith('pdf_tool_run', expect.any(Error), 'prepare_split');
    expect(events('tool_operation_failed')).toBe(1);
  });

  it('a load failure still offers Replace file, which asks first', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    loadMock.fn = () => Promise.reject(new Error('boom'));
    mount();
    await pick(fixtureFile());
    await wait(150);
    expect(button('Replace file')).toBeDefined();
    await click(button('Replace file'));
    expect(container.querySelector('dialog[aria-labelledby="confirm-replace-title"]').open).toBe(true);
  });

  it.each([
    ['needs-password', 'protectedNeedsPasswordTitle'],
    ['owner-restricted', 'protectedOwnerOnlyTitle'],
  ])('shows the Hebrew protected-file copy for a %s PDF', async (protection, titleKey) => {
    probeMock.mockResolvedValue(protection);
    mount({ messages: hebrewSplitMessages, shellMessages: hebrewShellMessages });
    await pick(fixtureFile('locked.pdf'));
    await wait(150);
    expect(container.textContent).toContain(hebrewSplitMessages[titleKey]);
    expect(container.textContent).toContain(hebrewSplitMessages.protectedUnlockIt);
    expect(container.textContent).not.toContain('This PDF');
  });

  it('counts skipped pages with the catalogue\'s own plural, in Hebrew too', async () => {
    await open({ messages: hebrewSplitMessages, shellMessages: hebrewShellMessages });
    const skipHe = (n) => click(cells()[n - 1].querySelector('[aria-label^="דילוג על עמוד"]'));
    await skipHe(1);
    expect(heading().textContent).toContain('עמוד אחד נסתר');
    await skipHe(2);
    await skipHe(3);
    expect(heading().textContent).toContain('3 עמודים נסתרים');
  });

  it('counts a document that fails to load as a failed operation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    loadMock.fn = () => Promise.reject(new Error('boom'));
    mount();
    await pick(fixtureFile());
    await wait(150);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(events('tool_operation_failed')).toBe(1);
  });

  describe('usage events (DEBT-46)', () => {
    it('reports no start for the background prepare after a change', async () => {
      await open();
      await click(skipButton(1));
      await wait(150);
      await click(radio('One PDF per page'));
      await wait(150);
      expect(downloadElement().getAttribute('data-state')).toBe('ready');
      expect(events('tool_operation_started')).toBe(0);
      expect(events('tool_result_ready')).toBe(0);
    });

    it('reports an edit when the person changes a page or the mode, not on arrival (DEBT-58)', async () => {
      await open();
      expect(editSpy).not.toHaveBeenCalled();
      await click(skipButton(1));
      expect(editSpy).toHaveBeenCalledWith('split');
      editSpy.mockClear();
      await type('1-2');
      expect(editSpy).toHaveBeenCalledWith('split');
      editSpy.mockClear();
      await click(radio('One PDF per page'));
      expect(editSpy).toHaveBeenCalledWith('split');
    });

    it('reports started then ready for a Download tap, again after a change', async () => {
      await open();
      await click(downloadElement());
      await wait(50);
      expect(events('tool_operation_started')).toBe(1);
      expect(events('tool_result_ready')).toBe(1);
      await click(skipButton(1));
      await wait(150);
      expect(events('tool_operation_started')).toBe(1);
      await click(downloadElement());
      await wait(50);
      expect(events('tool_operation_started')).toBe(2);
      expect(events('tool_result_ready')).toBe(2);
    });

    it('reports started at a tap while preparing and ready once the queued download is delivered', async () => {
      await open({ quietPolicy: undefined });
      // Quiet means quiet: the build is silent until the person taps.
      expect(downloadElement().getAttribute('data-state')).toBe('ready');
      await click(downloadElement());
      expect(downloadElement().getAttribute('data-state')).toBe('preparing');
      expect(events('tool_operation_started')).toBe(1);
      expect(events('tool_result_ready')).toBe(0);
      await wait(250);
      expect(downloadElement().getAttribute('data-state')).toBe('saved');
      expect(events('tool_result_ready')).toBe(1);
    });

    it('shares the result from the finish row', async () => {
      const nativeShare = mockNativeFileShare();
      await open();
      await click(button('Share'));
      await wait(50);
      expect(nativeShare.share).toHaveBeenCalled();
      nativeShare.restore();
    });
  });

  describe('Hebrew (LOC)', () => {
    const hebrew = { messages: hebrewSplitMessages, shellMessages: hebrewShellMessages };

    it('renders every control from the messages prop', async () => {
      await open(hebrew);
      const text = container.textContent;
      expect(text).toContain(hebrewSplitMessages.modeCombined);
      expect(text).toContain(hebrewSplitMessages.modeSeparate);
      expect(text).toContain(hebrewSplitMessages.includeAll);
      expect(text).not.toContain('Include all');
      expect(text).not.toContain('One PDF');
      expect(downloadElement().textContent).toContain(hebrewSplitMessages.downloadLabel);
      expect(field().getAttribute('dir')).toBe('ltr');
      expect(field().getAttribute('placeholder')).toBe(hebrewSplitMessages.pageSelectorPlaceholder);
      expect(container.querySelector('[aria-label="סיבוב עמוד 1"]')).not.toBeNull();
    });

    it('isolates the size in the detail line, and only in Hebrew', async () => {
      await open(hebrew);
      expect(downloadElement().textContent).toMatch(/⁦[^⁦⁩]*\d[^⁦⁩]*⁩/);
      act(() => render(null, container));
      container.remove();
      await open({});
      expect(downloadElement().textContent).not.toContain('⁦');
    });

    it('keeps the file name pattern whole and LTR in One PDF per page', async () => {
      await open(hebrew);
      await click(radio(hebrewSplitMessages.modeSeparate));
      expect(Array.from(heading().querySelectorAll('bdi[dir="ltr"]')).some((b) => b.textContent === 'open-page-N.pdf')).toBe(true);
    });

    it('shows a Hebrew page-range error', async () => {
      await open(hebrew);
      await type('9');
      expect(container.querySelector('[role="alert"]').textContent).toBe('עמוד 9 מחוץ לטווח (1-5)');
    });
  });
});
