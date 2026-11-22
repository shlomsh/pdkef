// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach, beforeAll } from 'vitest';
import PdfSecurityTool from './PdfSecurityTool.tsx';
import { protectPdf } from './lib/security.js';
import { probeEncryption } from '#lib/pdf/pdfEncryption.ts';
import { COMPARE_PREVIEW_WIDTH, renderComparePreview } from '#lib/pdf/thumbnails.js';
import { getPdfLib } from '#lib/pdf/pdfLib.js';
import { saveHandoff } from '#lib/drafts/draftStore.ts';
import { mockNativeFileShare } from '../../test/support/mockFileShare.js';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { installBrowserToolHarness, type BrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork, worker } from '../../test/support/network.browser.ts';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { drainPromises } from '../../test/support/drainPromises.ts';
import plainUrl from '../../lib/__fixtures__/encrypted/plain.pdf?url';
import needsPasswordUrl from '../../lib/__fixtures__/encrypted/needs-password.pdf?url';
import ownerOnlyUrl from '../../lib/__fixtures__/encrypted/owner-only.pdf?url';
import { recentActions, resetActionTrailForTests } from '#lib/telemetry/actionTrail.ts';

answerNetwork();

vi.mock('#lib/pdf/pdfEncryption.ts', { spy: true });
vi.mock('#lib/pdf/thumbnails.js', { spy: true });
vi.mock('./lib/security.js', { spy: true });
vi.mock('#lib/drafts/draftStore.ts', { spy: true });

// What each protection answer looks like as a real file, so the real check, unlock and protect run on it.
type Protection = 'open' | 'needs-password' | 'owner-restricted' | 'unreadable';
const BYTES = {} as Record<Protection, Uint8Array>;
const fetchedBytes = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer());
beforeAll(async () => {
  BYTES.open = await fetchedBytes(plainUrl);
  BYTES['needs-password'] = await fetchedBytes(needsPasswordUrl);
  BYTES['owner-restricted'] = await fetchedBytes(ownerOnlyUrl);
  BYTES.unreadable = new TextEncoder().encode('this is not a PDF');
});
const fixtureFile = (name: string, url: string) => fetchedBytes(url).then((bytes) => new File([bytes], `${name}.pdf`, { type: 'application/pdf' }));
// The fixture's own user password is "u"; any password protects.
const UNLOCK_PASSWORD = 'u';
const bufferOf = (bytes: Uint8Array) => bytes.slice().buffer as ArrayBuffer;
// What a file's bytes ask of a person, by the real pdf.js check.
const realProbe = (bytes: ArrayBuffer | Uint8Array) => probeEncryption(bytes);

describe('PdfSecurityTool', () => {
  let container;
  let harness: BrowserToolHarness;
  // Which real file `realFile` picks by default.
  let state: Protection = 'open';
  const probeAs = (next: Protection) => { state = next; };
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

  // The next check waits on a gate the test owns, then gives the real answer for the bytes it is handed
  // (or the failure the test chose). `settled` says the check has handed its result to the tool.
  function holdProbe() {
    const gate = Promise.withResolvers<void>();
    const done = Promise.withResolvers<void>();
    let failure: unknown = null;
    // forced: a check that has not answered yet, until the test releases it
    vi.mocked(probeEncryption).mockImplementationOnce(async (bytes) => {
      try {
        await gate.promise;
        if (failure) throw failure;
        const actual = await vi.importActual<typeof import('#lib/pdf/pdfEncryption.ts')>('#lib/pdf/pdfEncryption.ts');
        return await actual.probeEncryption(bytes);
      } finally {
        done.resolve();
      }
    });
    return {
      release: () => gate.resolve(),
      reject: (error: unknown) => { failure = error; gate.resolve(); },
      settled: done.promise,
    };
  }

  beforeEach(async () => {
    harness = await installBrowserToolHarness();
    vi.mocked(probeEncryption).mockReset();
    vi.mocked(renderComparePreview).mockReset();
    vi.mocked(protectPdf).mockReset();
    vi.mocked(saveHandoff).mockReset();
    probeAs('open');
  });

  afterEach(async () => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.restoreAllMocks();
    await harness.restore();
  });

  // Lets the promise work already queued run, then renders what it set.
  const drain = () => act(async () => { await drainPromises(); });
  // The bytes behind the Download link.
  const outputBlob = () => harness.blobForUrl(container.querySelector('a[download]').getAttribute('href'));
  // Unlock and protect run for real (pdf-lib), so wait for the run to finish instead of a fixed sleep.
  const settle = async () => {
    await waitUntil(() => container.querySelector('[data-processing]') === null);
    await harness.flush();
  };

  function mount(props = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSecurityTool {...props} />, container);
    });
  }

  const replaceDialogOpen = () => container.querySelector('dialog[aria-labelledby="confirm-replace-title"]')?.open === true;
  const checked = () => {
    const text = container.querySelector('[role="status"]')?.textContent;
    return text !== undefined && !text.includes('Checking file');
  };
  // Waits for what a person sees once the file is read: the form, the error, or the question about replacing.
  async function loadFile(name = 'test.pdf', file = realFile(name), { wait = true } = {}) {
    const input = container.querySelector('input[type="file"]');

    await act(async () => {
      setInputFiles(input, [file]);
      await drainPromises();
    });
    if (wait) await waitUntil(() => replaceDialogOpen() || checked());
  }

  it('sends the page view on load, before any file says unlock or protect, and only once (DEBT-58)', async () => {
    const viewSent = Promise.withResolvers<void>();
    const onRequest = async ({ request }: { request: Request }) => {
      if (request.method === 'POST' && (await request.clone().text()).includes('"tool_page_viewed"')) viewSent.resolve();
    };
    worker.events.on('request:start', onRequest);
    mount({ intent: 'unlock' });
    await viewSent.promise;
    worker.events.removeListener('request:start', onRequest);
    const views = async () => { await drain(); await harness.flush(); return harness.usageEvents('tool_page_viewed'); };
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
    const firstProbe = holdProbe();
    mount();

    await loadFile('slow-broken.pdf', realFile('slow-broken.pdf'), { wait: false });
    await loadFile('fine.pdf');
    const dialog = container.querySelector('dialog[aria-labelledby="confirm-replace-title"]');
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Replace file');
    await act(async () => { confirm.click(); });
    await waitUntil(() => expect(container.querySelector('button[type="submit"]').textContent).toContain('Protect PDF'));

    await act(async () => {
      firstProbe.reject(new Error('probe died'));
      await firstProbe.settled;
      await drainPromises();
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
    expect(await realProbe(await (await outputBlob()).arrayBuffer())).toBe('open');
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
    expect(await realProbe(await (await outputBlob()).arrayBuffer())).toBe('needs-password');
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
    // forced: the check calls the file locked while its bytes are damaged, which no real file answers
    vi.mocked(probeEncryption).mockResolvedValueOnce('needs-password');
    mount();
    // The check called it locked, but the bytes are damaged: unlock itself cannot read them.
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
    // forced: the check calls the file locked while its bytes are damaged, which no real file answers
    vi.mocked(probeEncryption).mockResolvedValueOnce('needs-password');
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
      mount();
      const file = await fixtureFile('owner-only', ownerOnlyUrl);
      await act(async () => {
        setInputFiles(container.querySelector('input[type="file"]'), [file]);
      });
      // Real pdf-lib work: wait for the result rather than a fixed sleep, which
      // lost the race whenever the whole suite ran in parallel.
      await waitUntil(() => expect(container.textContent).toContain('The protection is off.'));

      // Unlocked with the empty password: no field, and the bytes behind Download classify as open.
      expect(container.querySelector('input[type="password"]')).toBeNull();
      expect(container.textContent).toContain('No password needed. The protection is off.');
      expect(container.querySelector('a[download]').getAttribute('download')).toBe('owner-only_unlocked.pdf');
      expect(await realProbe(await (await outputBlob()).arrayBuffer())).toBe('open');
    });

    it('still asks for the password of a file that needs one, and tells wrong from right', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mount();
      const file = await fixtureFile('needs-password', needsPasswordUrl);
      await act(async () => {
        setInputFiles(container.querySelector('input[type="file"]'), [file]);
      });
      await waitUntil(() => expect(container.textContent).toContain('Enter its password to unlock'));
      expect(container.querySelector('[data-processing]')).toBeNull();
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
      expect(container.querySelector('[data-processing]')).toBeNull();
      expect(await realProbe(await (await outputBlob()).arrayBuffer())).toBe('open');
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
      await waitUntil(() => expect(container.querySelector('button[type="submit"]')).not.toBeNull());

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
      // forced: storage refuses the write, as a locked-down browser without IndexedDB does
      vi.mocked(saveHandoff).mockResolvedValueOnce(false);
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
      const firstCheck = holdProbe();
      mount();

      await loadFile('big-encrypted.pdf', realFile('big-encrypted.pdf', 'needs-password'), { wait: false });
      // The slow check has not answered yet, so there is no form to offer.
      expect(container.querySelector('form')).toBeNull();

      await loadFile('small-plain.pdf');
      await confirmReplace();
      await waitUntil(() => expect(container.querySelector('button[type="submit"]').textContent).toContain('Protect PDF'));

      // Only now does the replaced file's check answer, with the other answer.
      await act(async () => {
        firstCheck.release();
        await firstCheck.settled;
        await drainPromises();
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
      await waitUntil(() => expect(container.querySelector('[data-security-preview] img')).not.toBeNull());
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

      await act(async () => {
        gate.release();
        await vi.mocked(protectPdf).mock.results[0].value; // the replaced file's protect has produced its output
        await drainPromises(); // the tool's continuation after the protect: the replaced file's output must not land
      });
      await settle();

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
    const previewImage = () => container.querySelector('[data-security-preview] img');
    const frameBusy = () => container.querySelector('[data-page-frame]')?.getAttribute('aria-busy');
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
    const decodedSize = async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      return { width: img.naturalWidth, height: img.naturalHeight };
    };

    it('shows a Locked placeholder, with no render attempted, for a file that needs a password', async () => {
      probeAs('needs-password');
      mount();
      await loadFile();
      expect(container.querySelector('[data-security-preview]')).not.toBeNull();
      expect(tagOf()).toBe('Locked');
      expect(container.querySelector('[data-security-preview] img')).toBeNull();
      expect(renderComparePreview).not.toHaveBeenCalled();
    });

    it('renders page 1 of the input, tagged Not protected, in protect mode', async () => {
      probeAs('open');
      mount();
      await loadFile();
      await waitUntil(() => expect(tagOf()).toBe('Not protected'));
      await waitUntil(() => expect(previewImage()).not.toBeNull());
      await drain(); // so a second render would show
      expect(renderComparePreview).toHaveBeenCalledTimes(1);
      expect(vi.mocked(renderComparePreview).mock.calls[0][0]).toBeInstanceOf(File);
      const src = previewImage().getAttribute('src');
      expect(src).toMatch(/^data:image\/png;base64,/);
      const size = await decodedSize(src);
      const { PDFDocument } = await getPdfLib();
      const page = (await PDFDocument.load(BYTES.open)).getPage(0).getSize();
      expect(size.width).toBe(COMPARE_PREVIEW_WIDTH);
      expect(size.height).toBe(Math.ceil((COMPARE_PREVIEW_WIDTH * page.height) / page.width));
    });

    it('renders the unlocked output bytes, tagged Unlocked, after a successful unlock', async () => {
      probeAs('needs-password');
      mount();
      await loadFile();
      await submitWith(goodPassword());
      await waitUntil(() => expect(tagOf()).toBe('Unlocked'));
      await waitUntil(() => expect(frameBusy()).not.toBe('true'));
      const last = vi.mocked(renderComparePreview).mock.calls.at(-1)[0];
      expect(last).not.toBeInstanceOf(File);
      // What is drawn is the unlocked output, which no longer asks for a password.
      expect(await realProbe(await last.arrayBuffer())).toBe('open');
      expect(previewImage().getAttribute('src')).toMatch(/^data:image\/png;base64,/);
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
      // forced: the page render fails
      vi.mocked(renderComparePreview).mockRejectedValueOnce(boom);
      mount();
      await loadFile();
      await waitUntil(() => expect(frameBusy()).not.toBe('true'));
      await harness.flush();
      expect(harness.reports()).toMatchObject([{ area: 'pdf_render', step: 'render_security_preview', type: 'Error' }]);
      expect(container.querySelector('[data-security-preview] img')).toBeNull();
      expect(tagOf()).toBe('Not protected');
    });

    it('keeps the previous image on screen until the new render lands', async () => {
      probeAs('owner-restricted');
      const actualRender = (await vi.importActual<typeof import('#lib/pdf/thumbnails.js')>('#lib/pdf/thumbnails.js')).renderComparePreview;
      // The automatic unlock is held open at the read it makes, after the probe's read and the input page render's.
      const { file, gate } = gated(realFile());
      gate.armed = true;
      gate.skip = 2;
      mount();
      await loadFile('test.pdf', file);
      // The input page is drawn while the unlock waits; then the output replaces it.
      await waitUntil(() => expect(previewImage()).not.toBeNull());
      const firstSrc = previewImage().getAttribute('src');
      expect(firstSrc).toMatch(/^data:image\/png;base64,/);
      expect(await vi.mocked(renderComparePreview).mock.results[0].value).toBe(firstSrc);
      expect(frameBusy()).not.toBe('true');
      // forced: the output's render is held open until the test releases it
      const renderHeld = Promise.withResolvers<void>();
      const renderStarted = Promise.withResolvers<void>();
      let secondSrc;
      vi.mocked(renderComparePreview).mockImplementationOnce(async (...args) => {
        renderStarted.resolve();
        await renderHeld.promise;
        secondSrc = await actualRender(...args);
        return secondSrc;
      });
      await act(async () => { gate.release(); });
      await waitUntil(() => expect(frameBusy()).toBe('true'));
      await renderStarted.promise;
      expect(renderComparePreview).toHaveBeenCalledTimes(2);
      expect(previewImage().getAttribute('src')).toBe(firstSrc);
      await act(async () => { renderHeld.resolve(); });
      await waitUntil(() => expect(frameBusy()).not.toBe('true'));
      expect(previewImage().getAttribute('src')).toBe(secondSrc);
    });

    it('does not report the preview when the tool run already failed for the same file', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const renderStarted = Promise.withResolvers<void>();
      const renderFailed = Promise.withResolvers<void>();
      // forced: the check calls the file protected only by its owner while its bytes are damaged, which no real file answers
      vi.mocked(probeEncryption).mockResolvedValueOnce('owner-restricted');
      // forced: the page render fails
      vi.mocked(renderComparePreview).mockImplementationOnce(() => new Promise((_, reject) => { renderStarted.resolve(); setTimeout(() => { reject(new Error('render failed')); renderFailed.resolve(); }, 5); }));
      const { file, gate } = gated(realFile('test.pdf', 'unreadable'));
      gate.armed = true;
      gate.skip = 1;
      mount();
      await loadFile('test.pdf', file, { wait: false });
      await renderStarted.promise;
      await waitUntil(() => typeof gate.release === 'function');
      await act(async () => { gate.release(); });
      await renderFailed.promise; // the failing preview render has run: it must add no second report
      await drain();
      await settle();
      await waitUntil(() => expect(container.textContent).toContain('This file could not be unlocked. It may be damaged.'));
      await harness.flush();
      expect(harness.reports()).toHaveLength(1);
      expect(harness.reports()[0]).toMatchObject({ area: 'pdf_tool_run', step: 'unlock' });
    });
  });

  describe('the strip while loading or failing (HERO-07 review)', () => {
    const stripText = () => container.querySelector('[data-fills-stage] > :first-child')?.textContent ?? '';
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
      const held = holdProbe();
      mount();
      await loadFile('slow.pdf', realFile('slow.pdf'), { wait: false });
      expect(stripText()).toContain('slow.pdf');
      await act(async () => {
        held.release();
        await held.settled;
      });
    });
  });
});
