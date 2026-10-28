// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import PdfSecurityTool from './PdfSecurityTool.tsx';
import * as securityLib from './lib/security.js';
import { saveHandoff } from '#lib/drafts/draftStore.ts';
import { mockNativeFileShare } from '../../test/support/mockFileShare.js';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { installToolHarness, type ToolHarness } from '../../test/harness/toolHarness.ts';
import { waitUntil } from '../../test/harness/waitUntil.ts';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const fixtureBytes = (name: string) => new Uint8Array(readFileSync(path.resolve(__dirname, `../../lib/__fixtures__/encrypted/${name}.pdf`)));
const fixtureFile = (name: string) => new File([fixtureBytes(name)], `${name}.pdf`, { type: 'application/pdf' });

// EDGE: pdf.js cannot run its worker in jsdom, so the probe (the harness's, `harness.pdfjs`) cannot ask it; a
// test says what it answers (`probeAs`) and loads a real file of that kind. `realProbe` is the real classifier over pdf.js's Node
// build, for checking output bytes. Every other module (security.js, draftStore, analytics, error
// reports) runs for real.
const realProbe = async (bytes: ArrayBuffer | Uint8Array) => {
  const actual: any = await vi.importActual('#lib/pdf/pdfEncryption.ts');
  return actual.probeEncryption(bytes, () => import('pdfjs-dist/legacy/build/pdf.mjs'));
};

// The page preview (pdf.js painting) is the harness's too: harness.pdfjs.thumbnails.renderComparePreview.
import { recentActions, resetActionTrailForTests } from '#lib/telemetry/actionTrail.ts';

// What each protection answer looks like as a real file, so unlock and protect run for real on it.
type Protection = 'open' | 'needs-password' | 'owner-restricted' | 'unreadable';
const BYTES: Record<Protection, Uint8Array> = {
  open: fixtureBytes('plain'),
  'needs-password': fixtureBytes('needs-password'),
  'owner-restricted': fixtureBytes('owner-only'),
  unreadable: new TextEncoder().encode('this is not a PDF'),
};
// The fixture's own user password is "u"; any password protects.
const UNLOCK_PASSWORD = 'u';
const bufferOf = (bytes: Uint8Array) => bytes.slice().buffer as ArrayBuffer;

describe('PdfSecurityTool', () => {
  let container;
  let harness: ToolHarness;
  // What the probe answers, and so which real file `loadFile` picks by default.
  let state: Protection = 'open';
  const probeAs = (next: Protection) => { state = next; harness.pdfjs.probeAs(next); };
  const goodPassword = () => (state === 'needs-password' ? UNLOCK_PASSWORD : 'secret');
  const realFile = (name = 'test.pdf', kind: Protection = state) => new File([BYTES[kind]], name, { type: 'application/pdf' });
  // A real file whose next read (the one unlock or protect makes) can be held or failed.
  function gated(file: File) {
    const original = file.arrayBuffer.bind(file);
    const gate: { armed: boolean; skip: number; release: null | (() => void); failWith: Error | null } = { armed: false, skip: 0, release: null, failWith: null };
    file.arrayBuffer = () => {
      if (!gate.armed) return original();
      if (gate.skip > 0) { gate.skip -= 1; return original(); }
      gate.armed = false;
      if (gate.failWith) return Promise.reject(gate.failWith);
      return new Promise((resolve) => { gate.release = () => resolve(original()); });
    };
    return { file, gate };
  }

  beforeEach(() => {
    harness = installToolHarness();
    probeAs('open');
    harness.pdfjs.thumbnails.renderComparePreview.mockResolvedValue('data:image/png;base64,AAAA');
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.clearAllMocks();
    harness.restore();
  });

  const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  // The bytes behind the Download link.
  const outputBlob = () => harness.blobForUrl(container.querySelector('a[download]').getAttribute('href'));
  // Unlock and protect now run for real (pdf-lib), so wait for the run to finish instead of a fixed sleep.
  const settle = async () => {
    for (let waited = 0; waited < 5000 && container.querySelector('[data-processing]'); waited += 25) {
      await act(() => new Promise((resolve) => setTimeout(resolve, 25)));
    }
    await harness.flush();
  };

  function mount(props = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSecurityTool {...props} />, container);
    });
  }

  async function loadFile(name = 'test.pdf', file = realFile(name)) {
    const input = container.querySelector('input[type="file"]');
    
    await act(async () => {
      setInputFiles(input, [file]);
      await new Promise(resolve => setTimeout(resolve, 10)); // wait for async checks
    });
  }

  it('sends the page view on load, before any file says unlock or protect, and only once (DEBT-58)', async () => {
    mount({ intent: 'unlock' });
    const views = async () => { await harness.flush(); return harness.usageEvents('tool_page_viewed'); };
    expect(await views()).toMatchObject([{ name: 'tool_page_viewed', properties: { tool: 'unlock' } }]);
    await loadFile();
    expect(await views()).toHaveLength(1);
  });

  it('detects encrypted PDF and prompts to unlock', async () => {
    probeAs('needs-password');
    mount();
    
    await loadFile();
    
    const submitBtn = container.querySelector('button[type="submit"]');
    expect(submitBtn.textContent).toContain('Unlock PDF');
    expect(container.textContent).toContain("Enter its password to unlock");
  });

  it('detects unencrypted PDF and prompts to protect', async () => {
    probeAs('open');
    mount();
    
    await loadFile();
    
    const submitBtn = container.querySelector('button[type="submit"]');
    expect(submitBtn.textContent).toContain('Protect PDF');
    expect(container.textContent).toContain("Enter a password to protect it");
  });

  it('shows a read error, no form and no "Checking file" when the check fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    probeAs('unreadable');
    mount();

    await loadFile('broken.pdf');

    expect(container.querySelector('[role="alert"]').textContent).toContain('could not be read');
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('[role="status"]').textContent).not.toContain('Checking file');
    expect(container.querySelector('[role="status"]').textContent).toContain('could not be read');
  });

  it('does not count an unreadable file as a failed operation (DEBT-44)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    probeAs('unreadable');
    mount();
    await loadFile('broken.pdf');

    expect(container.querySelector('[role="alert"]').textContent).toContain('could not be read');
    await harness.flush();
    expect(harness.usageEvents('tool_operation_failed')).toEqual([]);
  });

  it('ignores a stale read failure after the file was replaced', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const firstProbe = harness.pdfjs.holdNextProbe();
    mount();

    await loadFile('slow-broken.pdf');
    await loadFile('fine.pdf');
    const dialog = container.querySelector('dialog[aria-labelledby="confirm-replace-title"]');
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Replace file');
    await act(async () => { confirm.click(); });
    await waitUntil(() => expect(container.querySelector('button[type="submit"]').textContent).toContain('Protect PDF'));

    await act(async () => {
      firstProbe.reject(new Error('probe died'));
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('button[type="submit"]').textContent).toContain('Protect PDF');
  });

  // Replace is the one file action this tool has now: Start over used to sit
  // beside it saying the same thing, once in the form above and again under the
  // result. Swapping the file while a password is typed still has to ask.
  it('confirms before a replacement closes the file with a password typed', async () => {
    probeAs('needs-password');
    mount();

    await loadFile();
    const passwordInput = container.querySelector('#security-password');
    await act(async () => {
      passwordInput.value = 'hunter2';
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await loadFile('replacement.pdf');

    const dialog = container.querySelector('dialog[aria-labelledby="confirm-replace-title"]');
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('replacement.pdf');
    expect(dialog.textContent).toContain('test.pdf');
    expect(dialog.textContent).toContain('stays in your recent files');

    const cancel = Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Cancel');
    await act(async () => cancel.click());
    expect(dialog.open).toBe(false);
    expect(container.textContent).toContain('test.pdf');
    expect(container.textContent).not.toContain('replacement.pdf');
    // Cancel keeps the old file, so it keeps whatever was typed for it too.
    expect(passwordInput.value).toBe('hunter2');

    await loadFile('replacement.pdf');
    const confirm = Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Replace file');
    await act(async () => { confirm.click(); });
    await waitUntil(() => expect(container.querySelector('dialog[aria-labelledby="confirm-replace-title"]')?.open).not.toBe(true));
    expect(container.textContent).toContain('replacement.pdf');
    // A confirmed replacement is a new file: the old password does not carry
    // over to it (handleFilesAdded resets password on every accepted file).
    await waitUntil(() => expect(container.querySelector('input[type="password"]')?.value).toBe(''));
  });

  // MEM-03: Replace always asks, even with nothing entered yet. The dialog no
  // longer guards work (the file stays in recent files with whatever was done
  // to it); it catches an unintended click.
  it('still asks before replacing when nothing has been entered yet', async () => {
    probeAs('needs-password');
    mount();

    await loadFile();
    await loadFile('replacement.pdf');

    const dialog = container.querySelector('dialog[aria-labelledby="confirm-replace-title"]');
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('closes test.pdf');
    expect(container.textContent).toContain('File "test.pdf" loaded');
  });

  it('performs unlocking successfully', async () => {
    const nativeShare = mockNativeFileShare();
    probeAs('needs-password');
    mount();
    
    await loadFile();

    const passwordInput = container.querySelector('input[type="password"]');
    await act(async () => {
      passwordInput.value = goodPassword();
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const form = container.querySelector('form');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await waitUntil(() => expect(container.querySelector('a[download]')).not.toBeNull());
    await settle();

    // The real unlock ran with the typed password: what came out opens with none.
    expect(await realProbe(await outputBlob().arrayBuffer())).toBe('open');
    expect(container.querySelector('a[download]').getAttribute('download')).toBe('test_unlocked.pdf');
    const shareButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Share');
    expect(shareButton).not.toBeUndefined();
    await act(async () => shareButton.click());
    expect(nativeShare.share.mock.calls[0][0].files[0].name).toBe('test_unlocked.pdf');
    nativeShare.restore();
  });

  describe('Share through the shared download flow', () => {
    const shareDone = async (shareRejection?: Error) => {
      const nativeShare = mockNativeFileShare();
      if (shareRejection) nativeShare.share.mockRejectedValueOnce(shareRejection);
      probeAs('needs-password');
      mount();
      await loadFile();
      const passwordInput = container.querySelector('input[type="password"]');
      await act(async () => {
        passwordInput.value = goodPassword();
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => {
        container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      await waitUntil(() => expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent.trim() === 'Share')).toBe(true));
      await settle();
      resetActionTrailForTests();
      const shareButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Share');
      await act(async () => { shareButton.click(); });
      await waitUntil(() => expect(nativeShare.share).toHaveBeenCalled());
      return nativeShare;
    };
    const announced = () => container.querySelector('p.sr-only[role="status"]').textContent.trim();

    it('says the PDF is still ready when the share sheet is canceled, and records nothing', async () => {
      const nativeShare = await shareDone(Object.assign(new Error('cancel'), { name: 'AbortError' }));
      expect(announced()).toBe('Sharing canceled. Your PDF is still ready.');
      expect(recentActions()).toEqual([]);
      nativeShare.restore();
    });

    it('says the sheet could not open when sharing fails, and records nothing', async () => {
      const nativeShare = await shareDone(new Error('boom'));
      expect(announced()).toBe('Could not open the share sheet. Please try again.');
      expect(recentActions()).toEqual([]);
      nativeShare.restore();
    });

    it('records the Download tap by the name "download"', async () => {
      const nativeShare = await shareDone();
      resetActionTrailForTests();
      const link = container.querySelector('a[download]');
      await act(async () => { link.addEventListener('click', (e) => e.preventDefault()); link.click(); });
      expect(recentActions()).toEqual(['download']);
      nativeShare.restore();
    });

    it('announces and records a completed share', async () => {
      const nativeShare = await shareDone();
      expect(announced()).toBe('Unlocked PDF shared successfully.');
      expect(recentActions()).toEqual(['share']);
      nativeShare.restore();
    });
  });

  it('performs protecting successfully', async () => {
    probeAs('open');
    mount();
    
    await loadFile();

    const passwordInput = container.querySelector('input[type="password"]');
    await act(async () => {
      passwordInput.value = goodPassword();
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const form = container.querySelector('form');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await waitUntil(() => expect(container.querySelector('a[download]')).not.toBeNull());
    await settle();

    // The real protect ran with the typed password: what came out asks for it.
    expect(await realProbe(await outputBlob().arrayBuffer())).toBe('needs-password');
    expect(container.querySelector('a[download]').getAttribute('download')).toBe('test_protected.pdf');
  });

  it('handles wrong password during unlock', async () => {
    probeAs('needs-password');
    mount();
    
    await loadFile();

    const passwordInput = container.querySelector('input[type="password"]');
    await act(async () => {
      passwordInput.value = 'wrong';
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const form = container.querySelector('form');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await waitUntil(() => expect(container.textContent).toContain("The password may be incorrect."));
    await settle();

    expect(container.textContent).toContain("The password may be incorrect.");
  });

  it('says a damaged file could not be unlocked, not that the password is wrong', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    probeAs('needs-password');
    mount();
    // The probe called it locked, but the bytes are damaged: unlock itself cannot read them.
    await loadFile('test.pdf', realFile('test.pdf', 'unreadable'));
    const passwordInput = container.querySelector('input[type="password"]');
    await act(async () => {
      passwordInput.value = 'whatever';
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await waitUntil(() => expect(container.textContent).toContain('This file could not be unlocked. It may be damaged.'));
    await settle();

    expect(container.textContent).toContain('This file could not be unlocked. It may be damaged.');
    expect(container.textContent).not.toContain('The password may be incorrect.');
  });

  // DEBT-34: the logs must tell our defects from a person's file or a mistyped password.
  async function submitPassword(value) {
    const passwordInput = container.querySelector('input[type="password"]');
    await act(async () => {
      passwordInput.value = value;
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await settle();
  }

  it('does not count a wrong password as a failed operation', async () => {
    probeAs('needs-password');
    mount();
    await loadFile();
    await submitPassword('wrong');
    await submitPassword('wrong again');

    expect(container.textContent).toContain('The password may be incorrect.');
    expect(harness.usageEvents('tool_operation_failed')).toEqual([]);
    expect(harness.reports()).toEqual([]);
  });

  it('counts a failure that is not the password as failed, and does not blame the file for our own error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    probeAs('needs-password');
    // Our own defect, not the file's: the read unlock makes fails with a ReferenceError.
    const { file, gate } = gated(realFile());
    gate.failWith = new ReferenceError('x is not defined');
    mount();
    await loadFile('test.pdf', file);
    gate.armed = true;
    await submitPassword(UNLOCK_PASSWORD);

    expect(container.textContent).toContain('Something went wrong while unlocking this file. Please try again.');
    expect(container.textContent).not.toContain('It may be damaged.');
    expect(harness.usageEvents('tool_operation_failed')).toMatchObject([{ properties: { tool: 'unlock' } }]);
    expect(harness.reports()).toMatchObject([{ area: 'pdf_tool_run', step: 'unlock', type: 'ReferenceError' }]);
  });

  it('reports what made a file unreadable, not the wrapper that says so', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    probeAs('needs-password');
    // A report only carries frames from our own built assets, which a test run has none of. Let each error
    // name its own class as that frame, so a report says which error it was made from.
    const prepare = Error.prepareStackTrace;
    Error.prepareStackTrace = (error) => `${error.name}: ${error.message}\n    at run (https://pdkef.com/_astro/${error.constructor.name}.js:1:1)`;
    try {
      mount();
      await loadFile('test.pdf', realFile('test.pdf', 'unreadable'));
      await submitPassword('whatever');

      expect(container.textContent).toContain('This file could not be unlocked. It may be damaged.');
      // What pdf-lib threw (no PDF header), not the UnreadablePdfError wrapper around it.
      expect(harness.reports()).toMatchObject([{ area: 'pdf_tool_run', step: 'unlock', name: 'MissingPDFHeaderError', stack: ['MissingPDFHeaderError.js:1:1'] }]);
    } finally {
      Error.prepareStackTrace = prepare;
    }
  });

  describe('Unlock with the real fixtures', () => {
    // The probe classifies the fixture bytes themselves (pdf.js's Node build) instead of answering a fixed state.
    const useRealProbe = () => harness.pdfjs.probe.mockImplementation((bytes) => realProbe(bytes));
    const type = async (value) => {
      const input = container.querySelector('input[type="password"]');
      await act(async () => {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    const submit = async () => {
      await act(async () => {
        container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      await settle();
    };

    it('unlocks an owner-password-only file with no input', async () => {
      useRealProbe();
      mount();
      await act(async () => {
        setInputFiles(container.querySelector('input[type="file"]'), [fixtureFile('owner-only')]);
      });
      // Real pdf-lib work: wait for the result rather than a fixed sleep, which
      // lost the race whenever the whole suite ran in parallel.
      await waitUntil(() => expect(container.textContent).toContain('The protection is off.'));

      // Unlocked with the empty password: no field, and the bytes behind Download classify as open.
      expect(container.querySelector('input[type="password"]')).toBeNull();
      expect(container.textContent).toContain('No password needed. The protection is off.');
      expect(container.querySelector('a[download]').getAttribute('download')).toBe('owner-only_unlocked.pdf');
      expect(await realProbe(await outputBlob().arrayBuffer())).toBe('open');
    });

    it('still asks for the password of a file that needs one, and tells wrong from right', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const unlockSpy = vi.spyOn(securityLib, 'unlockPdf');
      useRealProbe();
      mount();
      await act(async () => {
        setInputFiles(container.querySelector('input[type="file"]'), [fixtureFile('needs-password')]);
      });
      await waitUntil(() => expect(container.textContent).toContain('Enter its password to unlock'));
      expect(unlockSpy).not.toHaveBeenCalled();
      // Nothing is unlocked before a password is submitted.
      expect(container.querySelector('a[download]')).toBeNull();

      await type('wrong');
      await submit();
      await waitUntil(() => expect(container.textContent).toContain('The password may be incorrect.'));

      await type('u');
      await submit();
      await waitUntil(() => expect(container.querySelector('a[download]')).not.toBeNull());
      expect(container.textContent).not.toContain('The password may be incorrect.');
      expect(container.querySelector('a[download]')).not.toBeNull();
      expect(unlockSpy).toHaveBeenCalledTimes(2);
      expect(await realProbe(await outputBlob().arrayBuffer())).toBe('open');
      unlockSpy.mockRestore();
    });
  });

  describe('a file Redact sent here', () => {
    const buttonByText = (text) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === text);

    // The file another tool parked for Unlock, written through the real store the island reads on mount.
    const parkFor = (record) => saveHandoff('unlock', { fileType: 'application/pdf', ...record });

    async function unlockFromRedact(navigate) {
      probeAs('needs-password');
      await parkFor({ fileName: 'form.pdf', fileBytes: bufferOf(BYTES['needs-password']), from: 'redact' });
      const nativeShare = mockNativeFileShare();
      mount({ navigate });
      await waitUntil(() => expect(container.querySelector('input[type="password"]')).not.toBeNull());
      const passwordInput = container.querySelector('input[type="password"]');
      await act(async () => {
        passwordInput.value = goodPassword();
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => {
        container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      await waitUntil(() => expect(container.querySelector('a[download]')).not.toBeNull());
      await settle();
      return nativeShare;
    }

    it('keeps the way back above the preview on the phone: the layout carries the return-first modifier', async () => {
      await unlockFromRedact(vi.fn());
      const layout = container.querySelector('[data-fills-stage]');
      expect(layout.className).toContain('return-first');
    });

    it('leads back to Redact: Continue in Redact first, a quiet download, nothing else', async () => {
      const nativeShare = await unlockFromRedact(vi.fn());
      const text = container.textContent;
      expect(buttonByText('Continue in Redact')).not.toBeUndefined();
      expect(text.indexOf('Continue in Redact')).toBeLessThan(text.indexOf('Download unlocked PDF'));
      const download = Array.from(container.querySelectorAll('a[data-quiet-download]')).pop(); // the rail's link; the phone bar has its own first
      expect(download.getAttribute('download')).toBe('form_unlocked.pdf');
      expect(download.hasAttribute('data-quiet-download')).toBe(true);
      const share = buttonByText('Share');
      expect(share).not.toBeUndefined();
      expect(download.parentElement.contains(share)).toBe(true);
      expect(buttonByText('Sign')).toBeUndefined();
      expect(buttonByText('Redact')).toBeUndefined();
      nativeShare.restore();
    });

    it.each([['sign', 'Continue in Sign', '/sign/'], ['compress', 'Continue in Compress', '/compress/'], ['edit-pdf', 'Continue in Organize PDF', '/organize-pdf/'], ['merge', 'Continue in Merge', '/merge/']])('leads back to whichever tool sent it (%s)', async (from, label, href) => {
      probeAs('owner-restricted');
      await parkFor({ fileName: 'a.pdf', fileBytes: bufferOf(BYTES['owner-restricted']), from });
      const navigate = vi.fn();
      mount({ navigate });
      await waitUntil(() => expect(buttonByText(label)).not.toBeUndefined());
      await settle();
      await act(async () => { buttonByText(label).click(); });
      // The unlocked file is parked under the key of the tool that sent it, then it navigates.
      await waitUntil(() => expect(navigate).toHaveBeenCalled());
      const parked = await harness.takeHandoff(from);
      expect(parked?.fileName).toBe('a_unlocked.pdf');
      expect(await realProbe(parked.fileBytes)).toBe('open');
      expect(navigate).toHaveBeenCalledWith(href);
    });

    it('ignores a sender it does not know and shows the ordinary next steps', async () => {
      probeAs('owner-restricted');
      await parkFor({ fileName: 'a.pdf', fileBytes: bufferOf(BYTES['owner-restricted']), from: 'nowhere' });
      mount({ navigate: vi.fn() });
      await waitUntil(() => expect(buttonByText('Redact')).not.toBeUndefined());
      await settle();
      expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent.startsWith('Continue in'))).toBe(false);
      expect(buttonByText('Redact')).not.toBeUndefined();
    });

    it('Continue in Redact hands the unlocked file back and goes there', async () => {
      const navigate = vi.fn();
      await unlockFromRedact(navigate);
      await act(async () => { buttonByText('Continue in Redact').click(); });
      await waitUntil(() => expect(navigate).toHaveBeenCalled());
      const record = await harness.takeHandoff('redact');
      expect(record?.fileName).toBe('form_unlocked.pdf');
      expect(await realProbe(record.fileBytes)).toBe('open');
      expect(navigate).toHaveBeenCalledWith('/redact/');
    });
  });

  describe('a file handed off from another tool', () => {
    it('loads as if picked here and shows the password prompt', async () => {
      probeAs('needs-password');
      await saveHandoff('unlock', {
        fileName: 'from-redact.pdf',
        fileType: 'application/pdf',
        fileBytes: bufferOf(BYTES['needs-password']),
      });
      mount();
      await waitUntil(() => expect(container.textContent).toContain('from-redact.pdf'));

      // The island collected it: a hand-off is read once and consumed.
      expect(await harness.takeHandoff('unlock')).toBeNull();
      expect(container.textContent).toContain('from-redact.pdf');
      expect(container.querySelector('button[type="submit"]').textContent).toContain('Unlock PDF');
      expect(container.textContent).toContain('Enter its password to unlock');
    });
  });

  describe('next steps after unlocking', () => {
    const buttonByText = (text) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === text);

    async function unlockDone(navigate) {
      probeAs('needs-password');
      mount({ navigate });
      await loadFile('doc.pdf');
      const passwordInput = container.querySelector('input[type="password"]');
      await act(async () => {
        passwordInput.value = goodPassword();
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => {
        container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      await settle();
    }

    it('the finished unlock replaces the form: the Unlock button becomes the Download', async () => {
      await unlockDone(vi.fn());
      expect(container.querySelector('form')).toBeNull();
      expect(container.querySelector('input[type="password"]')).toBeNull();
      expect(buttonByText('Unlock PDF')).toBeUndefined();
      expect(container.querySelector('a[download]')).not.toBeNull();
    });

    it('protect keeps its password as the setting and swaps only the button for Download', async () => {
      probeAs('open');
      mount();
      await loadFile();
      const passwordInput = container.querySelector('input[type="password"]');
      await act(async () => {
        passwordInput.value = goodPassword();
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => {
        container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      await settle();
      expect(container.querySelector('input[type="password"]')).not.toBeNull();
      expect(buttonByText('Protect PDF')).toBeUndefined();
      expect(container.querySelector('a[download]')).not.toBeNull();
    });

    it('Share leads the finish row, then Redact and Sign, all after the Download element', async () => {
      const nativeShare = mockNativeFileShare();
      await unlockDone(vi.fn());
      const share = buttonByText('Share');
      const row = buttonByText('Redact').parentElement;
      expect(Array.from(row.querySelectorAll('button')).map((b) => b.textContent.trim())).toEqual(['Share', 'Redact', 'Sign']);
      const download = container.querySelector('a[download]:not([data-quiet-download])');
      expect(download.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      nativeShare.restore();
    });

    it('protect done shows Download and Share, and no next-tool actions', async () => {
      const nativeShare = mockNativeFileShare();
      probeAs('open');
      mount();
      await loadFile();
      const passwordInput = container.querySelector('input[type="password"]');
      await act(async () => {
        passwordInput.value = goodPassword();
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => {
        container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      await settle();
      expect(container.querySelector('a[download]')).not.toBeNull();
      expect(buttonByText('Share')).not.toBeUndefined();
      expect(buttonByText('Redact')).toBeUndefined();
      expect(buttonByText('Sign')).toBeUndefined();
      nativeShare.restore();
    });

    it('the unlock finish offers Redact and Sign hand-offs in the shared finish row; protect offers none', async () => {
      await unlockDone(vi.fn());
      const row = buttonByText('Redact').parentElement;
      expect(row.getAttribute('data-count')).not.toBeNull();
      expect(Array.from(row.querySelectorAll('button')).map((b) => b.textContent.trim())).toContain('Sign');
      expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent.startsWith('Continue in'))).toBe(false);
    });

    it('puts Redact and Sign after Download, never before', async () => {
      await unlockDone(vi.fn());
      // The rail's finish block: the phone bar's quiet Download sits earlier in the page and would pass for it.
      const block = container.querySelector('a[download]:not([data-quiet-download])').parentElement.textContent;
      expect(block.indexOf('Download')).toBeGreaterThanOrEqual(0);
      expect(block.indexOf('Download')).toBeLessThan(block.indexOf('Redact'));
      expect(block.indexOf('Redact')).toBeLessThan(block.indexOf('Sign'));
    });

    it('does not carry the return-first modifier without a return tool', async () => {
      await unlockDone(vi.fn());
      expect(container.querySelector('[data-fills-stage]').className).not.toContain('return-first');
    });

    it('isolates the size in right-to-left text, in the Download element and the phone bar', async () => {
      probeAs('needs-password');
      mount({ messages: { dir: 'rtl' } });
      await loadFile();
      const input = container.querySelector('input[type="password"]');
      await act(async () => {
        input.value = 'u';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => {
        container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      await waitUntil(() => expect(container.querySelector('a[download]')).not.toBeNull());
      await settle();
      const big = container.querySelector('a[download]:not([data-quiet-download])').parentElement.textContent;
      expect(big).toMatch(/\u2066[^\u2069]*\u2069/);
    });

    it.each([['Redact', 'redact', '/redact/'], ['Sign', 'sign', '/sign/']])('%s saves the unlocked bytes and navigates', async (label, key, href) => {
      const navigate = vi.fn();
      await unlockDone(navigate);
      await act(async () => { buttonByText(label).click(); });
      await waitUntil(() => expect(navigate).toHaveBeenCalledWith(href));

      // Parked once, under the key of the tool it goes to and no other.
      const other = key === 'redact' ? 'sign' : 'redact';
      expect(await harness.takeHandoff(other)).toBeNull();
      const record = await harness.takeHandoff(key);
      expect(record?.fileName).toBe('doc_unlocked.pdf');
      expect(record.fileType).toBe('application/pdf');
      expect(await realProbe(record.fileBytes)).toBe('open');
      expect(navigate).toHaveBeenCalledWith(href);
    });

    it('shows a quiet line and re-enables the buttons when the save fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const navigate = vi.fn();
      await unlockDone(navigate);
      // Storage refuses the write (a locked-down browser has no IndexedDB), so the real save answers false.
      globalThis.indexedDB = undefined;
      await act(async () => { buttonByText('Sign').click(); });
      await waitUntil(() => expect(container.textContent).toContain('Could not hand this off. Download it instead and open it there.'));

      expect(navigate).not.toHaveBeenCalled();
      expect(container.textContent).toContain('Could not hand this off. Download it instead and open it there.');
      expect(buttonByText('Sign').disabled).toBe(false);
      expect(buttonByText('Redact').disabled).toBe(false);
    });

    it('does not offer them after protecting', async () => {
      probeAs('open');
      mount();
      await loadFile();
      const passwordInput = container.querySelector('input[type="password"]');
      await act(async () => {
        passwordInput.value = goodPassword();
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => {
        container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      await settle();
      expect(buttonByText('Redact')).toBeUndefined();
      expect(buttonByText('Sign')).toBeUndefined();
    });
  });

  // DEBT-18: nothing was captured around either await here, so whichever
  // promise resolved last won. A slow check on a large encrypted file landing
  // after a small plain one is picked left the form offering Unlock for a
  // file with no password, and handleSubmit then took the unlockPdf branch,
  // which fails with "The password may be incorrect" forever.
  describe('a file replaced mid-flight (DEBT-18)', () => {
    async function confirmReplace() {
      const dialog = container.querySelector('dialog[aria-labelledby="confirm-replace-title"]');
      const confirm = Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Replace file');
      await act(async () => { confirm.click(); });
      await waitUntil(() => expect(container.querySelector('dialog[aria-labelledby="confirm-replace-title"]')?.open).not.toBe(true));
    }

    it('keeps the mode of the file that is actually loaded', async () => {
      const firstCheck = harness.pdfjs.holdNextProbe();
      mount();

      await loadFile('big-encrypted.pdf');
      // The slow check has not answered yet, so there is no form to offer.
      expect(container.querySelector('form')).toBeNull();

      await loadFile('small-plain.pdf');
      await confirmReplace();
      await waitUntil(() => expect(container.querySelector('button[type="submit"]').textContent).toContain('Protect PDF'));

      // Only now does the replaced file's check answer, with the other answer.
      await act(async () => {
        firstCheck.release('needs-password');
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(container.querySelector('button[type="submit"]').textContent).toContain('Protect PDF');
      expect(container.textContent).toContain('Enter a password to protect it');
    });

    it('never writes the replaced file\'s bytes under the new file\'s name', async () => {
      probeAs('open');
      // The first file's protect is held open at the read it makes, after the file is loaded.
      const { file: firstFile, gate } = gated(realFile('first.pdf'));
      mount();

      await loadFile('first.pdf', firstFile);
      gate.armed = true;
      const passwordInput = container.querySelector('input[type="password"]');
      await act(async () => {
        passwordInput.value = goodPassword();
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => {
        container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      // The protect has started and is waiting on the first file's read.
      expect(typeof gate.release).toBe('function');

      await loadFile('second.pdf');
      await confirmReplace();

      await act(async () => { gate.release(); });
      await settle();
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); }); // window: the replaced file's output must not land

      expect(container.textContent).toContain('second.pdf');
      expect(container.querySelector('a[download]')).toBeNull();
      expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent.trim() === 'Share')).toBe(false);
    });
  });

  it('records add and export by name only; the password never reaches the trail', async () => {
    resetActionTrailForTests();
    probeAs('open');
    mount();
    await loadFile('private_name.pdf');
    const input = container.querySelector('#security-password');
    await act(async () => {
      input.value = 'hunter2-secret';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await settle();
    expect(recentActions()).toEqual(['add_files', 'export']);
    expect(JSON.stringify(recentActions())).not.toMatch(/hunter2|private_name/);
  });

  describe('the page preview (HERO-07)', () => {
    const tagOf = () => container.querySelector('[data-security-preview] [data-preview-tag]')?.textContent;
    const submitWith = async (pw) => {
      const input = container.querySelector('input[type="password"]');
      await act(async () => {
        input.value = pw;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => {
        container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      await settle();
    };

    it('shows a Locked placeholder, with no render attempted, for a file that needs a password', async () => {
      probeAs('needs-password');
      mount();
      await loadFile();
      expect(container.querySelector('[data-security-preview]')).not.toBeNull();
      expect(tagOf()).toBe('Locked');
      expect(container.querySelector('[data-security-preview] img')).toBeNull();
      expect(harness.pdfjs.thumbnails.renderComparePreview).not.toHaveBeenCalled();
    });

    it('renders page 1 of the input, tagged Not protected, in protect mode', async () => {
      probeAs('open');
      mount();
      await loadFile();
      await waitUntil(() => expect(tagOf()).toBe('Not protected'));
      await flush(); // settle window for the exact render count
      expect(harness.pdfjs.thumbnails.renderComparePreview).toHaveBeenCalledTimes(1);
      expect(harness.pdfjs.thumbnails.renderComparePreview.mock.calls[0][0]).toBeInstanceOf(File);
      expect(container.querySelector('[data-security-preview] img').getAttribute('src')).toBe('data:image/png;base64,AAAA');
    });

    it('renders the unlocked output bytes, tagged Unlocked, after a successful unlock', async () => {
      probeAs('needs-password');
      mount();
      await loadFile();
      await submitWith(goodPassword());
      await waitUntil(() => expect(tagOf()).toBe('Unlocked'));
      await waitUntil(() => expect(harness.pdfjs.thumbnails.renderComparePreview.mock.calls.at(-1)[0]).not.toBeInstanceOf(File));
      const last = harness.pdfjs.thumbnails.renderComparePreview.mock.calls.at(-1)[0];
      expect(last).not.toBeInstanceOf(File);
      // What is drawn is the unlocked output, which no longer asks for a password.
      expect(await realProbe(await last.arrayBuffer())).toBe('open');
    });

    it('is tagged Protected after protecting', async () => {
      probeAs('open');
      mount();
      await loadFile();
      await submitWith(goodPassword());
      await waitUntil(() => expect(tagOf()).toBe('Protected'));
    });

    it('keeps the placeholder and reports when the render throws', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      probeAs('open');
      const boom = new Error('render failed');
      harness.pdfjs.thumbnails.renderComparePreview.mockRejectedValue(boom);
      mount();
      await loadFile();
      await waitUntil(() => expect(harness.reports()).toHaveLength(1));
      await harness.flush();
      expect(harness.reports()).toMatchObject([{ area: 'pdf_render', step: 'render_security_preview', type: 'Error' }]);
      expect(container.querySelector('[data-security-preview] img')).toBeNull();
      expect(tagOf()).toBe('Not protected');
    });

    it('keeps the previous image on screen until the new render lands', async () => {
      probeAs('owner-restricted');
      // The automatic unlock is held open at the read it makes, after the probe's own read.
      const { file, gate } = gated(realFile());
      gate.armed = true;
      gate.skip = 1;
      let resolveNew;
      harness.pdfjs.thumbnails.renderComparePreview.mockReset();
      harness.pdfjs.thumbnails.renderComparePreview
        .mockResolvedValueOnce('data:image/png;base64,OLD')
        .mockReturnValueOnce(new Promise((resolve) => { resolveNew = resolve; }));
      mount();
      await loadFile('test.pdf', file);
      // The input page is drawn while the unlock runs; then the output replaces it.
      await waitUntil(() => expect(container.querySelector('[data-security-preview] img')?.getAttribute('src')).toBe('data:image/png;base64,OLD'));
      await act(async () => { gate.release(); });
      await waitUntil(() => expect(harness.pdfjs.thumbnails.renderComparePreview.mock.calls.length).toBeGreaterThanOrEqual(2));
      expect(harness.pdfjs.thumbnails.renderComparePreview).toHaveBeenCalledTimes(2);
      expect(container.querySelector('[data-security-preview] img').getAttribute('src')).toBe('data:image/png;base64,OLD');
      expect(container.querySelector('[data-page-frame]').getAttribute('aria-busy')).toBe('true');
      await act(async () => { resolveNew('data:image/png;base64,NEW'); });
      expect(container.querySelector('[data-security-preview] img').getAttribute('src')).toBe('data:image/png;base64,NEW');
      expect(container.querySelector('[data-page-frame]').getAttribute('aria-busy')).toBeNull();
    });

    it('does not report the preview when the tool run already failed for the same file', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      probeAs('owner-restricted');
      harness.pdfjs.thumbnails.renderComparePreview.mockImplementation(() => new Promise((_, reject) => setTimeout(() => reject(new Error('render failed')), 5)));
      mount();
      // The unlock reads damaged bytes and fails; the preview render failing for the same file adds no second report.
      await loadFile('test.pdf', realFile('test.pdf', 'unreadable'));
      await waitUntil(() => expect(harness.reports()).toHaveLength(1));
      await flush(); // window: the failing preview render must add no second report
      await settle();
      expect(harness.reports()).toHaveLength(1);
      expect(harness.reports()[0]).toMatchObject({ area: 'pdf_tool_run', step: 'unlock' });
    });
  });

  describe('the strip while loading or failing (HERO-07 review)', () => {
    const stripText = () => container.querySelector('[class*="strip"]')?.textContent ?? '';
    it('keeps the file name and Replace when the file cannot be read', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      probeAs('unreadable');
      mount();
      await loadFile('broken.pdf');
      expect(stripText()).toContain('broken.pdf');
      expect(Array.from(container.querySelectorAll('button')).some((b) => /Replace/.test(b.textContent))).toBe(true);
      expect(container.querySelector('[role="alert"]')).not.toBeNull();
    });

    it('shows the file name while the encryption check is pending', async () => {
      let resolveProbe;
      harness.pdfjs.probe.mockReturnValue(new Promise((resolve) => { resolveProbe = resolve; }));
      mount();
      await loadFile('slow.pdf');
      expect(stripText()).toContain('slow.pdf');
      await act(async () => { resolveProbe('open'); });
    });
  });
});
