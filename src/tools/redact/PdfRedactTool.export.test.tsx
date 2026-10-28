import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, type Mock } from 'vitest';
import PdfRedactTool from './PdfRedactTool.tsx';
import { CHECKING } from './lib/check/checkCopy.ts';
import { recentActions } from '#lib/telemetry/actionTrail.ts';
import { PDFDocument } from '@cantoo/pdf-lib';
import { waitUntil } from '../../test/harness/waitUntil.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';
// @ts-expect-error -- this browser-first project intentionally omits Node ambient types; Vitest provides the runtime.
import fs from 'node:fs';
import * as gestureController from '#lib/gestures/controller.ts';
import { installToolHarness } from '../../test/harness/toolHarness.ts';
import { useRedactSuite, required, query, settleUntil, installCanvasEdge, buildPdf, makePdfFile } from '../../test/support/redactTool.tsx';

declare const __dirname: string;

// pdf.js and the canvas are faked by the shared suite (src/test/support/redactTool.tsx); only the ring
// sampler is steered per test, through `pageSampler`.
vi.mock('#editor-ui/whiteout/pageSampling.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#editor-ui/whiteout/pageSampling.ts')>();
  const { pageSampler } = await import('../../test/support/redactTool.tsx');
  return {
    ...actual,
    sampleRingColor: (canvas: HTMLCanvasElement | null | undefined, box: { left: number; top: number; width: number; height: number }) => {
      pageSampler.calls.push({ canvas, box });
      return pageSampler.impl(canvas, box);
    },
  };
});

describe('PdfRedactTool UI flow', () => {
  const { s, holdNextDocumentRead, lifecycle, failedOperations, loadFileAndGetDrawArea, armTool, drawBox, loadFileWithoutArming } = useRedactSuite({ Tool: PdfRedactTool, checking: CHECKING, gestureController, installToolHarness, waitUntil });

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

    // E9: ViewControl replaced FullscreenButton in this exact slot.
    const radiogroup = toolbar.querySelector('[role="radiogroup"]');
    expect(radiogroup).not.toBeNull();
    expect(radiogroup.getAttribute('aria-label')).toBe('View density');
    expect(radiogroup.querySelectorAll('[role="radio"]')).toHaveLength(3);
  });

  it('keeps the redaction editor open after downloading', async () => {
    s.restoreCanvas = installCanvasEdge();
    const originalCreateObjectURL = window.URL.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:redacted-pdf');
    window.URL.revokeObjectURL = vi.fn();

    try {
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
      await settleUntil(
        'the redacted PDF to be downloaded',
        () => (window.URL.revokeObjectURL as Mock).mock.calls.length > 0,
      );

      expect(s.container.querySelector('[data-workspace]')).not.toBeNull();
      expect(s.container.querySelector('[data-redact-box-id]')).not.toBeNull();
      expect(s.container.querySelector('.download-button')).toBeNull();
      expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:redacted-pdf');
      // DEBT-28: a file in, then one started and one ready, nothing failed.
      expect(await lifecycle()).toEqual([
        ['tool_page_viewed', 'redact'],
        ['tool_file_accepted', 'redact'],
        ['tool_first_edit', 'redact'],
        ['tool_operation_started', 'redact'],
        ['tool_result_ready', 'redact'],
      ]);
      // DEBT-31: the trail reads as what the person did, names only.
      expect(recentActions()).toEqual(['add_files', 'arm_tool', 'place_mark', 'export', 'download']);
    } finally {
      window.URL.createObjectURL = originalCreateObjectURL;
      window.URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });

  it('DEBT-31: a file that fails to load still leaves add_files on the trail', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      s.harness.pdfjs.getDocument.mockImplementationOnce(() => ({
        promise: Promise.reject(new Error('corrupt')),
      }) as never);
      s.container = document.createElement('div');
      document.body.appendChild(s.container);
      act(() => { render(<PdfRedactTool />, s.container); });
      const input = query<HTMLInputElement>(s.container, 'input[type="file"]');
      await act(async () => { setInputFiles(input, [makePdfFile('broken.pdf')]); });
      await waitUntil(() => expect(s.container.textContent).toContain("This PDF didn't open"));
      await s.harness.flush();
      // Short settle: the exact trail below also proves nothing else was recorded after the failure.
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
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
      // The export's own pdf.js read is where the stale chunk fails to load.
      s.harness.pdfjs.getDocument.mockImplementationOnce((() => ({
        promise: Promise.reject(new TypeError('Failed to fetch dynamically imported module: https://pdkef.com/_astro/applyPageEdits.x.js')),
        destroy: async () => {},
      })) as never);
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
    s.restoreCanvas = installCanvasEdge();
    const originalCreateObjectURL = window.URL.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;
    window.URL.createObjectURL = vi.fn(() => { throw new Error('blocked'); });
    window.URL.revokeObjectURL = vi.fn();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500);
      const downloadButton = () => required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
        .find((button) => button.textContent.includes('Download')), 'Download button');
      await act(async () => { downloadButton().click(); });
      await settleUntil('the failure', () => s.container.textContent.includes('The download stopped.'));
      expect(s.container.textContent).not.toContain('Saved redacted');
      expect(downloadButton().disabled).toBe(false);
      // DEBT-31: the trigger is on the trail even though the export threw.
      expect(recentActions()).toContain('export');
      expect(await lifecycle()).toEqual([
        ['tool_page_viewed', 'redact'],
        ['tool_file_accepted', 'redact'],
        ['tool_first_edit', 'redact'],
        ['tool_operation_started', 'redact'],
        ['tool_operation_failed', 'redact'],
      ]);

      window.URL.createObjectURL = vi.fn(() => 'blob:redacted-pdf');
      await act(async () => { downloadButton().click(); });
      await settleUntil('the retry to be downloaded', () => (window.URL.revokeObjectURL as Mock).mock.calls.length > 0);
      expect(s.container.textContent).not.toContain('The download stopped.');
      expect(s.container.textContent).toContain('Saved redacted');
    } finally {
      errorSpy.mockRestore();
      window.URL.createObjectURL = originalCreateObjectURL;
      window.URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });

  it('RED-60: Remove it is a history step every export replays; Undo takes it back out', async () => {
    s.restoreCanvas = installCanvasEdge();
    const originalCreateObjectURL = window.URL.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;
    const downloads: Blob[] = [];
    window.URL.createObjectURL = vi.fn((blob: Blob) => { downloads.push(blob); return 'blob:redacted-pdf'; });
    window.URL.revokeObjectURL = vi.fn();
    // What the saved file says about itself: the check reads this title back and offers to remove it.
    const titleOf = async (blob: Blob) => (await PDFDocument.load(await blob.arrayBuffer(), { updateMetadata: false })).getTitle();
    try {
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
    } finally {
      window.URL.createObjectURL = originalCreateObjectURL;
      window.URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });

  // Design-review finding #5: the Download control never said what it would
  // produce, and the identity row's file name never hinted at the output
  // name either.
  describe('honest export count and output name (finding #5)', () => {
    it('shows no box count and the plain file name before any box exists', async () => {
      await loadFileWithoutArming(makePdfFile('secret.pdf'));

      expect(s.container.querySelector('[data-redact-count]')).toBeNull();
      const name = query(s.container, '[data-file-identity] [title]');
      expect(name.textContent).toBe('secret.pdf');
    });

    it('shows a live box count and the redacted_ output name once a box exists, updating as more are added', async () => {
      const drawArea = await loadFileAndGetDrawArea(makePdfFile('secret.pdf'));
      await drawBox(drawArea, 50, 200, 200, 500);

      expect(query(s.container, '[data-redact-count]').textContent).toBe('Saves with 1 box');
      expect(query(s.container, '[data-file-identity] [title]').textContent).toBe('redacted_secret.pdf');

      await armTool('Blackout');
      await drawBox(drawArea, 60, 220, 220, 520);

      expect(query(s.container, '[data-redact-count]').textContent).toBe('Saves with 2 boxes');
    });
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
      s.restoreCanvas = installCanvasEdge();
      const originalCreateObjectURL = window.URL.createObjectURL;
      const originalRevokeObjectURL = window.URL.revokeObjectURL;
      const createObjectURL = vi.fn(() => 'blob:redacted-pdf');
      window.URL.createObjectURL = createObjectURL;
      window.URL.revokeObjectURL = vi.fn();

      try {
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
        const exportRead = holdNextDocumentRead();
        await act(async () => {
          downloadButton.click();
        });
        await settleUntil('the export to reach its pdf.js read', exportRead.reached);

        const workspace = query(s.container, '[data-workspace]');
        expect(workspace.hasAttribute('data-processing')).toBe(true);

        // The keystroke the processing overlay cannot block.
        await act(async () => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }));
        });
        expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(2);

        createObjectURL.mockClear();
        await exportRead.runToEnd();

        // Two boxes are on the page; the blob that just resolved has one.
        // Nothing may offer it: no download, and no saved state kept for the
        // hand-off with bytes that are missing the box already restored (the
        // chips still show, but a tap makes a fresh export).
        expect(createObjectURL).not.toHaveBeenCalled();
        expect(s.container.textContent).not.toContain('Saved redacted_');

        // Dropping the export still has to hand the editor back.
        expect(query(s.container, '[data-workspace]')
          .hasAttribute('data-processing')).toBe(false);
      } finally {
        window.URL.createObjectURL = originalCreateObjectURL;
        window.URL.revokeObjectURL = originalRevokeObjectURL;
      }
    });

    // The invalidation effect above retires the export for a replacement file
    // too, and it used to follow that with setStatus('editing') - over a
    // 'loading' the new file's own loader had just set. That shipped once and
    // was fixed by hand; this pins it. The two states differ in what they
    // tell the person: a file still being read is loading, it has no edits
    // that could have changed mid-prepare.
    it('leaves a replacement file loading instead of reporting the export as invalidated', async () => {
      s.restoreCanvas = installCanvasEdge();
      const originalCreateObjectURL = window.URL.createObjectURL;
      const originalRevokeObjectURL = window.URL.revokeObjectURL;
      const createObjectURL = vi.fn(() => 'blob:redacted-pdf');
      window.URL.createObjectURL = createObjectURL;
      window.URL.revokeObjectURL = vi.fn();

      try {
        const drawArea = await loadFileAndGetDrawArea();
        await drawBox(drawArea, 50, 200, 200, 500);

        const downloadButton = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
          .find((button) => button.textContent.includes('Download')), 'Download button');
        const exportRead = holdNextDocumentRead();
        await act(async () => {
          downloadButton.click();
        });
        await settleUntil('the export to reach its pdf.js read', exportRead.reached);
        expect(query(s.container, '[data-workspace]')
          .hasAttribute('data-processing')).toBe(true);

        // Hold the replacement's document open, so the assertions below land
        // in the window where the new file is still being read.
        let resolveReplacementDocument!: (document: unknown) => void;
        s.harness.pdfjs.getDocument.mockImplementationOnce(() => ({
          promise: new Promise<unknown>((resolve) => { resolveReplacementDocument = resolve; }),
        }) as never);

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
          await new Promise((resolve) => setTimeout(resolve, 0));
        });

        // The new file is still being read: no editor, and nothing claiming
        // this person's edits changed underneath an export they no longer have.
        //
        // The announcement is what pins the guard. The workspace is mounted on
        // `pdfDocument` as well as on the status, and the replacement's own
        // loader nulls that in the same render that sets 'loading', so the
        // editor is off screen either way - dropping the guard makes this
        // window say the wrong thing rather than draw the wrong thing.
        expect(resolveReplacementDocument).toBeDefined();
        expect(s.container.querySelector('[data-workspace]')).toBeNull();
        expect(query(s.container, '[role="status"][aria-live="polite"]').textContent)
          .not.toContain('Your edits changed while the PDF was being prepared');

        // The replacement finishes loading and gets a clean editor of its own.
        await act(async () => {
          resolveReplacementDocument(s.harness.pdfjs.fakeDocument(2));
        });
        await waitUntil(() => expect(s.container.querySelector('[data-workspace]')).not.toBeNull());
        expect(s.container.querySelector('[data-workspace]')).not.toBeNull();
        expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(0);

        // And the export started from the file that is no longer open commits
        // nothing when it finally resolves.
        createObjectURL.mockClear();
        await exportRead.runToEnd();
        expect(createObjectURL).not.toHaveBeenCalled();
      } finally {
        window.URL.createObjectURL = originalCreateObjectURL;
        window.URL.revokeObjectURL = originalRevokeObjectURL;
      }
    });

    // The run's own keys cannot see an unmount: the refs they read still hold
    // the same file and revision after the editor has left the tree, so
    // without retiring the run here a finished export downloads a file for a
    // tool the person has navigated away from. Sign's unmount does the same
    // with activeExportRequestRef.
    it('does not download an export that finishes after the editor unmounts', async () => {
      s.restoreCanvas = installCanvasEdge();
      const originalCreateObjectURL = window.URL.createObjectURL;
      const originalRevokeObjectURL = window.URL.revokeObjectURL;
      const createObjectURL = vi.fn(() => 'blob:redacted-pdf');
      window.URL.createObjectURL = createObjectURL;
      window.URL.revokeObjectURL = vi.fn();

      try {
        const drawArea = await loadFileAndGetDrawArea();
        await drawBox(drawArea, 50, 200, 200, 500);

        const downloadButton = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
          .find((button) => button.textContent.includes('Download')), 'Download button');
        const exportRead = holdNextDocumentRead();
        await act(async () => {
          downloadButton.click();
        });
        await settleUntil('the export to reach its pdf.js read', exportRead.reached);

        act(() => render(null, s.container));
        createObjectURL.mockClear();

        await exportRead.runToEnd();

        expect(createObjectURL).not.toHaveBeenCalled();
      } finally {
        window.URL.createObjectURL = originalCreateObjectURL;
        window.URL.revokeObjectURL = originalRevokeObjectURL;
      }
    });
  });

  // ENC-02: a protected PDF is one quiet state, not an exception.
  describe('a protected PDF (ENC-02)', () => {
    const fixture = (name: string) => new File(
      [fs.readFileSync(`${__dirname}/../../lib/__fixtures__/encrypted/${name}`)],
      `${name}`,
      { type: 'application/pdf' },
    );
    const NEEDS_PASSWORD_TITLE = 'This PDF has a password';
    const PROTECTED_TITLE = 'This PDF is protected';

    function mockProtection(kind: 'needs-password' | 'owner-restricted') {
      s.harness.pdfjs.getDocument.mockImplementationOnce(() => ({
        promise: kind === 'needs-password'
          ? Promise.reject(Object.assign(new Error('No password given'), { name: 'PasswordException' }))
          : Promise.resolve({ numPages: 1, getPermissions: vi.fn(async () => []), destroy: vi.fn() }),
        destroy: vi.fn(),
      }) as never);
    }

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
      ['owner-only.pdf', 'owner-restricted', PROTECTED_TITLE, "It opens without a password, but Redact can't change it as it is. Unlock takes the protection off on your device, then you can redact it."],
      ['needs-password.pdf', 'needs-password', NEEDS_PASSWORD_TITLE, 'Unlock opens it on your device, then you can redact it.'],
    ] as const)('%s shows the state and never reaches the editor, pdf-lib or the failure count', async (name, kind, title, body) => {
      const load = vi.spyOn(PDFDocument, 'load');
      mockProtection(kind);
      await pick(fixture(name));

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
      mockProtection('owner-restricted');
      const protectedFile = fixture('owner-only.pdf');
      await pick(protectedFile);
      const location = { href: '/redact/' };
      vi.stubGlobal('location', location);
      try {
        await act(async () => { unlockButton().click(); });
        await settleUntil('the hand-off to Unlock', () => location.href === '/unlock/');
        // Parked for Unlock only, with the file's own bytes and the way back.
        expect(await s.harness.takeHandoff('redact')).toBeNull();
        const parked = required(await s.harness.takeHandoff('unlock'), 'the parked hand-off');
        expect(parked).toMatchObject({ fileName: 'owner-only.pdf', fileType: 'application/pdf', from: 'redact' });
        expect(new Uint8Array(parked.fileBytes!)).toEqual(new Uint8Array(await protectedFile.arrayBuffer()));
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('a failed save says so quietly and leaves the button usable', async () => {
      mockProtection('needs-password');
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await pick(fixture('needs-password.pdf'));
      // The device refuses the write (storage full): the real saveHandoff fails.
      const realIndexedDB = globalThis.indexedDB;
      globalThis.indexedDB = { open: () => {
        const request: { error?: DOMException; onerror?: () => void } = {};
        queueMicrotask(() => { request.error = new DOMException('full', 'QuotaExceededError'); request.onerror?.(); });
        return request;
      } } as unknown as IDBFactory;
      try {
        await act(async () => { unlockButton().click(); });
        await settleUntil('the failure line', () => (state()?.textContent ?? '').includes("Couldn't open Unlock with this file. Open Unlock and choose it there."));
      } finally {
        globalThis.indexedDB = realIndexedDB;
      }
      expect(unlockButton().disabled).toBe(false);
      expect(await s.harness.takeHandoff('unlock')).toBeNull();
      expect(await failedOperations()).toEqual([]);
      expect(s.harness.reports()).toMatchObject([{ area: 'handoff', step: 'save_handoff' }]);
    });

    it('choosing another file clears the state', async () => {
      mockProtection('needs-password');
      await pick(fixture('needs-password.pdf'));
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
