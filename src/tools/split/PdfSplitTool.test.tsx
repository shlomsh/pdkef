// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import fs from 'fs';
import path from 'path';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { getPdfLib } from '../../lib/pdfLib.js';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { recentActions } from '../../lib/actionTrail.ts';
import PdfSplitTool from './PdfSplitTool.tsx';
import dropzoneStyles from '../../shell/Dropzone.module.css';
import toolShellStyles from '../../shell/ToolShell.module.css';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import outputNameStyles from '../../shell/OutputName.module.css';
import { workspaceStyles } from '../../shell/pageWorkspace/PageWorkspace.tsx';
import { mockNativeFileShare } from '../../test/support/mockFileShare.js';
import { noPagesKey } from '../../test/support/pdfPageTreeFixtures.ts';
import { installToolHarness, type ToolHarness } from '../../test/harness/toolHarness.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { until } from '../../test/support/until.js';
import { waitUntil } from '../../test/harness/waitUntil.ts';
import { hebrewSplitMessages } from './messages';
import { hebrewShellMessages } from '../../shell/shellMessages';

// The pdf.js edge (the encryption probe, the thumbnail source) is the harness's: harness.pdfjs. Everything else
// (analytics, error reports, draftStore, loadPdfPages, splitPdf) runs for real over it.

// Not a fake: loadPdfWithPages still runs for real. The gate only lets one test hold a load open
// between the pick and the page count, which a real pdf-lib parse gives no way to pause (DEBT-18).
const { loadGate } = vi.hoisted(() => ({ loadGate: { before: null as null | ((bytes: ArrayBuffer) => Promise<void>) } }));
vi.mock('../../lib/loadPdfPages.ts', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    loadPdfWithPages: async (bytes: ArrayBuffer) => {
      await loadGate.before?.(bytes);
      return actual.loadPdfWithPages(bytes);
    },
  };
});

// Tests that are not about timing build after 5ms instead of the real 1500ms.
const FAST_QUIET = { baseMs: 5, stepMs: 0, maxMs: 5, burstWindowMs: 1 };
const FIXTURES = path.resolve(__dirname, '../../lib/__fixtures__');
const FIXTURE = path.join(FIXTURES, 'num-5.pdf');
const wait = (ms) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

function fixtureFile(name = 'open.pdf', fixture = FIXTURE) {
  return new File([fs.readFileSync(fixture)], name, { type: 'application/pdf' });
}

describe('PdfSplitTool UI flow', () => {
  let container;
  let harness: ToolHarness;

  beforeEach(() => {
    harness = installToolHarness();
    loadGate.before = null;
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
    harness.restore();
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
    await harness.flush();
  };
  // A second file asks first (ConfirmDialog); the answer is Replace.
  const replaceWith = async (file) => {
    await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), [file]); });
    const dialog = container.querySelector('dialog[aria-labelledby="confirm-replace-title"]');
    await act(async () => Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Replace file').click());
    await until(() => cells().length > 0);
  };
  // Mounts, picks the 5-page fixture and waits for the quiet build.
  async function open(props = {}, name = 'open.pdf') {
    mount(props);
    await pick(fixtureFile(name));
    await until(() => cells().length > 0 && downloadElement()?.getAttribute('data-state') === 'ready' && ('quietPolicy' in props || harness.createdBlobs().length > 0));
  }

  const cells = () => Array.from(container.querySelectorAll('ul[data-page-grid] > li[data-key]'));
  const button = (label) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label);
  const heading = () => container.querySelector('#page-grid-heading');
  const field = () => container.querySelector('#page-selector-input');
  const downloadElement = () => container.querySelector('a[data-state]');
  // By position in the grid: a page's label carries its output number, which shifts when earlier pages are skipped.
  const skipButton = (n) => cells()[n - 1].querySelector('[aria-label^="Skip page"], [aria-label^="Include page"]');
  const isSkipped = (n) => skipButton(n).getAttribute('aria-label').startsWith('Include');
  const click = async (el) => {
    await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await harness.flush();
  };
  const radio = (label) => Array.from(container.querySelectorAll('[role="radio"]')).find((r) => r.textContent === label);
  const type = async (value) => {
    await act(async () => {
      field().value = value;
      field().dispatchEvent(new Event('input', { bubbles: true }));
    });
    await harness.flush();
  };
  const undo = () => click(container.querySelector('[aria-label="Undo last change"]'));
  const redo = () => click(container.querySelector('[aria-label="Redo last undone change"]'));
  // Beacons are read asynchronously: flush first so a zero count cannot pass before they landed.
  const events = async (name) => { await harness.flush(); return harness.usageEvents(name).length; };
  // What a built blob holds: its pages in order, with each one's rotation and width.
  const pagesOf = async (blob: Blob) => {
    const { PDFDocument } = await getPdfLib();
    const doc = await PDFDocument.load(await blob.arrayBuffer());
    return { count: doc.getPageCount(), rotations: doc.getPages().map((p) => p.getRotation().angle), widths: doc.getPages().map((p) => p.getWidth()) };
  };
  // The output the Download element points at (One PDF).
  const shownOutput = () => harness.blobForUrl(downloadElement().getAttribute('href'));
  // Waits for the build of a plan that keeps `n` pages to be shown as ready.
  const builtWith = (n: number) => until(() => downloadElement()?.getAttribute('data-state') === 'ready' && downloadElement().textContent.includes(`${n} pages`) && shownOutput());
  // The file names One PDF per page saves, and the blobs behind them, once Download is tapped.
  const savePartsOf = async (count: number) => {
    const saved: { name: string; href: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function save() { if (this.download) saved.push({ name: this.download, href: this.href }); });
    await click(downloadElement());
    await until(() => saved.length === count && downloadElement()?.getAttribute('data-state') === 'saved');
    return saved;
  };

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
    expect((await pagesOf(shownOutput())).count).toBe(5);
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

  it('offers Replace file once, as the shared quiet last line, at every width', async () => {
    await open();
    const replaces = Array.from(container.querySelectorAll('button')).filter((b) => b.textContent.trim().startsWith('Replace'));
    expect(replaces).toHaveLength(1);
    expect(replaces[0].closest('[data-replace-line]')).not.toBeNull();
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
    await until(() => downloadElement()?.getAttribute('data-state') === 'ready' && harness.createdBlobs().length === 2);
    expect((await pagesOf(shownOutput())).rotations).toEqual([0, 90, 0, 0, 0]);
    expect(isSkipped(2)).toBe(false);
    expect(recentActions()).toEqual(['add_files', 'rotate']);
    expect(container.querySelector('[aria-label="Undo last change"]').disabled).toBe(false);
  });

  it('switching to One PDF per page renames the heading and the Download, and drops the hand-offs', async () => {
    await open();
    expect(button('Compress')).toBeDefined();
    expect(button('Sign')).toBeDefined();
    await click(radio('One PDF per page'));
    await until(() => downloadElement()?.textContent.includes('1 page each'));
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
    await until(() => downloadElement()?.getAttribute('data-state') === 'ready' && downloadElement()?.textContent.includes('Download 2 PDFs'));
    expect(heading().textContent).toContain('2 PDFs');
    expect(downloadElement().textContent).toContain('Download 2 PDFs');
    // Separate mode saves one named, one-page file per kept page number.
    const saved = await savePartsOf(2);
    expect(saved.map((part) => part.name)).toEqual(['open-page-2.pdf', 'open-page-4.pdf']);
    expect(await Promise.all(saved.map(async (part) => (await pagesOf(harness.blobForUrl(part.href))).count))).toEqual([1, 1]);
  });

  it('Download in One PDF per page saves every part, once each', async () => {
    await open();
    await click(radio('One PDF per page'));
    await until(() => downloadElement()?.textContent.includes('Download 5 PDFs'));
    const saved = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function save() { if (this.download) saved.push(this.download); });
    await click(downloadElement());
    await until(() => saved.length === 5 && downloadElement()?.getAttribute('data-state') === 'saved');
    expect(saved).toEqual(['open-page-1.pdf', 'open-page-2.pdf', 'open-page-3.pdf', 'open-page-4.pdf', 'open-page-5.pdf']);
    expect(downloadElement().getAttribute('data-state')).toBe('saved');
  });

  it('shares every part as native files in One PDF per page, and offers Share only', async () => {
    const nativeShare = mockNativeFileShare();
    await open();
    await click(radio('One PDF per page'));
    await until(() => button('Share'));
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
    await until(() => downloadElement()?.getAttribute('data-state') === 'ready' && button('Share'));
    expect(downloadElement().getAttribute('data-state')).toBe('ready');
    expect(button('Share')).toBeDefined();
    nativeShare.restore();
  });

  describe('the hand-offs in One PDF', () => {
    it.each([['Compress', '/compress/', 'compress'], ['Sign', '/sign/', 'sign']])('%s takes the extracted file', async (label, href, tool) => {
      const navigate = vi.fn();
      await open({ navigate });
      await click(skipButton(1));
      await builtWith(4);
      await act(async () => { button(label).click(); });
      await waitUntil(() => expect(navigate).toHaveBeenCalledWith(href));
      // Parked under the target tool's own key, and under no other.
      const otherTool = tool === 'compress' ? 'sign' : 'compress';
      expect(await harness.takeHandoff(otherTool)).toBeNull();
      const handoff = await harness.takeHandoff(tool);
      expect(handoff?.fileName).toBe('extracted_open.pdf');
      expect((await pagesOf(new Blob([handoff.fileBytes]))).count).toBe(4);
      expect(navigate).toHaveBeenCalledWith(href);
    });
  });

  it('renaming the heading changes the combined file name without a rebuild', async () => {
    await open();
    const builds = harness.createdBlobs().length;
    const nameEl = () => container.querySelector(`.${outputNameStyles.name}`);
    expect(nameEl().textContent).toBe('open');
    expect(downloadElement().getAttribute('download')).toBe('extracted_open.pdf');
    await act(async () => { nameEl().dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    await act(async () => { nameEl().textContent = 'chapter two'; });
    await act(async () => {
      nameEl().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    await until(() => heading()?.textContent.includes('extracted_chapter two.pdf'));
    expect(heading().textContent).toContain('extracted_chapter two.pdf');
    expect(downloadElement().getAttribute('download')).toBe('extracted_chapter two.pdf');
    expect(harness.createdBlobs().length).toBe(builds);
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
    // A catalog that lost its page list: only the repair finds the three pages (widths 200, 300, 400).
    mount({ navigate });
    await pick(new File([noPagesKey()], 'broken.pdf', { type: 'application/pdf' }));
    await until(() => cells().length > 0 && downloadElement()?.getAttribute('data-state') === 'ready' && harness.createdBlobs().length > 0);
    expect(cells()).toHaveLength(3);
    expect((await pagesOf(shownOutput())).widths).toEqual([200, 300, 400]);
    await act(async () => { button('Compress').click(); });
    await waitUntil(() => expect(navigate).toHaveBeenCalled());
    const handoff = await harness.takeHandoff('compress');
    expect(handoff?.fileName).toBe('extracted_broken.pdf');
    expect((await pagesOf(new Blob([handoff.fileBytes]))).widths).toEqual([200, 300, 400]);
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
      harness.pdfjs.probeAs(protection);
      mount();
      await pick(fixtureFile('locked.pdf'));
      await until(() => button('Unlock it'));
      expect(container.textContent).toContain(protection === 'needs-password' ? 'This PDF has a password' : 'This PDF is protected');
      expect(button('Unlock it')).toBeDefined();
      expect(cells()).toHaveLength(0);
      expect(downloadElement()).toBeNull();
      expect(harness.createdBlobs()).toHaveLength(0);
      await harness.flush();
      expect(harness.reports()).toEqual([]);
      expect(await events('tool_operation_failed')).toBe(0);
    });
  });

  it('ignores a load that was replaced before it finished (DEBT-18)', async () => {
    let releaseFirst;
    let call = 0;
    // The first load (five pages) is held open; the replacement (three pages) is not.
    loadGate.before = () => {
      call += 1;
      return call === 1 ? new Promise<void>((resolve) => { releaseFirst = resolve; }) : Promise.resolve();
    };
    mount();
    await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), [fixtureFile('five.pdf')]); });
    await until(() => releaseFirst);
    expect(releaseFirst).toBeDefined();
    await replaceWith(fixtureFile('three.pdf', path.join(FIXTURES, 'three-page-header.pdf')));
    await act(async () => { releaseFirst(); await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(cells()).toHaveLength(3);
    expect(field().value).toBe('1-3');
    expect(heading().textContent).toContain('extracted_three.pdf');
  });

  it('a build that fails says so on the Download element and counts as a failed operation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // The probe calls this owner-only file open (no unlock offered), so the split itself refuses it.
    mount();
    await pick(fixtureFile('locked.pdf', path.join(FIXTURES, 'encrypted/owner-only.pdf')));
    await act(async () => { downloadElement().dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    await until(() => downloadElement()?.getAttribute('data-state') === 'error');
    await harness.flush();
    expect(downloadElement().getAttribute('data-state')).toBe('error');
    expect(container.querySelector('[role="alert"] a[href="/unlock/"]')).not.toBeNull();
    expect(harness.reports()).toMatchObject([{ area: 'pdf_tool_run', step: 'prepare_split', type: 'Error' }]);
    expect(await events('tool_operation_failed')).toBe(1);
  });

  it('a load failure still offers Replace file, which asks first', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mount();
    await pick(new File(['this is not a PDF'], 'broken.pdf', { type: 'application/pdf' }));
    await until(() => button('Replace file'));
    expect(button('Replace file')).toBeDefined();
    await click(button('Replace file'));
    expect(container.querySelector('dialog[aria-labelledby="confirm-replace-title"]').open).toBe(true);
  });

  it.each([
    ['needs-password', 'protectedNeedsPasswordTitle'],
    ['owner-restricted', 'protectedOwnerOnlyTitle'],
  ])('shows the Hebrew protected-file copy for a %s PDF', async (protection, titleKey) => {
    harness.pdfjs.probeAs(protection);
    mount({ messages: hebrewSplitMessages, shellMessages: hebrewShellMessages });
    await pick(fixtureFile('locked.pdf'));
    await until(() => container.textContent.includes(hebrewSplitMessages.protectedUnlockIt));
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
    mount();
    await pick(new File(['this is not a PDF'], 'broken.pdf', { type: 'application/pdf' }));
    await until(() => container.querySelector('[role="alert"]'));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(await events('tool_operation_failed')).toBe(1);
  });

  describe('usage events (DEBT-46)', () => {
    it('reports no start for the background prepare after a change', async () => {
      await open();
      await click(skipButton(1));
      await builtWith(4);
      await click(radio('One PDF per page'));
      await until(() => downloadElement()?.getAttribute('data-state') === 'ready' && downloadElement()?.textContent.includes('1 page each'));
      expect(downloadElement().getAttribute('data-state')).toBe('ready');
      expect(await events('tool_operation_started')).toBe(0);
      expect(await events('tool_result_ready')).toBe(0);
    });

    it('reports an edit when the person changes a page or the mode, not on arrival (DEBT-58)', async () => {
      // A first edit is sent once per accepted file, so each kind of change starts from a fresh page load.
      const firstEdits = () => harness.usageEvents('tool_first_edit').map((event) => event.properties.tool);
      const freshOpen = async () => {
        act(() => render(null, container));
        container.remove();
        harness.resetUsage();
        harness.clearBeacons();
        await open();
        await harness.flush();
      };
      await open();
      await harness.flush();
      expect(firstEdits()).toEqual([]);
      await click(skipButton(1));
      expect(firstEdits()).toEqual(['split']);
      await freshOpen();
      expect(firstEdits()).toEqual([]);
      await type('1-2');
      expect(firstEdits()).toEqual(['split']);
      await freshOpen();
      expect(firstEdits()).toEqual([]);
      await click(radio('One PDF per page'));
      expect(firstEdits()).toEqual(['split']);
    });

    it('reports started then ready for a Download tap, again after a change', async () => {
      await open();
      await click(downloadElement());
      await until(() => harness.usageEvents('tool_result_ready').length === 1);
      expect(await events('tool_operation_started')).toBe(1);
      expect(await events('tool_result_ready')).toBe(1);
      await click(skipButton(1));
      await builtWith(4);
      expect(await events('tool_operation_started')).toBe(1);
      await click(downloadElement());
      await until(() => harness.usageEvents('tool_result_ready').length === 2);
      expect(await events('tool_operation_started')).toBe(2);
      expect(await events('tool_result_ready')).toBe(2);
    });

    it('reports started at a tap while preparing and ready once the queued download is delivered', async () => {
      await open({ quietPolicy: undefined });
      // Quiet means quiet: the build is silent until the person taps.
      expect(downloadElement().getAttribute('data-state')).toBe('ready');
      await click(downloadElement());
      expect(downloadElement().getAttribute('data-state')).toBe('preparing');
      expect(await events('tool_operation_started')).toBe(1);
      expect(await events('tool_result_ready')).toBe(0);
      await until(() => downloadElement()?.getAttribute('data-state') === 'saved');
      expect(downloadElement().getAttribute('data-state')).toBe('saved');
      expect(await events('tool_result_ready')).toBe(1);
    });

    it('shares the result from the finish row', async () => {
      const nativeShare = mockNativeFileShare();
      await open();
      await click(button('Share'));
      await until(() => nativeShare.share.mock.calls.length > 0);
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
