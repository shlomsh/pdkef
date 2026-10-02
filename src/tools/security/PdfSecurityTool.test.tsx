// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import PdfSecurityTool from './PdfSecurityTool.tsx';
import * as securityLib from './security.js';
import { probeEncryption } from '../../lib/pdfEncryption.ts';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import { mockNativeFileShare } from '../../test/mockFileShare.js';
import { setInputFiles } from '../../test/setInputFiles.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const fixtureFile = (name: string) =>
  new File([readFileSync(path.resolve(__dirname, `../../lib/__fixtures__/encrypted/${name}.pdf`))], `${name}.pdf`, { type: 'application/pdf' });

const { takeHandoffMock, saveHandoffMock } = vi.hoisted(() => ({ takeHandoffMock: vi.fn(), saveHandoffMock: vi.fn() }));

vi.mock('../../lib/drafts/draftStore.js', async (importOriginal) => ({
  ...(await importOriginal()),
  takeHandoff: takeHandoffMock,
  saveHandoff: saveHandoffMock,
}));

vi.mock('../../lib/pdfEncryption.ts', () => ({ probeEncryption: vi.fn() }));
import { recentActions, resetActionTrailForTests } from '../../lib/actionTrail.ts';

vi.mock('./security.js', () => ({
  unlockPdf: vi.fn(),
  protectPdf: vi.fn(),
  UnreadablePdfError: class UnreadablePdfError extends Error {
    constructor() { super('unreadable'); this.name = 'UnreadablePdfError'; }
  },
  WrongPasswordError: class WrongPasswordError extends Error {
    constructor() { super('Incorrect password'); this.name = 'WrongPasswordError'; }
  },
  SecurityError: class SecurityError extends Error {
    constructor(msg) { super(msg); this.name = 'SecurityError'; }
  }
}));

describe('PdfSecurityTool', () => {
  let container;

  beforeEach(() => {
    takeHandoffMock.mockResolvedValue(null);
    saveHandoffMock.mockResolvedValue(true);
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.clearAllMocks();
  });

  const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });

  function mount(props = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSecurityTool {...props} />, container);
    });
  }

  async function loadFile(name = 'test.pdf', file = new File(['dummy'], name, { type: 'application/pdf' })) {
    const input = container.querySelector('input[type="file"]');
    
    await act(async () => {
      setInputFiles(input, [file]);
      await new Promise(resolve => setTimeout(resolve, 10)); // wait for async checks
    });
  }

  it('detects encrypted PDF and prompts to unlock', async () => {
    probeEncryption.mockResolvedValue('needs-password');
    mount();
    
    await loadFile();
    
    const submitBtn = container.querySelector('button[type="submit"]');
    expect(submitBtn.textContent).toContain('Unlock PDF');
    expect(container.textContent).toContain("Enter its password to unlock");
  });

  it('detects unencrypted PDF and prompts to protect', async () => {
    probeEncryption.mockResolvedValue('open');
    mount();
    
    await loadFile();
    
    const submitBtn = container.querySelector('button[type="submit"]');
    expect(submitBtn.textContent).toContain('Protect PDF');
    expect(container.textContent).toContain("Enter a password to protect it");
  });

  it('shows a read error, no form and no "Checking file" when the check fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    probeEncryption.mockResolvedValue('unreadable');
    mount();

    await loadFile('broken.pdf');

    expect(container.querySelector('[role="alert"]').textContent).toContain('could not be read');
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('[role="status"]').textContent).not.toContain('Checking file');
    expect(container.querySelector('[role="status"]').textContent).toContain('could not be read');
  });

  it('ignores a stale read failure after the file was replaced', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let rejectFirst;
    probeEncryption
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectFirst = reject; }))
      .mockResolvedValue('open');
    mount();

    await loadFile('slow-broken.pdf');
    await loadFile('fine.pdf');
    const dialog = container.querySelector('dialog[aria-labelledby="confirm-replace-title"]');
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Replace file');
    await act(async () => { confirm.click(); await new Promise((r) => setTimeout(r, 10)); });

    await act(async () => {
      rejectFirst(new Error('probe died'));
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('button[type="submit"]').textContent).toContain('Protect PDF');
  });

  // Replace is the one file action this tool has now: Start over used to sit
  // beside it saying the same thing, once in the form above and again under the
  // result. Swapping the file while a password is typed still has to ask.
  it('confirms before a replacement closes the file with a password typed', async () => {
    probeEncryption.mockResolvedValue('needs-password');
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
    await act(async () => {
      confirm.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(container.textContent).toContain('replacement.pdf');
    // A confirmed replacement is a new file: the old password does not carry
    // over to it (handleFilesAdded resets password on every accepted file).
    expect(passwordInput.value).toBe('');
  });

  // MEM-03: Replace always asks, even with nothing entered yet. The dialog no
  // longer guards work (the file stays in recent files with whatever was done
  // to it); it catches an unintended click.
  it('still asks before replacing when nothing has been entered yet', async () => {
    probeEncryption.mockResolvedValue('needs-password');
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
    probeEncryption.mockResolvedValue('needs-password');
    securityLib.unlockPdf.mockResolvedValue(new Blob(['unlocked'], { type: 'application/pdf' }));
    mount();
    
    await loadFile();

    const passwordInput = container.querySelector('input[type="password"]');
    await act(async () => {
      passwordInput.value = 'secret';
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const form = container.querySelector('form');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    expect(securityLib.unlockPdf).toHaveBeenCalledWith(expect.any(File), 'secret');
    expect(container.querySelector(`.${pdfToolStyles['download-button']}`).getAttribute('download')).toBe('test_unlocked.pdf');
    const shareButton = container.querySelector(`.${pdfToolStyles['pdf-share-button']}`);
    expect(shareButton).not.toBeNull();
    await act(async () => shareButton.click());
    expect(nativeShare.share.mock.calls[0][0].files[0].name).toBe('test_unlocked.pdf');
    nativeShare.restore();
  });

  it('performs protecting successfully', async () => {
    probeEncryption.mockResolvedValue('open');
    securityLib.protectPdf.mockResolvedValue(new Blob(['protected'], { type: 'application/pdf' }));
    mount();
    
    await loadFile();

    const passwordInput = container.querySelector('input[type="password"]');
    await act(async () => {
      passwordInput.value = 'secret';
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const form = container.querySelector('form');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    expect(securityLib.protectPdf).toHaveBeenCalledWith(expect.any(File), 'secret');
    expect(container.querySelector(`.${pdfToolStyles['download-button']}`).getAttribute('download')).toBe('test_protected.pdf');
  });

  it('handles wrong password during unlock', async () => {
    probeEncryption.mockResolvedValue('needs-password');
    securityLib.unlockPdf.mockRejectedValue(new securityLib.WrongPasswordError());
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
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    expect(container.textContent).toContain("The password may be incorrect.");
  });

  it('says a damaged file could not be unlocked, not that the password is wrong', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    probeEncryption.mockResolvedValue('needs-password');
    securityLib.unlockPdf.mockRejectedValue(new securityLib.UnreadablePdfError());
    mount();
    await loadFile();
    const passwordInput = container.querySelector('input[type="password"]');
    await act(async () => {
      passwordInput.value = 'whatever';
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(container.textContent).toContain('This file could not be unlocked. It may be damaged.');
    expect(container.textContent).not.toContain('The password may be incorrect.');
  });

  describe('Unlock with the real fixtures', () => {
    // The real classifier (under pdf.js's Node build) and the real unlock; only the browser seams are faked.
    async function useRealLibs() {
      const realProbe = (await vi.importActual('../../lib/pdfEncryption.ts')).probeEncryption;
      const realSecurity = await vi.importActual('./security.js');
      const legacyPdfjs = () => import('pdfjs-dist/legacy/build/pdf.mjs');
      probeEncryption.mockImplementation((bytes) => realProbe(bytes, legacyPdfjs));
      securityLib.unlockPdf.mockImplementation(realSecurity.unlockPdf);
      securityLib.WrongPasswordError = realSecurity.WrongPasswordError;
      return realSecurity;
    }
    const type = async (value) => {
      const input = container.querySelector('input[type="password"]');
      await act(async () => {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    const submit = () => act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    it('unlocks an owner-password-only file with no input', async () => {
      await useRealLibs();
      mount();
      await act(async () => {
        setInputFiles(container.querySelector('input[type="file"]'), [fixtureFile('owner-only')]);
        await new Promise((resolve) => setTimeout(resolve, 500));
      });

      expect(securityLib.unlockPdf).toHaveBeenCalledWith(expect.any(File), '');
      expect(container.querySelector('input[type="password"]')).toBeNull();
      expect(container.textContent).toContain('No password needed. This takes the protection off.');
      expect(container.querySelector(`.${pdfToolStyles['download-button']}`).getAttribute('download')).toBe('owner-only_unlocked.pdf');
    });

    it('still asks for the password of a file that needs one, and tells wrong from right', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const realSecurity = await useRealLibs();
      // The component compares against the mocked class, so the real one stands in for it here.
      securityLib.unlockPdf.mockImplementation(async (file, pw) => {
        try { return await realSecurity.unlockPdf(file, pw); } catch (err) {
          throw err instanceof realSecurity.WrongPasswordError ? new securityLib.WrongPasswordError() : err;
        }
      });
      mount();
      await act(async () => {
        setInputFiles(container.querySelector('input[type="file"]'), [fixtureFile('needs-password')]);
        await new Promise((resolve) => setTimeout(resolve, 500));
      });
      expect(container.textContent).toContain('Enter its password to unlock');
      expect(securityLib.unlockPdf).not.toHaveBeenCalled();

      await type('wrong');
      await submit();
      expect(container.textContent).toContain('The password may be incorrect.');

      await type('u');
      await submit();
      expect(container.textContent).not.toContain('The password may be incorrect.');
      expect(container.querySelector(`.${pdfToolStyles['download-button']}`)).not.toBeNull();
      const blob = await securityLib.unlockPdf.mock.results.at(-1).value;
      const legacyPdfjs = () => import('pdfjs-dist/legacy/build/pdf.mjs');
      const realProbe = (await vi.importActual('../../lib/pdfEncryption.ts')).probeEncryption;
      expect(await realProbe(await blob.arrayBuffer(), legacyPdfjs)).toBe('open');
    });
  });

  describe('a file handed off from another tool', () => {
    it('loads as if picked here and shows the password prompt', async () => {
      probeEncryption.mockResolvedValue('needs-password');
      takeHandoffMock.mockResolvedValue({
        fileName: 'from-redact.pdf',
        fileType: 'application/pdf',
        fileBytes: new Uint8Array([1, 2, 3]).buffer,
      });
      mount();
      await flush();

      expect(takeHandoffMock).toHaveBeenCalledWith('unlock');
      expect(container.textContent).toContain('from-redact.pdf');
      expect(container.querySelector('button[type="submit"]').textContent).toContain('Unlock PDF');
      expect(container.textContent).toContain('Enter its password to unlock');
    });
  });

  describe('next steps after unlocking', () => {
    const buttonByText = (text) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === text);

    async function unlockDone(navigate) {
      probeEncryption.mockResolvedValue('needs-password');
      securityLib.unlockPdf.mockResolvedValue(new Blob(['unlocked-bytes'], { type: 'application/pdf' }));
      mount({ navigate });
      await loadFile('doc.pdf');
      const passwordInput = container.querySelector('input[type="password"]');
      await act(async () => {
        passwordInput.value = 'secret';
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => {
        container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    }

    it('puts Redact it and Sign it after Download, never before', async () => {
      await unlockDone(vi.fn());
      const text = container.textContent;
      expect(text.indexOf('Download Unlocked PDF')).toBeLessThan(text.indexOf('Redact it'));
      expect(text.indexOf('Redact it')).toBeLessThan(text.indexOf('Sign it'));
    });

    it.each([['Redact it', 'redact', '/redact/'], ['Sign it', 'sign', '/sign/']])('%s saves the unlocked bytes and navigates', async (label, key, href) => {
      const navigate = vi.fn();
      await unlockDone(navigate);
      await act(async () => { buttonByText(label).click(); await new Promise((resolve) => setTimeout(resolve, 20)); });

      expect(saveHandoffMock).toHaveBeenCalledTimes(1);
      const [tool, record] = saveHandoffMock.mock.calls[0];
      expect(tool).toBe(key);
      expect(record.fileName).toBe('doc_unlocked.pdf');
      expect(record.fileType).toBe('application/pdf');
      expect(new TextDecoder().decode(record.fileBytes)).toBe('unlocked-bytes');
      expect(navigate).toHaveBeenCalledWith(href);
    });

    it('shows a quiet line and re-enables the buttons when the save fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      saveHandoffMock.mockResolvedValue(false);
      const navigate = vi.fn();
      await unlockDone(navigate);
      await act(async () => { buttonByText('Sign it').click(); await new Promise((resolve) => setTimeout(resolve, 20)); });

      expect(navigate).not.toHaveBeenCalled();
      expect(container.textContent).toContain('Could not hand this off. Download it instead and open it there.');
      expect(buttonByText('Sign it').disabled).toBe(false);
      expect(buttonByText('Redact it').disabled).toBe(false);
    });

    it('does not offer them after protecting', async () => {
      probeEncryption.mockResolvedValue('open');
      securityLib.protectPdf.mockResolvedValue(new Blob(['p'], { type: 'application/pdf' }));
      mount();
      await loadFile();
      const passwordInput = container.querySelector('input[type="password"]');
      await act(async () => {
        passwordInput.value = 'secret';
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => {
        container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(buttonByText('Redact it')).toBeUndefined();
      expect(buttonByText('Sign it')).toBeUndefined();
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
      await act(async () => {
        confirm.click();
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }

    it('keeps the mode of the file that is actually loaded', async () => {
      let resolveFirstCheck;
      probeEncryption
        .mockImplementationOnce(() => new Promise((resolve) => { resolveFirstCheck = resolve; }))
        .mockResolvedValue('open');
      mount();

      await loadFile('big-encrypted.pdf');
      // The slow check has not answered yet, so there is no form to offer.
      expect(container.querySelector('form')).toBeNull();

      await loadFile('small-plain.pdf');
      await confirmReplace();
      expect(container.querySelector('button[type="submit"]').textContent).toContain('Protect PDF');

      // Only now does the replaced file's check answer, with the other answer.
      await act(async () => {
        resolveFirstCheck('needs-password');
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(container.querySelector('button[type="submit"]').textContent).toContain('Protect PDF');
      expect(container.textContent).toContain('Enter a password to protect it');
    });

    it('never writes the replaced file\'s bytes under the new file\'s name', async () => {
      let resolveProtect;
      probeEncryption.mockResolvedValue('open');
      securityLib.protectPdf.mockImplementationOnce(() => new Promise((resolve) => { resolveProtect = resolve; }));
      mount();

      await loadFile('first.pdf');
      const passwordInput = container.querySelector('input[type="password"]');
      await act(async () => {
        passwordInput.value = 'secret';
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => {
        container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      expect(securityLib.protectPdf).toHaveBeenCalledTimes(1);

      await loadFile('second.pdf');
      await confirmReplace();

      await act(async () => {
        resolveProtect(new Blob(['first-file-bytes'], { type: 'application/pdf' }));
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(container.textContent).toContain('second.pdf');
      expect(container.querySelector(`.${pdfToolStyles['download-button']}`)).toBeNull();
      expect(container.querySelector(`.${pdfToolStyles['pdf-share-button']}`)).toBeNull();
    });
  });

  it('records add and export by name only; the password never reaches the trail', async () => {
    resetActionTrailForTests();
    securityLib.isPdfEncrypted.mockResolvedValue(false);
    securityLib.protectPdf.mockResolvedValue(new Blob(['x'], { type: 'application/pdf' }));
    window.URL.createObjectURL = vi.fn(() => 'blob:testurl');
    mount();
    await loadFile('private_name.pdf');
    const input = container.querySelector('#security-password');
    await act(async () => {
      input.value = 'hunter2-secret';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(recentActions()).toEqual(['add_files', 'export']);
    expect(JSON.stringify(recentActions())).not.toMatch(/hunter2|private_name/);
  });
});
