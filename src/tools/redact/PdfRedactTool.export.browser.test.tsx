import { render } from 'preact';
import { drainPromises } from '../../test/support/drainPromises.ts';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PdfRedactTool from './PdfRedactTool.tsx';
import { CHECKING } from './lib/check/checkCopy.ts';
import { englishRedactMessages } from './messages.ts';
import { recentActions } from '#lib/telemetry/actionTrail.ts';
import { PDFDocument } from '@cantoo/pdf-lib';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { startGesture } from '#lib/gestures/controller.ts';
import { applyPageEdits } from './lib/applyPageEdits.js';
import { getPdfjs } from '#editor/adapters/pdf/pdfjsLoader.js';
import { sendHandoff } from '#lib/handoff/sendHandoff.ts';
import { installBrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import ownerOnlyUrl from '../../lib/__fixtures__/encrypted/owner-only.pdf?url';
import needsPasswordUrl from '../../lib/__fixtures__/encrypted/needs-password.pdf?url';
import { resetRatingPromptForTests } from '#shell/RatingPrompt.tsx';
import toolbarStyles from '#editor-ui/SignToolbar.module.css';
import { useRedactSuite, required, query, settleUntil, buildPdf, makePdfFile } from '../../test/support/redactTool.browser.tsx';

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

describe('PdfRedactTool UI flow', () => {
  const { s, holdNextExport, lifecycle, failedOperations, loadFileAndGetDrawArea, armTool, drawBox, loadFileWithoutArming } = useRedactSuite({ Tool: PdfRedactTool, checking: CHECKING, gestureEntry: { spy: startGesture, real: realStartGesture }, installToolHarness: installBrowserToolHarness, waitUntil, exportEntry: { spy: applyPageEdits, real: realApplyPageEdits } });

  const lifecycleAfterTheViewOnce = async () => {
    const events = await lifecycle();
    expect(events.filter(([name]) => name === 'tool_page_viewed')).toEqual([['tool_page_viewed', 'redact']]);
    return events.filter(([name]) => name !== 'tool_page_viewed');
  };
  const downloads: { name: string; blob: Promise<Blob | undefined> }[] = [];
  const recordDownload = (event: Event) => {
    const link = (event.target as Element | null)?.closest?.('a[download]') as HTMLAnchorElement | null;
    if (link) downloads.push({ name: link.download, blob: fetch(link.href).then((response) => response.blob(), () => undefined) });
  };
  beforeEach(() => {
    downloads.length = 0;
    vi.mocked(getPdfjs).mockReset();
    vi.mocked(sendHandoff).mockReset();
    document.addEventListener('click', recordDownload, { capture: true });
  });
  afterEach(() => {
    document.removeEventListener('click', recordDownload, { capture: true });
  });

  it('renders the initial file dropper zone', () => {
    s.container = document.createElement('div');
    document.body.appendChild(s.container);
    act(() => {
      render(<PdfRedactTool />, s.container);
    });

    const dropzone = query(s.container, '[data-dropzone]');
    expect(dropzone).not.toBeNull();
    expect(dropzone.textContent).toContain('Select or drop a PDF to redact');
  });

  it('transitions to editing state when a file is selected', async () => {
    s.container = document.createElement('div');
    document.body.appendChild(s.container);
    act(() => {
      render(<PdfRedactTool />, s.container);
    });

    const input = query<HTMLInputElement>(s.container, 'input[type="file"]');
    const file = makePdfFile('test_secret.pdf');

    await act(async () => {
      setInputFiles(input, [file]);
    });

    // Verify hint message appears indicating editing mode (once the async file load lands). Nothing is armed on
    // load - a tool is one-shot here now, exactly as in the Sign editor - so
    // this is the idle tip, not any tool's own copy.
    await waitUntil(() => expect(query(s.container, '[data-tool-status]').textContent).toContain('pick a tool'));
    const header = query(s.container, '[data-tool-status]');
    expect(header).not.toBeNull();
    expect(header.textContent).toContain('pick a tool');
    
    // Verify toolbar modes exist
    const toolbar = query(s.container, '[role="toolbar"]');
    expect(toolbar).not.toBeNull();
    expect(toolbar.textContent).toContain('Blackout');
    expect(toolbar.textContent).toContain('Blur');

    // RED-36: before anything is drawn, the finish row below the document is a
    // sentence that says what to do, not a greyed Download (guideline §2).
    expect(s.container.querySelector('[data-export-actions]')).toBeNull();
    expect(s.container.textContent).toContain('Draw a box or delete something, then download it here.');

    // SIGN-42: one plain Full screen button, no view density control.
    expect(toolbar.hasAttribute('data-editor-toolbar')).toBe(true);
    expect(toolbar.querySelector('[role="radiogroup"]')).toBeNull();
    const fullscreen = Array.from(toolbar.querySelectorAll('button')).filter((b) => b.textContent.trim() === 'Full screen');
    expect(fullscreen).toHaveLength(1);
  });

  it('keeps the redaction editor open after downloading', async () => {
    const drawArea = await loadFileAndGetDrawArea();
    await drawBox(drawArea, 50, 200, 200, 500);

    const generateButton = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
      .find((button) => button.textContent.includes('Download')), 'Download button');

    await act(async () => {
      generateButton.click();
    });
    // A bare `click()` does not await the handler it fires, and that handler
    // has a chunk to load before it reaches redactPdf. Wait for the download
    // the whole export ends in.
    await settleUntil('the redacted PDF to be downloaded', () => s.container.textContent.includes('Saved redacted_test_secret.pdf'));

    expect(s.container.querySelector('[data-workspace]')).not.toBeNull();
    expect(s.container.querySelector('[data-redact-box-id]')).not.toBeNull();
    expect(s.container.querySelector('.download-button')).toBeNull();
    expect(downloads.map((d) => d.name)).toEqual(['redacted_test_secret.pdf']);
    const saved = required(await downloads[0].blob, 'the saved file');
    expect((await PDFDocument.load(await saved.arrayBuffer())).getPageCount()).toBe(2);
    // DEBT-28: a file in, then one started and one ready, nothing failed.
    expect(await lifecycleAfterTheViewOnce()).toEqual([
      ['tool_file_accepted', 'redact'],
      ['tool_first_edit', 'redact'],
      ['tool_operation_started', 'redact'],
      ['tool_result_ready', 'redact'],
    ]);
    // DEBT-31: the trail reads as what the person did, names only.
    expect(recentActions()).toEqual(['add_files', 'arm_tool', 'place_mark', 'export', 'download']);
  });

  it('DEBT-31: a file that fails to load still leaves add_files on the trail', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      s.container = document.createElement('div');
      document.body.appendChild(s.container);
      act(() => { render(<PdfRedactTool />, s.container); });
      const input = query<HTMLInputElement>(s.container, 'input[type="file"]');
      await act(async () => { setInputFiles(input, [makePdfFile('broken.pdf', new TextEncoder().encode('this is not a pdf'))]); });
      await waitUntil(() => expect(s.container.textContent).toContain("This PDF didn't open"));
      await s.harness.flush();
      // Drain the rejected load's promise chain: the exact trail below proves nothing else was recorded after the failure.
      await act(async () => { await drainPromises(); });
      expect(recentActions()).toEqual(['add_files']);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('a piece of the export that will not load (a tab left open across a deploy) asks for a reload, not a retry', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500);
      // forced: the export's chunk fails to load, as it does in a tab left open across a deploy.
      vi.mocked(applyPageEdits).mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module: https://pdkef.com/_astro/applyPageEdits.x.js'));
      const downloadButton = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
        .find((button) => button.textContent.includes('Download')), 'Download button');
      await act(async () => { downloadButton.click(); });
      await settleUntil('the failure', () => s.container.textContent.includes('The download stopped.'));
      expect(s.container.textContent).toContain('PDkef was updated while this page was open. Reload the page to continue. Your edits are kept.');
      expect(s.container.textContent).not.toContain('Try again');
      expect(await lifecycle()).toContainEqual(['tool_operation_failed', 'redact']);
      expect(s.harness.reports()).toMatchObject([{ area: 'redact', step: 'export' }]);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('RED-50: a download that throws shows the error and no Saved line, and Download again completes', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500);
      const downloadButton = () => required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
        .find((button) => button.textContent.includes('Download')), 'Download button');
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
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('RED-60: Remove it is a history step every export replays; Undo takes it back out', async () => {
    // What the saved file says about itself: the check reads this title back and offers to remove it.
    const titleOf = async (download: (typeof downloads)[number]) => (await PDFDocument.load(await required(await download.blob, 'the saved file').arrayBuffer(), { updateMetadata: false })).getTitle();
    {
      const drawArea = await loadFileAndGetDrawArea(makePdfFile('titled.pdf', await buildPdf(2, { title: 'Secret title' })));
      await drawBox(drawArea, 50, 200, 200, 500);
      const buttons = () => Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'));
      const download = () => required(buttons().find((button) => button.textContent.includes('Download')), 'Download button');
      await act(async () => { download().click(); });
      await settleUntil('the export', () => s.container.querySelector('[data-saved-file-check]') !== null);
      expect(downloads).toHaveLength(1);
      expect(await titleOf(downloads[0])).toBe('Secret title');

      // Ask the check about the word, as a person would; it finds it in the saved file's title.
      const search = query<HTMLInputElement>(s.container, '[data-saved-file-check] input[type="search"]');
      await act(async () => { search.value = 'Secret'; search.dispatchEvent(new Event('input', { bubbles: true })); });
      await act(async () => { query<HTMLFormElement>(s.container, '[data-saved-file-check] form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
      const remove = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[data-saved-file-check] button'))
        .find((button) => button.textContent === 'Remove it'), 'Remove it button');
      await act(async () => { remove.click(); });
      await settleUntil('the saved file again', () => s.container.querySelector('[data-check-removed]') !== null);

      // The export replayed the removal: saved again and downloaded, without the title.
      expect(downloads).toHaveLength(2);
      expect(await titleOf(downloads[1])).toBeUndefined();
      expect(s.container.querySelector('[data-check-removed]')?.textContent).toBe('Removed the title. Saved again and downloaded.');

      const undo = required(buttons().find((button) => button.title === 'Undo'), 'Undo button');
      await act(async () => { undo.click(); });
      await act(async () => { download().click(); });
      await settleUntil('the export without the removal', () => downloads.length === 3);
      expect(await titleOf(downloads[2])).toBe('Secret title');
    }
  });

  // RED-66: the done strip (result, hand-offs) hangs under the toolbar after a toolbar Download. Where it
  // sits on screen is src/tools/redact/e2e/redact-done-strip.spec.js; that a second Download leaves it in
  // place, and the one rating dialog (SEO-55) open exactly once, is state, proved here.
  it('RED-66: a second toolbar Download keeps the done strip and the one rating dialog', async () => {
    resetRatingPromptForTests();
    const strip = () => s.container.querySelector('[data-redact-done-strip]');
    const asks = () => document.querySelectorAll('dialog[aria-labelledby="rating-modal-title"]').length;
    {
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500);
      const downloadButton = () => required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
        .find((button) => button.textContent?.includes('Download')), 'Download button');

      await act(async () => { downloadButton().click(); });
      await settleUntil('the first download', () => downloads.length >= 1);
      await settleUntil('the done strip', () => strip() !== null);
      // The ask waits 1.5s after a download (RatingPrompt's SHOW_DELAY_MS).
      await settleUntil('the rating ask', () => asks() === 1, 4000);

      await act(async () => { downloadButton().click(); });
      await settleUntil('the second download', () => downloads.length >= 2);
      expect(strip()).not.toBeNull();
      expect(asks()).toBe(1);
    }
  }, 15000);

  // The sticky toolbar drops its Download below 920px only once native Share exists to take its
  // place (EditorExportActions' `.desktop-download`, hidden by SignToolbar.module.css). With no
  // Share, Download is the only way to finish from the toolbar, so it must not wear that class.
  it('keeps the toolbar\'s own Download unhidden when native Share is unavailable', async () => {
    // forced: headless Chromium answers differently per platform (native share exists on macOS, not
    // on Linux), so the no-Share case is pinned on both.
    const originalShare = Object.getOwnPropertyDescriptor(navigator, 'share');
    const originalCanShare = Object.getOwnPropertyDescriptor(navigator, 'canShare');
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
    try {
      await loadFileWithoutArming();
      const toolbarButtons = Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'));
      expect(toolbarButtons.find((button) => button.textContent?.trim() === 'Share')).toBeUndefined();
      const download = required(toolbarButtons.find((button) => button.textContent?.includes('Download')), 'toolbar Download');
      expect(download.classList.contains(toolbarStyles['desktop-download'])).toBe(false);
    } finally {
      for (const [name, descriptor] of [['share', originalShare], ['canShare', originalCanShare]] as const) {
        if (descriptor) Object.defineProperty(navigator, name, descriptor);
        else delete (navigator as unknown as Record<string, unknown>)[name];
      }
    }
  });

  // Design-review finding #5: the Download control never said what it would
  // produce, and the identity row's file name never hinted at the output
  // name either.
  describe('honest export count and output name (finding #5)', () => {
    it('shows no box count, and the redacted_ output name, before any box exists', async () => {
      await loadFileWithoutArming(makePdfFile('secret.pdf'));

      expect(s.container.querySelector('[data-redact-count]')).toBeNull();
      expect(query(s.container, '[data-file-identity] [data-output-name]').textContent).toBe('redacted_secret.pdf');
    });

    it('shows a live box count and the redacted_ output name once a box exists, updating as more are added', async () => {
      const drawArea = await loadFileAndGetDrawArea(makePdfFile('secret.pdf'));
      await drawBox(drawArea, 50, 200, 200, 500);

      expect(query(s.container, '[data-redact-count]').textContent).toBe('Saves with 1 box');
      expect(query(s.container, '[data-file-identity] [data-output-name]').textContent).toBe('redacted_secret.pdf');

      await armTool('Blackout');
      await drawBox(drawArea, 60, 220, 220, 520);

      expect(query(s.container, '[data-redact-count]').textContent).toBe('Saves with 2 boxes');
    });
  });

  it('a name typed in the identity row is the displayed name and the saved name', async () => {
  const drawArea = await loadFileAndGetDrawArea(makePdfFile('secret.pdf'));
  await drawBox(drawArea, 50, 200, 200, 500);

  const nameEl = () => query(s.container, '[data-file-identity] [data-output-name] [aria-label][tabindex]');
  await act(async () => { nameEl().dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  await act(async () => { nameEl().textContent = 'Board minutes'; });
  await act(async () => {
    nameEl().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  });
  expect(query(s.container, '[data-file-identity] [data-output-name]').textContent).toBe('Board minutes.pdf');

  const download = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
    .find((button) => button.textContent.includes('Download')), 'Download button');
  await act(async () => { download.click(); });
  await settleUntil('the saved name', () => s.container.textContent.includes('Saved Board minutes.pdf'));
  expect(downloads.map((d) => d.name)).toEqual(['Board minutes.pdf']);
  });

  // DEBT-18: the export is the one async path here whose stale result is a
  // document rather than a wrong label. `.is-processing` sets
  // `pointer-events: none` on the workspace, which stops the pointer and not
  // the keyboard, and useHistoryShortcuts binds an unconditional window
  // keydown - so a redo mid-export is reachable, and it is driven here
  // through that keystroke rather than a synthetic state poke for exactly
  // that reason.
  describe('an edit that lands mid-export (DEBT-18)', () => {
    it('drops an export whose boxes a keyboard redo has already changed', async () => {
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500); // box A
      await armTool('Blackout');
      await drawBox(drawArea, 60, 220, 220, 520); // box B

      // Undo box B, so the export started below covers box A alone and box
      // B is sitting in the redo future one keystroke away.
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      });
      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(1);

      const downloadButton = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
        .find((button) => button.textContent.includes('Download')), 'Download button');
      const held = holdNextExport();
      await act(async () => {
        downloadButton.click();
      });
      await act(async () => { await held.started; });

      const workspace = query(s.container, '[data-workspace]');
      expect(workspace.hasAttribute('data-processing')).toBe(true);

      // The keystroke the processing overlay cannot block.
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }));
      });
      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(2);

      await held.runToEnd();

      // Two boxes are on the page; the blob that just resolved has one.
      // Nothing may offer it: no download, and no saved state kept for the
      // hand-off with bytes that are missing the box already restored (the
      // chips still show, but a tap makes a fresh export).
      expect(downloads).toHaveLength(0);
      expect(s.container.textContent).not.toContain('Saved redacted_');

      // Dropping the export still has to hand the editor back.
      expect(query(s.container, '[data-workspace]')
        .hasAttribute('data-processing')).toBe(false);
    });

    // The invalidation effect above retires the export for a replacement file
    // too, and it used to follow that with setStatus('editing') - over a
    // 'loading' the new file's own loader had just set. That shipped once and
    // was fixed by hand; this pins it. The two states differ in what they
    // tell the person: a file still being read is loading, it has no edits
    // that could have changed mid-prepare.
    it('leaves a replacement file loading instead of reporting the export as invalidated', async () => {
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500);

      const downloadButton = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
        .find((button) => button.textContent.includes('Download')), 'Download button');
      const held = holdNextExport();
      await act(async () => {
        downloadButton.click();
      });
      await act(async () => { await held.started; });
      expect(query(s.container, '[data-workspace]')
        .hasAttribute('data-processing')).toBe(true);

      // Hold the replacement's document open, so the assertions below land
      // in the window where the new file is still being read.
      const replacementRead = Promise.withResolvers<void>();
      const releaseReplacement = Promise.withResolvers<void>();
      // forced: the replacement's pdf.js load is held open until the test releases it.
      vi.mocked(getPdfjs).mockImplementationOnce(async () => {
        replacementRead.resolve();
        await releaseReplacement.promise;
        return realGetPdfjs();
      });

      const input = query<HTMLInputElement>(s.container, 'input[type="file"]');
      await act(async () => {
        setInputFiles(input, [makePdfFile('replacement.pdf')]);
      });
      // Replacing a loaded file is confirmed first (MEM-03, BasePdfTool).
      const confirmReplace = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('dialog button'))
        .find((button) => button.textContent.trim() === 'Replace file'), 'Replace file button');
      await act(async () => {
        confirmReplace.click();
      });
      await act(async () => {
        await replacementRead.promise;
        await drainPromises();
      });

      // The new file is still being read: no editor, and nothing claiming
      // this person's edits changed underneath an export they no longer have.
      //
      // The announcement is what pins the guard. The workspace is mounted on
      // `pdfDocument` as well as on the status, and the replacement's own
      // loader nulls that in the same render that sets 'loading', so the
      // editor is off screen either way - dropping the guard makes this
      // window say the wrong thing rather than draw the wrong thing.
      expect(s.container.querySelector('[data-workspace]')).toBeNull();
      expect(query(s.container, '[role="status"][aria-live="polite"]').textContent)
        .not.toContain(englishRedactMessages.exportSuperseded);

      // The replacement finishes loading and gets a clean editor of its own.
      await act(async () => {
        releaseReplacement.resolve();
      });
      await waitUntil(() => expect(s.container.querySelector('[data-workspace]')).not.toBeNull());
      expect(s.container.querySelector('[data-workspace]')).not.toBeNull();
      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(0);

      // And the export started from the file that is no longer open commits
      // nothing when it finally resolves.
      await held.runToEnd();
      expect(downloads).toHaveLength(0);
    });

    // The run's own keys cannot see an unmount: the refs they read still hold
    // the same file and revision after the editor has left the tree, so
    // without retiring the run here a finished export downloads a file for a
    // tool the person has navigated away from. Sign's unmount does the same
    // with activeExportRequestRef.
    it('does not download an export that finishes after the editor unmounts', async () => {
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500);

      const downloadButton = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
        .find((button) => button.textContent.includes('Download')), 'Download button');
      const held = holdNextExport();
      await act(async () => {
        downloadButton.click();
      });
      await act(async () => { await held.started; });

      act(() => render(null, s.container));

      await held.runToEnd();

      expect(downloads).toHaveLength(0);
    });
  });

  // ENC-02: a protected PDF is one quiet state, not an exception.
  describe('a protected PDF (ENC-02)', () => {
    const fixture = async (name: keyof typeof fixtureUrls) => new File(
      [await (await fetch(fixtureUrls[name])).arrayBuffer()],
      `${name}`,
      { type: 'application/pdf' },
    );
    const NEEDS_PASSWORD_TITLE = 'This PDF has a password';
    const PROTECTED_TITLE = 'This PDF is protected';

    async function pick(file: File) {
      s.container = document.createElement('div');
      document.body.appendChild(s.container);
      act(() => { render(<PdfRedactTool />, s.container); });
      await act(async () => { setInputFiles(query<HTMLInputElement>(s.container, 'input[type="file"]'), [file]); });
      // The file has been read: either the needs-unlock state or the editor is on screen.
      await waitUntil(() => state() !== null || s.container.querySelector('[data-workspace]') !== null);
    }

    const state = () => s.container.querySelector<HTMLElement>('[data-needs-unlock]');
    const unlockButton = () => required(
      Array.from(s.container.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.includes('Unlock it')),
      'the Unlock it button',
    );

    it.each([
      ['owner-only.pdf', PROTECTED_TITLE, "It opens without a password, but Redact can't change it as it is. Unlock takes the protection off on your device, then you can redact it."],
      ['needs-password.pdf', NEEDS_PASSWORD_TITLE, 'Unlock opens it on your device, then you can redact it.'],
    ] as const)('%s shows the state and never reaches the editor, pdf-lib or the failure count', async (name, title, body) => {
      const load = vi.spyOn(PDFDocument, 'load');
      await pick(await fixture(name));

      const shown = required(state(), 'the needs-unlock state');
      expect(shown.querySelector('h2')?.textContent).toBe(title);
      expect(shown.querySelector('p')?.textContent).toBe(body);
      expect(s.container.querySelector('[data-workspace]')).toBeNull();
      expect(s.container.textContent).not.toContain("This PDF didn't open");
      expect(await failedOperations()).toEqual([]);
      expect(load).not.toHaveBeenCalled();
      // The shell's Replace is the other way on.
      expect(s.container.textContent).toContain('Replace');
    });

    it('Unlock it parks the file for Unlock, then navigates there', async () => {
      const protectedFile = await fixture('owner-only.pdf');
      await pick(protectedFile);
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
    });

    it('a failed save says so quietly and leaves the button usable', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await pick(await fixture('needs-password.pdf'));
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
    });

    it('choosing another file clears the state', async () => {
      await pick(await fixture('needs-password.pdf'));
      expect(state()).not.toBeNull();
      await act(async () => { setInputFiles(query<HTMLInputElement>(s.container, 'input[type="file"]'), [makePdfFile('plain.pdf')]); });
      // Replacing a loaded file is confirmed first (MEM-03, BasePdfTool).
      const confirmReplace = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('dialog button'))
        .find((button) => button.textContent?.trim() === 'Replace file'), 'Replace file button');
      await act(async () => { confirmReplace.click(); });
      await waitUntil(() => s.container.querySelector('[data-workspace]') !== null);
      expect(state()).toBeNull();
    });
  });
});
