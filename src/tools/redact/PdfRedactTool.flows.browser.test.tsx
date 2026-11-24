import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDict, PDFDocument, PDFName, PDFRawStream, StandardFonts } from '@cantoo/pdf-lib';
import PdfRedactTool from './PdfRedactTool.tsx';
import { CHECKING } from './lib/check/checkCopy.ts';
import { englishRedactMessages } from './messages.ts';
import { applyPageEdits } from './lib/applyPageEdits.js';
import { recentActions } from '#lib/telemetry/actionTrail.ts';
import { startGesture } from '#lib/gestures/controller.ts';
import { getPdfjs as loadPdfjs } from '#lib/pdf/loadPdfjs.js';
import { getPdfjs } from '#editor/adapters/pdf/pdfjsLoader.js';
import { sendHandoff } from '#lib/handoff/sendHandoff.ts';
import { resetRatingPromptForTests } from '#shell/RatingPrompt.tsx';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { drainPromises } from '../../test/support/drainPromises.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { installBrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import { useRedactSuite, required, query, settleUntil, buildPdf, makePdfFile, clientPoint, centerOf, percentOn } from '../../test/support/redactTool.browser.tsx';
import numOneUrl from '../../lib/__fixtures__/num-1.pdf?url';
import ownerOnlyUrl from '../../lib/__fixtures__/encrypted/owner-only.pdf?url';
import needsPasswordUrl from '../../lib/__fixtures__/encrypted/needs-password.pdf?url';

answerNetwork();

vi.mock('#lib/gestures/controller.ts', { spy: true });
vi.mock('./lib/applyPageEdits.js', { spy: true });
vi.mock('#editor/adapters/pdf/pdfjsLoader.js', { spy: true });
vi.mock('#lib/handoff/sendHandoff.ts', { spy: true });
const { startGesture: realStartGesture } = await vi.importActual<typeof import('#lib/gestures/controller.ts')>('#lib/gestures/controller.ts');
const { applyPageEdits: realApplyPageEdits } = await vi.importActual<typeof import('./lib/applyPageEdits.js')>('./lib/applyPageEdits.js');
const { getPdfjs: realGetPdfjs } = await vi.importActual<typeof import('#editor/adapters/pdf/pdfjsLoader.js')>('#editor/adapters/pdf/pdfjsLoader.js');
const { sendHandoff: realSendHandoff } = await vi.importActual<typeof import('#lib/handoff/sendHandoff.ts')>('#lib/handoff/sendHandoff.ts');

const fixtureUrls = { 'owner-only.pdf': ownerOnlyUrl, 'needs-password.pdf': needsPasswordUrl };

async function pixelAt(blob: Blob, fromLeft: number, fromTop: number) {
  const saved = await PDFDocument.load(await blob.arrayBuffer());
  const xObjects = required(saved.getPage(0).node.Resources(), 'page resources').lookup(PDFName.of('XObject'), PDFDict);
  const picture = xObjects.lookup(xObjects.keys()[0]);
  if (!(picture instanceof PDFRawStream)) throw new Error('Expected the page image as a raw stream');
  const bitmap = await createImageBitmap(new Blob([picture.contents as BlobPart], { type: 'image/jpeg' }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = required(canvas.getContext('2d'), '2d context');
  ctx.drawImage(bitmap, 0, 0);
  const [r, g, b] = ctx.getImageData(Math.floor(fromLeft * bitmap.width), Math.floor(fromTop * bitmap.height), 1, 1).data;
  return { r, g, b };
}

async function expectBoxOnPage(blob: Blob) {
  const inside = await pixelAt(blob, 0.25, 0.35);
  const outside = await pixelAt(blob, 0.8, 0.8);
  expect(Math.max(inside.r, inside.g, inside.b)).toBeLessThan(16);
  expect(Math.min(outside.r, outside.g, outside.b)).toBeGreaterThan(240);
}

function frameStep(el: Element, x: number, y: number) {
  const origin = clientPoint(el, 0, 0);
  const end = clientPoint(el, x, y);
  return { dx: end.clientX - origin.clientX, dy: end.clientY - origin.clientY };
}

const toolbarButtons = (root: ParentNode) => Array.from(root.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'));

describe('PdfRedactTool flows', () => {
  const { s, holdNextExport, lifecycle, failedOperations, loadFileAndGetDrawArea, armTool, drawBox, loadFileWithoutArming, findToolButton, openSecondFile, expectLatestGestureToCommitOnce } = useRedactSuite({
    Tool: PdfRedactTool,
    checking: CHECKING,
    gestureEntry: { spy: startGesture, real: realStartGesture },
    installToolHarness: installBrowserToolHarness,
    waitUntil,
    exportEntry: { spy: applyPageEdits, real: realApplyPageEdits },
  });

  const downloads: { name: string; blob: Promise<Blob | undefined> }[] = [];
  const recordDownload = (event: Event) => {
    const link = (event.target as Element | null)?.closest?.('a[download]') as HTMLAnchorElement | null;
    if (link) downloads.push({ name: link.download, blob: fetch(link.href).then((response) => response.blob(), () => undefined) });
  };
  const savedFile = async (at: number) => required(await downloads[at].blob, 'the saved file');
  const downloadButton = () => required(toolbarButtons(s.container).find((button) => button.textContent.includes('Download')), 'Download button');
  const lifecycleAfterTheViewOnce = async () => {
    const events = await lifecycle();
    expect(events.filter(([name]) => name === 'tool_page_viewed')).toEqual([['tool_page_viewed', 'redact']]);
    return events.filter(([name]) => name !== 'tool_page_viewed');
  };
  // forced: the failure paths below log through console.error, which would drown the run's output.
  const silenceExpectedErrors = () => vi.spyOn(console, 'error').mockImplementation(() => {});

  function mountTool() {
    s.container = document.createElement('div');
    document.body.appendChild(s.container);
    act(() => { render(<PdfRedactTool />, s.container); });
  }
  async function pickFile(file: File) {
    await waitUntil(() => query(s.container, 'input[type="file"]'));
    await act(async () => { setInputFiles(query<HTMLInputElement>(s.container, 'input[type="file"]'), [file]); });
  }

  // Replacing a loaded file is confirmed first (MEM-03, BasePdfTool).
  async function replaceWith(file: File) {
    await pickFile(file);
    const confirmReplace = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('dialog button'))
      .find((button) => button.textContent?.trim() === 'Replace file'), 'Replace file button');
    await act(async () => { confirmReplace.click(); });
  }

  beforeEach(() => {
    downloads.length = 0;
    vi.mocked(getPdfjs).mockReset();
    vi.mocked(sendHandoff).mockReset();
    document.addEventListener('click', recordDownload, { capture: true });
  });
  afterEach(() => {
    document.removeEventListener('click', recordDownload, { capture: true });
  });

  it.each(['Whiteout', 'Blackout', 'Blur'] as const)('%s: a drawn box, a move and a resize land at the percent of the page, each commits once, and an arrow key moves it one point', async (label) => {
    const task = (await loadPdfjs()).getDocument({ data: (await buildPdf(2)).slice() });
    const getPage = vi.spyOn(Object.getPrototypeOf(await task.promise), 'getPage');
    await task.destroy();
    const drawArea = await loadFileWithoutArming();
    expect(query(s.container, '[data-tool-status]').textContent).toContain('pick a tool');
    expect(s.container.textContent).toContain('Draw a box or delete something, then download it here.');
    expect(s.container.querySelector('[data-redact-count]')).toBeNull();
    await armTool(label);
    await drawBox(drawArea, 50, 200, 200, 500);
    expect(query(s.container, '[data-redact-count]').textContent).toBe('Saves with 1 box');

    const box = () => query<HTMLElement>(s.container, '[data-redact-box-id]');
    const geometry = () => ({ left: parseFloat(box().style.left), top: parseFloat(box().style.top), width: parseFloat(box().style.width), height: parseFloat(box().style.height) });
    const start = percentOn(drawArea, clientPoint(drawArea, 50, 200));
    const end = percentOn(drawArea, clientPoint(drawArea, 200, 500));
    const drawn = geometry();
    expect(drawn.left).toBeCloseTo(Math.min(start.x, end.x));
    expect(drawn.top).toBeCloseTo(Math.min(start.y, end.y));
    expect(drawn.width).toBeCloseTo(Math.abs(end.x - start.x));
    expect(drawn.height).toBeCloseTo(Math.abs(end.y - start.y));
    expectLatestGestureToCommitOnce();

    // RED-52: reach it the way a keyboard user does (focus, then Enter selects); one point on the 792-point page.
    await act(async () => {
      box().focus();
      box().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(box().hasAttribute('data-selected')).toBe(true);
    await act(async () => {
      for (let read = 0; read < getPage.mock.results.length; read += 1) await getPage.mock.results[read].value;
      await drainPromises();
    });
    const before = geometry().top;
    await act(async () => { box().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
    expect(geometry().top).toBeCloseTo(drawn.top + (1 / 792) * 100, 3);
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })); });
    expect(geometry().top).toBeCloseTo(before, 4);

    // Move: left and top shift by the percent delta, width and height stay.
    const down = clientPoint(drawArea, 100, 100);
    const to = clientPoint(drawArea, 150, 300);
    await act(async () => { box().dispatchEvent(new MouseEvent('mousedown', { ...down, bubbles: true })); });
    await act(async () => { window.dispatchEvent(new MouseEvent('mousemove', to)); });
    await act(async () => { window.dispatchEvent(new MouseEvent('mousemove', to)); });
    await act(async () => { window.dispatchEvent(new MouseEvent('mouseup')); });
    const pressedAt = percentOn(drawArea, down);
    const movedTo = percentOn(drawArea, to);
    const moved = geometry();
    expect(moved.left).toBeCloseTo(drawn.left + (movedTo.x - pressedAt.x));
    expect(moved.top).toBeCloseTo(drawn.top + (movedTo.y - pressedAt.y));
    expect(moved.width).toBeCloseTo(drawn.width);
    expect(moved.height).toBeCloseTo(drawn.height);
    expectLatestGestureToCommitOnce();

    // Resize from the bottom-right handle by a percent delta.
    await act(async () => { box().dispatchEvent(new MouseEvent('mousedown', { ...clientPoint(drawArea, 0, 0), bubbles: true })); });
    await act(async () => { window.dispatchEvent(new MouseEvent('mouseup')); });
    const resizer = required(box().querySelector('[data-editor-resizer="bottom-right"]'), 'resizer');
    const grab = centerOf(resizer);
    const { dx, dy } = frameStep(drawArea, 30, 80);
    const released = { clientX: grab.clientX + dx, clientY: grab.clientY + dy };
    await act(async () => { resizer.dispatchEvent(new MouseEvent('mousedown', { ...grab, bubbles: true })); });
    await act(async () => { window.dispatchEvent(new MouseEvent('mousemove', released)); });
    await act(async () => { window.dispatchEvent(new MouseEvent('mousemove', released)); });
    await act(async () => { window.dispatchEvent(new MouseEvent('mouseup')); });
    const grabbedAt = percentOn(drawArea, grab);
    const releasedAt = percentOn(drawArea, released);
    expect(geometry().width).toBeCloseTo(moved.width + (releasedAt.x - grabbedAt.x));
    expect(geometry().height).toBeCloseTo(moved.height + (releasedAt.y - grabbedAt.y));
    expectLatestGestureToCommitOnce();
  });

  it('Delete: a drag over a page of ten runs deletes what it covers as one undo step, and Undo and Redo step through', async () => {
    // Ten separate text runs: nine in a row near the top, one lower down.
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([500, 1000]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (let n = 0; n < 9; n++) page.drawText(String(n), { x: 40 + n * 40, y: 900, size: 20, font });
    page.drawText('word', { x: 40, y: 300, size: 20, font });
    const drawArea = await loadFileAndGetDrawArea(new File([new Uint8Array(await pdf.save())], 'ten.pdf', { type: 'application/pdf' }));
    await armTool('Delete');
    const candidates = () => s.container.querySelectorAll<HTMLElement>('[data-delete-id]');
    const toolbarBtn = (title: string) => required(toolbarButtons(s.container).find((btn) => btn.title === title), `${title} button`);
    const pointer = (target: EventTarget, type: string, point: { clientX: number; clientY: number }) => {
      target.dispatchEvent(new PointerEvent(type, { ...point, pointerId: 1, pointerType: 'mouse', button: 0, bubbles: true }));
    };
    const dragBox = async (from: [number, number], to: [number, number]) => {
      await act(async () => { pointer(drawArea, 'pointerdown', clientPoint(drawArea, ...from)); });
      await act(async () => { pointer(window, 'pointermove', clientPoint(drawArea, ...to)); });
      await act(async () => { pointer(window, 'pointerup', clientPoint(drawArea, ...to)); });
      await act(async () => { await drainPromises(); });
    };
    const chip = () => s.container.querySelector('[role="status"] button')?.parentElement;
    await waitUntil(() => candidates().length === 10);
    expect(candidates()).toHaveLength(10);

    // A drag that covers nothing does nothing, and the tool stays armed.
    await dragBox([480, 500], [495, 520]);
    expect(candidates()).toHaveLength(10);

    // Drag across the row of nine.
    await dragBox([10, 40], [490, 140]);
    await waitUntil(() => expect(chip()?.textContent).toContain('Deleted 9 pieces of text'));
    expect(candidates()).toHaveLength(0); // deleting spent the arming
    expect(required(chip(), 'undo chip').textContent).toContain('Deleted 9 pieces of text');
    const chipUndo = () => required(s.container.querySelector<HTMLButtonElement>('[role="status"] button'), 'chip Undo');

    // The chip restores all nine together.
    await act(async () => { chipUndo().click(); });
    await armTool('Delete');
    expect(candidates()).toHaveLength(10);

    // Delete them again, then hover-delete the word as its own step.
    await dragBox([10, 40], [490, 140]);
    await waitUntil(() => expect(chip()?.textContent).toContain('Deleted 9 pieces of text'));
    expect(candidates()).toHaveLength(0);
    await armTool('Delete');
    expect(candidates()).toHaveLength(1);
    await waitUntil(() => expect(candidates()[0].title).toContain('word'));
    await act(async () => { candidates()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await waitUntil(() => {
      const text = s.container.querySelector('.sr-only[aria-live="polite"]')?.textContent;
      expect(text).toContain('Deleted');
      expect(text).not.toContain('9 pieces');
    });

    // Undo steps back one entry at a time: the word first, then all nine at once.
    await act(async () => { toolbarBtn('Undo').click(); });
    await armTool('Delete');
    await waitUntil(() => expect(candidates()).toHaveLength(1));
    await act(async () => { toolbarBtn('Undo').click(); });
    await waitUntil(() => expect(candidates()).toHaveLength(10));

    // Redo deletes the nine together again.
    await act(async () => { toolbarBtn('Redo').click(); });
    await waitUntil(() => expect(candidates()).toHaveLength(1));

    // forced: a browser with no element full screen (iPhone Safari), where the tool draws its own; read once, by the first press (workspaceFullscreen.ts:36)
    const fullscreenEnabled = vi.spyOn(Document.prototype, 'fullscreenEnabled', 'get').mockReturnValueOnce(false);
    const workspace = () => query<HTMLElement>(s.container, '[data-workspace]');
    const toggle = (label: string) => required(s.container.querySelector<HTMLButtonElement>(`button[title="${label}"]`), label);
    expect(workspace().hasAttribute('data-pseudo-fullscreen')).toBe(false);
    await act(async () => { toggle('Full screen').click(); });
    expect(workspace().hasAttribute('data-pseudo-fullscreen')).toBe(true);
    await act(async () => { toggle('Exit full screen').click(); });
    expect(workspace().hasAttribute('data-pseudo-fullscreen')).toBe(false);
    fullscreenEnabled.mockRestore();
  });

  it('Download while peeking, under a typed name: the editor stays open, both files show the box, and the second Download keeps the strip and the one rating dialog', async () => {
    resetRatingPromptForTests();
    const strip = () => s.container.querySelector('[data-redact-done-strip]');
    const asks = () => document.querySelectorAll('dialog[aria-labelledby="rating-modal-title"]').length;
    const drawArea = await loadFileAndGetDrawArea();
    await drawBox(drawArea, 50, 200, 200, 500);
    const box = query(s.container, '[data-redact-box-id]');
    const peekButton = query(s.container, '[data-redact-peek]');
    expect(peekButton.getAttribute('aria-pressed')).toBe('false');
    expect(box.hasAttribute('data-peeking')).toBe(false);

    await act(async () => { document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })); });
    expect(box.hasAttribute('data-peeking')).toBe(true);
    expect(peekButton.getAttribute('aria-pressed')).toBe('true');

    await act(async () => { downloadButton().click(); });
    await settleUntil('the redacted PDF to be downloaded', () => s.container.textContent.includes('Saved redacted_test_secret.pdf'));
    expect(s.container.querySelector('[data-workspace]')).not.toBeNull();
    expect(s.container.querySelector('[data-redact-box-id]')).not.toBeNull();
    expect(s.container.querySelector('.download-button')).toBeNull();
    expect(downloads.map((d) => d.name)).toEqual(['redacted_test_secret.pdf']);
    expect((await PDFDocument.load(await (await savedFile(0)).arrayBuffer())).getPageCount()).toBe(2);
    await expectBoxOnPage(await savedFile(0));
    // DEBT-28: a file in, then one started and one ready, nothing failed.
    expect(await lifecycleAfterTheViewOnce()).toEqual([
      ['tool_file_accepted', 'redact'],
      ['tool_first_edit', 'redact'],
      ['tool_operation_started', 'redact'],
      ['tool_result_ready', 'redact'],
    ]);
    // DEBT-31: the trail reads as what the person did, names only.
    expect(recentActions()).toEqual(['add_files', 'arm_tool', 'place_mark', 'export', 'download']);
    await settleUntil('the done strip', () => strip() !== null);
    // The ask waits 1.5s after a download (RatingPrompt's SHOW_DELAY_MS).
    await settleUntil('the rating ask', () => asks() === 1, 4000);

    await act(async () => { document.body.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true })); });
    expect(box.hasAttribute('data-peeking')).toBe(false);

    await act(async () => { downloadButton().click(); });
    await settleUntil('the second download', () => downloads.length === 2);
    await expectBoxOnPage(await savedFile(1));
    expect(strip()).not.toBeNull();
    expect(asks()).toBe(1);

    // The ask is answered with Not now, then a new box is a new revision, so the next Download is made under the typed name.
    const notNow = required(Array.from(document.querySelectorAll<HTMLButtonElement>('dialog[aria-labelledby="rating-modal-title"] button')).find((b) => b.textContent?.trim() === 'Not now'), 'Not now button');
    await act(async () => { notNow.click(); });
    await armTool('Blackout');
    await drawBox(drawArea, 60, 220, 220, 520);
    const nameEl = () => query(s.container, '[data-file-identity] [data-output-name] [aria-label][tabindex]');
    await act(async () => { nameEl().dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    await act(async () => { nameEl().textContent = 'Board minutes'; });
    await act(async () => { nameEl().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
    expect(query(s.container, '[data-file-identity] [data-output-name]').textContent).toBe('Board minutes.pdf');

    await act(async () => { downloadButton().click(); });
    await settleUntil('the saved name', () => s.container.textContent.includes('Saved Board minutes.pdf'))
    expect(downloads.map((d) => d.name)).toEqual(['redacted_test_secret.pdf', 'redacted_test_secret.pdf', 'Board minutes.pdf']);
  });

  it('a valid PDF is shared, and a file that can no longer be read still exports twice from the held bytes', async () => {
    const originalShare = navigator.share;
    const originalCanShare = navigator.canShare;
    // forced: the OS share sheet exists only on devices with one
    const share = vi.fn((_data?: ShareData) => Promise.resolve());
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    // forced: as above, canShare answers yes only where a share sheet exists
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => true) });
    try {
      const shareArea = await loadFileAndGetDrawArea(new File([await (await fetch(numOneUrl)).arrayBuffer()], 'num-1.pdf', { type: 'application/pdf' }));
      await drawBox(shareArea, 50, 200, 200, 500);
      const prepareButton = s.container.querySelector<HTMLButtonElement>('button[title="Apply redactions and prepare the PDF for sharing"]');
      expect(prepareButton).not.toBeNull();
      await act(async () => { prepareButton!.click(); });
      await waitUntil(() => s.container.querySelector('button[title="Share the redacted PDF"]') !== null);

      expect(s.container.querySelector('[data-workspace]')).not.toBeNull();
      // Label stays "Share" in both states (MOBI-07 follow-up), so the ready state is found by its title, not its text.
      const shareButton = s.container.querySelector<HTMLButtonElement>('button[title="Share the redacted PDF"]');
      expect(shareButton).not.toBeNull();
      await act(async () => { shareButton!.click(); });

      expect(share).toHaveBeenCalledOnce();
      const sharedFile = required(share.mock.calls[0]?.[0]?.files?.[0], 'shared PDF file');
      expect(sharedFile.name).toBe('redacted_num-1.pdf');
      expect((await PDFDocument.load(await sharedFile.arrayBuffer())).getPageCount()).toBe(1);
    } finally {
      if (originalShare === undefined) Reflect.deleteProperty(navigator, 'share');
      else Object.defineProperty(navigator, 'share', { configurable: true, value: originalShare });
      if (originalCanShare === undefined) Reflect.deleteProperty(navigator, 'canShare');
      else Object.defineProperty(navigator, 'canShare', { configurable: true, value: originalCanShare });
    }

    await s.harness.flush();
    const readyBefore = s.harness.usageEvents('tool_result_ready').length;
    const picked = makePdfFile('gone.pdf');
    await replaceWith(picked);
    await waitUntil(() => s.container.textContent.includes('Loaded PDF "gone.pdf"') && s.container.querySelector('.redact-draw-area') !== null);
    // Moved or deleted on disk after picking: Chromium rejects the re-read.
    picked.arrayBuffer = () => Promise.reject(new DOMException('gone', 'NotFoundError'));
    await armTool('Blackout');
    await drawBox(query<HTMLElement>(s.container, '.redact-draw-area'), 50, 200, 200, 500);

    // A re-read of the File would fail the export; both exports deliver a real two-page PDF instead.
    const delivered = async (count: number) => {
      await waitUntil(() => downloads.length === count || s.container.textContent.includes(englishRedactMessages.exportFailed));
      expect(s.container.textContent).not.toContain(englishRedactMessages.exportFailed);
    };
    await act(async () => { downloadButton().click(); });
    await delivered(1);
    await act(async () => { downloadButton().click(); });
    await delivered(2);
    for (let at = 0; at < 2; at += 1) {
      expect((await PDFDocument.load(await (await savedFile(at)).arrayBuffer())).getPageCount()).toBe(2);
    }
    expect(await failedOperations()).toEqual([]);
    await s.harness.flush();
    expect(s.harness.usageEvents('tool_result_ready')).toHaveLength(readyBefore + 2);
  });

  it('a piece of the export that will not load (a tab left open across a deploy) asks for a reload, not a retry', async () => {
    silenceExpectedErrors();
    const drawArea = await loadFileAndGetDrawArea();
    await drawBox(drawArea, 50, 200, 200, 500);
    // forced: the export's chunk fails to load, as it does in a tab left open across a deploy.
    vi.mocked(applyPageEdits).mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module: https://pdkef.com/_astro/applyPageEdits.x.js'));
    await act(async () => { downloadButton().click(); });
    await settleUntil('the failure', () => s.container.textContent.includes('The download stopped.'));
    expect(s.container.textContent).toContain('PDkef was updated while this page was open. Reload the page to continue. Your edits are kept.');
    expect(s.container.textContent).not.toContain('Try again');
    expect(await lifecycle()).toContainEqual(['tool_operation_failed', 'redact']);
    expect(s.harness.reports()).toMatchObject([{ area: 'redact', step: 'export' }]);
  });

  it('RED-50: a download that throws shows the error and no Saved line, and Download again completes', async () => {
    silenceExpectedErrors();
    const drawArea = await loadFileAndGetDrawArea();
    await drawBox(drawArea, 50, 200, 200, 500);
    // forced: the browser refuses to make the download link.
    vi.mocked(URL.createObjectURL).mockImplementationOnce(() => { throw new Error('blocked'); });
    await act(async () => { downloadButton().click(); });
    await settleUntil('the failure', () => s.container.textContent.includes('The download stopped.'));
    expect(s.container.textContent).not.toContain('Saved redacted');
    expect(downloadButton().disabled).toBe(false);
    // DEBT-31: the trigger is on the trail even though the export threw.
    expect(recentActions()).toContain('export');
    expect(await lifecycleAfterTheViewOnce()).toEqual([
      ['tool_file_accepted', 'redact'],
      ['tool_first_edit', 'redact'],
      ['tool_operation_started', 'redact'],
      ['tool_operation_failed', 'redact'],
    ]);

    expect(downloads).toHaveLength(0);
    await act(async () => { downloadButton().click(); });
    await settleUntil('the retry to be downloaded', () => s.container.textContent.includes('Saved redacted'));
    expect(s.container.textContent).not.toContain('The download stopped.');
    expect(downloads.map((d) => d.name)).toEqual(['redacted_test_secret.pdf']);
  });

  // DEBT-18: `.is-processing` stops the pointer and not the keyboard, and useHistoryShortcuts binds an
  // unconditional window keydown, so a redo mid-export is reachable and is driven through that keystroke.
  it('the same page stays mounted during an export, and a keyboard redo mid-export drops it and hands the editor back', async () => {
    const drawArea = await loadFileAndGetDrawArea();
    await drawBox(drawArea, 50, 200, 200, 500); // box A
    await armTool('Blackout');
    await drawBox(drawArea, 60, 220, 220, 520); // box B

    // Undo box B, so the export started below covers box A alone and box B is one keystroke away in the redo future.
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })); });
    expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(1);

    const pageBefore = s.container.querySelector('.redact-draw-area');
    const held = holdNextExport();
    await act(async () => { downloadButton().click(); });
    await act(async () => { await held.started; });

    const workspace = query(s.container, '[data-workspace]');
    expect(s.container.querySelector('.redact-draw-area')).toBe(pageBefore);
    expect(workspace.hasAttribute('data-processing')).toBe(true);
    expect(workspace.getAttribute('aria-busy')).toBe('true');

    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true })); });
    expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(2);

    await held.runToEnd();

    // Two boxes are on the page; the blob that just resolved has one. Nothing may offer it.
    expect(downloads).toHaveLength(0);
    expect(s.container.textContent).not.toContain('Saved redacted_');
    // Dropping the export still has to hand the editor back.
    expect(query(s.container, '[data-workspace]').hasAttribute('data-processing')).toBe(false);
  });

  it('a replacement file stays loading and an export from the old file commits nothing; an export finishing after the editor unmounts downloads nothing', async () => {
    const drawArea = await loadFileAndGetDrawArea();
    await drawBox(drawArea, 50, 200, 200, 500);
    const held = holdNextExport();
    await act(async () => { downloadButton().click(); });
    await act(async () => { await held.started; });
    expect(query(s.container, '[data-workspace]').hasAttribute('data-processing')).toBe(true);

    // Hold the replacement's document open, so the assertions land while the new file is still being read.
    const replacementRead = Promise.withResolvers<void>();
    const releaseReplacement = Promise.withResolvers<void>();
    // forced: the replacement's pdf.js load is held open until the test releases it.
    vi.mocked(getPdfjs).mockImplementationOnce(async () => {
      replacementRead.resolve();
      await releaseReplacement.promise;
      return realGetPdfjs();
    });
    await replaceWith(makePdfFile('replacement.pdf'));
    await act(async () => {
      await replacementRead.promise;
      await drainPromises();
    });

    // The announcement is what pins the guard: the editor is off screen either way.
    expect(s.container.querySelector('[data-workspace]')).toBeNull();
    expect(query(s.container, '[role="status"][aria-live="polite"]').textContent).not.toContain(englishRedactMessages.exportSuperseded);

    await act(async () => { releaseReplacement.resolve(); });
    await waitUntil(() => expect(s.container.querySelector('[data-workspace]')).not.toBeNull());
    expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(0);

    // The export started from the file that is no longer open commits nothing when it resolves.
    await held.runToEnd();
    expect(downloads).toHaveLength(0);

    // The run's own keys cannot see an unmount, so the editor leaving the tree must retire the run.
    const nextArea = query<HTMLElement>(s.container, '.redact-draw-area');
    await armTool('Blackout');
    await drawBox(nextArea, 50, 200, 200, 500);
    const heldAgain = holdNextExport();
    await act(async () => { downloadButton().click(); });
    await act(async () => { await heldAgain.started; });
    act(() => render(null, s.container));
    await heldAgain.runToEnd();
    expect(downloads).toHaveLength(0);
  });

  it('a broken file leaves only add_files on the trail, and opening another file leaves no tool armed, even a locked one', async () => {
    silenceExpectedErrors();
    mountTool();
    await pickFile(makePdfFile('broken.pdf', new TextEncoder().encode('this is not a pdf')));
    await waitUntil(() => expect(s.container.textContent).toContain("This PDF didn't open"));
    await s.harness.flush();
    // Drain the rejected load's promise chain: the exact trail below proves nothing else was recorded after the failure.
    await act(async () => { await drainPromises(); });
    expect(recentActions()).toEqual(['add_files']);

    await openSecondFile('first.pdf');
    await armTool('Blackout', { lock: true });
    const findToggle = () => query<HTMLButtonElement>(s.container, '[data-redact-find-toggle]');
    await act(async () => { findToggle().click(); });
    const findInput = () => query<HTMLInputElement>(s.container, '[data-redact-find-input]');
    await act(async () => { findInput().value = 'secret'; findInput().dispatchEvent(new Event('input', { bubbles: true })); });
    expect(findInput().value).toBe('secret');
    expect(query<HTMLElement>(s.container, '.redact-draw-area').style.touchAction).toBe('none');
    expect(findToolButton('Blackout').hasAttribute('data-locked')).toBe(true);

    await openSecondFile('second.pdf');
    expect(query<HTMLElement>(s.container, '.redact-draw-area').style.touchAction).toBe('auto');
    expect(findToolButton('Blackout').hasAttribute('data-locked')).toBe(false);
    expect(findToolButton('Blackout').getAttribute('aria-pressed')).toBe('false');
    expect(s.container.querySelector('[data-redact-find-bar]')).toBeNull();
    await act(async () => { findToggle().click(); });
    expect(findInput().value).toBe('');
  });

  it('a protected PDF shows its state and never reaches the editor, pdf-lib or the failure count; Unlock it parks the file, a refused save says so quietly, and another file clears it', async () => {
    const fixture = async (name: keyof typeof fixtureUrls) => new File([await (await fetch(fixtureUrls[name])).arrayBuffer()], name, { type: 'application/pdf' });
    const state = () => s.container.querySelector<HTMLElement>('[data-needs-unlock]');
    const unlockButton = () => required(
      Array.from(s.container.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.includes('Unlock it')),
      'the Unlock it button',
    );
    const titleOf = () => state()?.querySelector('h2')?.textContent;
    const load = vi.spyOn(PDFDocument, 'load');
    const expectState = async (title: string, body: string) => {
      const shown = required(state(), 'the needs-unlock state');
      expect(shown.querySelector('h2')?.textContent).toBe(title);
      expect(shown.querySelector('p')?.textContent).toBe(body);
      expect(s.container.querySelector('[data-workspace]')).toBeNull();
      expect(s.container.textContent).not.toContain("This PDF didn't open");
      expect(await failedOperations()).toEqual([]);
      expect(load).not.toHaveBeenCalled();
      // The shell's Replace is the other way on.
      expect(s.container.textContent).toContain('Replace');
    };

    const protectedFile = await fixture('owner-only.pdf');
    mountTool();
    await pickFile(protectedFile);
    await waitUntil(() => titleOf() === 'This PDF is protected');
    await expectState('This PDF is protected', "It opens without a password, but Redact can't change it as it is. Unlock takes the protection off on your device, then you can redact it.");

    const navigate = vi.fn();
    const sent = Promise.withResolvers<void>();
    // forced: a real navigation would take the test page away, so the hand-off gets a navigate callback.
    vi.mocked(sendHandoff).mockImplementationOnce(async (target, payload, options) => {
      try { return await realSendHandoff(target, payload, { ...options, navigate }); } finally { sent.resolve(); }
    });
    await act(async () => { unlockButton().click(); });
    await act(async () => { await sent.promise; });
    expect(navigate).toHaveBeenCalledWith('/unlock/');
    // Parked for Unlock only, with the file's own bytes and the way back.
    expect(await s.harness.takeHandoff('redact')).toBeNull();
    const parked = required(await s.harness.takeHandoff('unlock'), 'the parked hand-off');
    expect(parked).toMatchObject({ fileName: 'owner-only.pdf', fileType: 'application/pdf', from: 'redact' });
    expect(new Uint8Array(parked.fileBytes!)).toEqual(new Uint8Array(await protectedFile.arrayBuffer()));

    await replaceWith(await fixture('needs-password.pdf'));
    await waitUntil(() => titleOf() === 'This PDF has a password');
    await expectState('This PDF has a password', 'Unlock opens it on your device, then you can redact it.');

    silenceExpectedErrors();
    // forced: the device refuses the write (storage full), and the real saveHandoff fails on it. Only
    // the first open after the click is refused (the hand-off write; the file is unedited, so nothing
    // else opens the database then); every other open goes to the real IndexedDB.
    const realOpen = indexedDB.open.bind(indexedDB);
    let refuseNext = false;
    const refused = vi.spyOn(indexedDB, 'open').mockImplementation((...args) => {
      if (!refuseNext) return realOpen(...args);
      refuseNext = false;
      const request: { error?: DOMException; onerror?: () => void } = {};
      queueMicrotask(() => { request.error = new DOMException('full', 'QuotaExceededError'); request.onerror?.(); });
      return request as unknown as IDBOpenDBRequest;
    });
    try {
      refuseNext = true;
      await act(async () => { unlockButton().click(); });
      await settleUntil('the failure line', () => (state()?.textContent ?? '').includes("Couldn't open Unlock with this file. Open Unlock and choose it there."));
    } finally {
      refused.mockRestore();
    }
    expect(unlockButton().disabled).toBe(false);
    expect(await s.harness.takeHandoff('unlock')).toBeNull();
    expect(await failedOperations()).toEqual([]);
    expect(s.harness.reports()).toMatchObject([{ area: 'handoff', step: 'save_handoff' }]);

    await replaceWith(makePdfFile('plain.pdf'));
    await waitUntil(() => s.container.querySelector('[data-workspace]') !== null);
    expect(state()).toBeNull();
  });
});
