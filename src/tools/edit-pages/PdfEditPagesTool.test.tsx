// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import PdfEditPagesTool from './PdfEditPagesTool.tsx';
import { getPdfLib } from '../../lib/pdfLib.js';
import { saveHandoff } from '../../lib/drafts/draftStore.ts';
import { mockNativeFileShare } from '../../test/support/mockFileShare.js';
import { healthy, ORIGINAL_WIDTHS } from '../../test/support/pdfPageTreeFixtures.ts';
import { installToolHarness } from '../../test/harness/toolHarness.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { until } from '../../test/support/until.js';
import { waitUntil } from '../../test/harness/waitUntil.ts';

// The pdf.js edge (the encryption probe, the thumbnail source) is the harness's: harness.pdfjs.
// Everything else (errorReport, draftStore, loadPdfWithPages, editPages) runs for real over it.

// A real three-page PDF whose pages are told apart by width (200, 300, 400).
function makePdfFile(name, bytes = healthy()) {
  return new File([bytes], name, { type: 'application/pdf' });
}
const encryptedFixture = (name) => readFileSync(path.resolve(__dirname, `../../lib/__fixtures__/encrypted/${name}.pdf`));
// What a built blob holds: its pages' widths in order, their rotations, and whether each carries a font (a page number).
const pagesOf = async (blob) => {
  const { PDFDocument, PDFName } = await getPdfLib();
  const doc = await PDFDocument.load(await blob.arrayBuffer());
  return {
    count: doc.getPageCount(),
    widths: doc.getPages().map((p) => p.getWidth()),
    rotations: doc.getPages().map((p) => p.getRotation().angle),
    fonts: doc.getPages().map((p) => Boolean(p.node.Resources()?.lookup(PDFName.of('Font')))),
  };
};

const flush = (ms = 50) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

describe('PdfEditPagesTool UI flow', () => {
  let container;
  let harness;

  beforeEach(() => {
    harness = installToolHarness();
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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    harness.restore();
  });

  it('lists the files it skipped, as Split does', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const note = () => container.querySelector('[role="status"]')?.textContent;
    act(() => { render(<PdfEditPagesTool />, container); });
    const input = () => container.querySelector('input[type="file"]');
    await act(async () => { setInputFiles(input(), [new File(['x'], '2025-notes.txt', { type: 'text/plain' })]); });
    expect(note()).toBe('Skipped “2025-notes.txt” - not a PDF.');
    await act(async () => {
      setInputFiles(input(), [new File(['x'], 'a.txt', { type: 'text/plain' }), new File(['y'], 'b.txt', { type: 'text/plain' })]);
    });
    expect(note()).toBe('Skipped 2 files - not PDFs.');
  });

  async function load(name = 'document.pdf', bytes = healthy()) {
    container = document.createElement('div');
    document.body.appendChild(container);
    // jsdom cannot follow a download link.
    container.addEventListener('click', (e) => e.preventDefault());
    act(() => { render(<PdfEditPagesTool />, container); });
    await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), [makePdfFile(name, bytes)]); });
    await until(() => cells().length > 0);
  }

  const cells = () => Array.from(container.querySelectorAll('ul[data-page-grid] > li[data-key]'));
  const button = (label) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label);
  const heading = () => container.querySelector('#page-grid-heading');
  const skipButton = (number) => container.querySelector(`[aria-label="Skip page ${number}"], [aria-label="Include page ${number}"]`);
  // The rail's Download element, the one with a state; the phone bar's quiet button has none.
  const downloadElement = () => container.querySelector('a[data-state]');
  // A pointer on the Download element asks for the build now instead of after the quiet wait.
  // It settles once the built file is on the element; a test that holds the build open passes settles = false.
  const prepareNow = async (settles = true, gate = null) => {
    await act(async () => { downloadElement().dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    await until(() => (settles ? downloadElement()?.getAttribute('href') || downloadElement()?.dataset.state === 'error' : gate.started));
  };
  // Not a fake: the build still runs for real. The gate holds the NEXT build open right after it has started
  // (a real pdf-lib run gives no way to pause it), so a test can supersede it while it is in flight.
  const holdNextBuild = async () => {
    const { PDFDocument } = await getPdfLib();
    const create = PDFDocument.create;
    const gate = { started: false, release: () => {} };
    vi.spyOn(PDFDocument, 'create').mockImplementationOnce(async (...args) => {
      gate.started = true;
      await new Promise((resolve) => { gate.release = resolve; });
      return create.apply(PDFDocument, args);
    });
    return gate;
  };
  // The output the Download element points at.
  const shownOutput = () => harness.blobForUrl(downloadElement().getAttribute('href'));

  it('skipping every page says so on the Download element, not that it is preparing', async () => {
    await load();
    await click(button('Skip all'));
    await until(() => downloadElement()?.getAttribute('data-state') === 'nothing');
    expect(downloadElement().getAttribute('data-state')).toBe('nothing');
    expect(downloadElement().textContent).toContain('Every page is skipped');
    expect(downloadElement().textContent).not.toContain('Preparing 0');
  });

  it('renders the initial file dropper zone', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { render(<PdfEditPagesTool />, container); });

    const dropzone = container.querySelector('[data-dropzone]');
    expect(dropzone).not.toBeNull();
    expect(dropzone.textContent).toContain('Drop PDF here');
  });

  it.each([
    [undefined, 4, 0],
    ['rotate', 3, 0],
    ['remove', 4, 0],
    ['numbers', 3, 3],
  ])('shows the empty-state verb for its page job (%s)', (job, pages, numbers) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { render(<PdfEditPagesTool job={job} />, container); });

    const stage = container.querySelector('[data-dropzone] [aria-hidden="true"]');
    expect(stage.querySelectorAll('i').length).toBe(pages);
    expect(stage.querySelectorAll('i > b').length).toBe(numbers);
  });

  it('loads the PDF into the shared grid under a heading that names the output and its pages', async () => {
    await load();

    expect(cells().map((c) => c.dataset.key)).toEqual(['0:0', '0:1', '0:2']);
    expect(heading().textContent).toContain('document_modified.pdf');
    expect(heading().textContent).toContain('3 pages');
    // The heading names the file, so the shell's own identity row is not shown.
    expect(container.querySelector('[data-file-identity]')).toBeNull();
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
    await until(() => !container.textContent.includes('Loading PDF file structure'));
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
    const rail = container.querySelector('[data-rail]');
    const order = Array.from(rail.querySelectorAll('input, button, a[data-state]'))
      .map((el) => (el.hasAttribute('data-state') ? 'download' : (el as HTMLInputElement).type === 'checkbox' ? 'page numbers' : el.textContent.trim()));
    expect(order.slice(0, 5)).toEqual(['page numbers', 'Include all', 'Skip all', 'Invert', 'download']);
    expect(order[order.length - 1]).toBe('Replace file');
  });

  it('offers Replace file once, as the shared quiet last line, at every width', async () => {
    await load();
    const replaces = Array.from(container.querySelectorAll('button')).filter((b) => b.textContent.trim().startsWith('Replace'));
    expect(replaces).toHaveLength(1);
    expect(replaces[0].closest('[data-replace-line]')).not.toBeNull();
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
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // The probe calls this owner-only file open (no unlock offered), so the build itself refuses it.
    await load('document.pdf', encryptedFixture('owner-only'));
    await click(skipButton(2));
    await prepareNow();
    await harness.flush();

    const alert = container.querySelector('[role="alert"]');
    expect(alert.querySelector('a[href="/unlock/"]')).not.toBeNull();
    expect(downloadElement().dataset.state).toBe('error');
    expect(harness.reports()).toMatchObject([{ area: 'pdf_tool_run', step: 'apply_page_edits', type: 'Error' }]);
  });

  it('builds the edited PDF from the plan and offers it as a download under the output name', async () => {
    await load();
    await click(skipButton(2));
    await prepareNow();

    expect(harness.createdBlobs()).toHaveLength(1);
    const link = downloadElement();
    // Page 2 is removed, the others stay in order (told apart by width), nothing is rotated or numbered.
    expect(await pagesOf(shownOutput())).toEqual({
      count: 2, widths: [ORIGINAL_WIDTHS[0], ORIGINAL_WIDTHS[2]], rotations: [0, 0], fonts: [false, false],
    });
    expect(link.dataset.state).toBe('ready');
    expect(link.getAttribute('download')).toBe('document_modified.pdf');
    expect(link.textContent).toContain('Download edited PDF');
  });

  it('Add page numbers is part of the build', async () => {
    await load();
    await click(container.querySelector('input[type="checkbox"]'));
    await prepareNow();
    expect(await pagesOf(shownOutput())).toMatchObject({ count: 3, widths: ORIGINAL_WIDTHS, fonts: [true, true, true] });
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

    const share = Array.from(container.querySelectorAll("[data-count] button")).find((b) => b.textContent.includes("Share"));
    expect(share).toBeTruthy();
    await act(async () => share.click());
    expect(nativeShare.share.mock.calls[0][0].files[0].name).toBe('document_modified.pdf');
    nativeShare.restore();
  });

  it('the rail hands the result to Compress and parks its bytes', async () => {
    await load();
    await prepareNow();
    const compress = Array.from(container.querySelectorAll("[data-count] button")).find((b) => b.textContent === "Compress");
    vi.stubGlobal('location', { href: '/organize-pdf/' });
    await act(async () => { compress.click(); });
    await waitUntil(() => expect(window.location.href).toBe('/compress/'));
    const handoff = await harness.takeHandoff('compress');
    expect(handoff).toMatchObject({ fileName: 'document_modified.pdf', fileType: 'application/pdf' });
    expect(await pagesOf(new Blob([handoff.fileBytes]))).toMatchObject({ count: 3, widths: ORIGINAL_WIDTHS });
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
    await saveHandoff('edit-pdf', { fileName: 'handed.pdf', fileType: 'application/pdf', fileBytes: healthy().buffer });
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { render(<PdfEditPagesTool />, container); });
    await until(() => cells().length === 3);
    // The hand-off was collected: nothing is left parked for the next visit.
    expect(await harness.takeHandoff('edit-pdf')).toBeNull();
    expect(heading().textContent).toContain('handed_modified.pdf');
    expect(cells().length).toBe(3);
  });

  // Picking another file through the Replace dialog, as a person does.
  const replaceWith = async (file) => {
    await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), [file]); });
    const dialog = container.querySelector('dialog[aria-labelledby="confirm-replace-title"]');
    await act(async () => Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Replace file').click());
    await until(() => cells().length > 0 && !container.textContent.includes('Loading PDF file structure'));
  };

  it('replacing the file drops a Download tapped before the build landed', async () => {
    await load('a.pdf');
    const first = await holdNextBuild();
    await prepareNow(false, first);
    await click(downloadElement());
    expect(downloadElement().dataset.state).toBe('preparing');

    await replaceWith(makePdfFile('b.pdf'));
    await prepareNow();
    expect(downloadElement().dataset.state).toBe('ready');
    first.release();
  });

  it('renaming the output keeps the built PDF: no rebuild, still ready', async () => {
    await load();
    await prepareNow();
    expect(harness.createdBlobs()).toHaveLength(1);
    const builtHref = downloadElement().getAttribute('href');
    const name = container.querySelector('[contenteditable]');
    await act(async () => { name.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    await act(async () => { name.textContent = 'my edit'; });
    await act(async () => { name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
    await until(() => downloadElement()?.getAttribute('download') === 'my edit.pdf');
    expect(downloadElement().getAttribute('download')).toBe('my edit.pdf');
    expect(downloadElement().getAttribute('href')).toBe(builtHref);
    expect(downloadElement().dataset.state).toBe('ready');
    expect(harness.createdBlobs()).toHaveLength(1);
  });

  it('a different file with the same name, size and date is built, not served from the cache', async () => {
    // Two different PDFs of the same size: a trailing comment differs by one character.
    const same = (mark) => new File([healthy(), `%${mark}`], 'same.pdf', { type: 'application/pdf', lastModified: 1000 });
    container = document.createElement('div');
    document.body.appendChild(container);
    container.addEventListener('click', (e) => e.preventDefault());
    act(() => { render(<PdfEditPagesTool />, container); });
    await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), [same('a')]); });
    await until(() => cells().length > 0);
    await prepareNow();
    expect(harness.createdBlobs()).toHaveLength(1);

    await replaceWith(same('b'));
    await prepareNow();
    expect(harness.createdBlobs()).toHaveLength(2);
  });

  it('the signal of a superseded build is aborted and handed to editPages', async () => {
    const { PDFDocument } = await getPdfLib();
    const saves = vi.spyOn(PDFDocument.prototype, 'save');
    await load();
    const first = await holdNextBuild();
    await prepareNow(false, first);
    // Changing the plan supersedes the build that is in flight; the new one runs to the end.
    await click(skipButton(2));
    await prepareNow();
    expect(saves).toHaveBeenCalledTimes(1);
    // The superseded build wakes up, sees its aborted signal and stops before saving.
    first.release();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    expect(saves).toHaveBeenCalledTimes(1);
    expect(await pagesOf(shownOutput())).toMatchObject({ count: 2 });
  });
});
