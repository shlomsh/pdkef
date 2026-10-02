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

const { lifecycleSpy, reportErrorSpy } = vi.hoisted(() => ({ lifecycleSpy: vi.fn(), reportErrorSpy: vi.fn() }));
vi.mock('../../lib/productAnalytics.ts', async (importOriginal) => ({
  ...(await importOriginal()),
  reportToolLifecycleEvent: lifecycleSpy,
}));
vi.mock('../../lib/errorReport.ts', async (importOriginal) => ({
  ...(await importOriginal()),
  reportError: reportErrorSpy,
}));
import { recentActions, resetActionTrailForTests } from '../../lib/actionTrail.ts';

vi.mock('./security.js', () => ({
  unlockPdf: vi.fn(),
  protectPdf: vi.fn(),
  UnreadablePdfError: class UnreadablePdfError extends Error {
    constructor(cause) { super('unreadable', { cause }); this.name = 'UnreadablePdfError'; }
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
    const shareButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Share');
    expect(shareButton).not.toBeUndefined();
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

  // DEBT-34: the logs must tell our defects from a person's file or a mistyped password.
  async function submitPassword(value) {
    const passwordInput = container.querySelector('input[type="password"]');
    await act(async () => {
      passwordInput.value = value;
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }

  it('does not count a wrong password as a failed operation', async () => {
    probeEncryption.mockResolvedValue('needs-password');
    securityLib.unlockPdf.mockRejectedValue(new securityLib.WrongPasswordError());
    mount();
    await loadFile();
    await submitPassword('wrong');
    await submitPassword('wrong again');

    expect(container.textContent).toContain('The password may be incorrect.');
    expect(lifecycleSpy).not.toHaveBeenCalledWith('tool_operation_failed', 'unlock');
    expect(reportErrorSpy).not.toHaveBeenCalled();
  });

  it('counts a failure that is not the password as failed, and does not blame the file for our own error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    probeEncryption.mockResolvedValue('needs-password');
    const ours = new ReferenceError('x is not defined');
    securityLib.unlockPdf.mockRejectedValue(ours);
    mount();
    await loadFile();
    await submitPassword('right');

    expect(container.textContent).toContain('Something went wrong while unlocking this file. Please try again.');
    expect(container.textContent).not.toContain('It may be damaged.');
    expect(lifecycleSpy).toHaveBeenCalledWith('tool_operation_failed', 'unlock');
    expect(reportErrorSpy).toHaveBeenCalledWith('pdf_tool_run', ours, 'unlock');
  });

  it('reports what made a file unreadable, not the wrapper that says so', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    probeEncryption.mockResolvedValue('needs-password');
    const cause = new TypeError('inside the library');
    securityLib.unlockPdf.mockRejectedValue(new securityLib.UnreadablePdfError(cause));
    mount();
    await loadFile();
    await submitPassword('whatever');

    expect(container.textContent).toContain('This file could not be unlocked. It may be damaged.');
    expect(reportErrorSpy).toHaveBeenCalledWith('pdf_tool_run', cause, 'unlock');
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
      expect(container.textContent).toContain('No password needed. The protection is off.');
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

  describe('a file Redact sent here', () => {
    const buttonByText = (text) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === text);

    async function unlockFromRedact(navigate) {
      probeEncryption.mockResolvedValue('needs-password');
      securityLib.unlockPdf.mockResolvedValue(new Blob(['unlocked-bytes'], { type: 'application/pdf' }));
      takeHandoffMock.mockResolvedValue({
        fileName: 'form.pdf', fileType: 'application/pdf', fileBytes: new Uint8Array([1, 2, 3]).buffer, from: 'redact',
      });
      const nativeShare = mockNativeFileShare();
      mount({ navigate });
      await flush();
      const passwordInput = container.querySelector('input[type="password"]');
      await act(async () => {
        passwordInput.value = 'secret';
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => {
        container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      return nativeShare;
    }

    it('leads back to Redact: Continue in Redact first, a quiet download, nothing else', async () => {
      const nativeShare = await unlockFromRedact(vi.fn());
      const text = container.textContent;
      expect(buttonByText('Continue in Redact')).not.toBeUndefined();
      expect(text.indexOf('Continue in Redact')).toBeLessThan(text.indexOf('Download'));
      const download = container.querySelector('a[download]');
      expect(download.getAttribute('download')).toBe('form_unlocked.pdf');
      expect(download.classList.contains(pdfToolStyles['download-button'])).toBe(false);
      const share = buttonByText('Share');
      expect(share).not.toBeUndefined();
      expect(download.parentElement.contains(share)).toBe(true);
      expect(buttonByText('Sign it')).toBeUndefined();
      expect(buttonByText('Redact it')).toBeUndefined();
      nativeShare.restore();
    });

    it.each([['sign', 'Continue in Sign', '/sign/'], ['compress', 'Continue in Compress', '/compress/']])('leads back to whichever tool sent it (%s)', async (from, label, href) => {
      probeEncryption.mockResolvedValue('owner-restricted');
      securityLib.unlockPdf.mockResolvedValue(new Blob(['u'], { type: 'application/pdf' }));
      takeHandoffMock.mockResolvedValue({ fileName: 'a.pdf', fileType: 'application/pdf', fileBytes: new Uint8Array([1]).buffer, from });
      const navigate = vi.fn();
      mount({ navigate });
      await flush();
      await act(async () => { buttonByText(label).click(); await new Promise((resolve) => setTimeout(resolve, 20)); });
      expect(saveHandoffMock.mock.calls[0][0]).toBe(from);
      expect(navigate).toHaveBeenCalledWith(href);
    });

    it('ignores a sender it does not know and shows the ordinary next steps', async () => {
      probeEncryption.mockResolvedValue('owner-restricted');
      securityLib.unlockPdf.mockResolvedValue(new Blob(['u'], { type: 'application/pdf' }));
      takeHandoffMock.mockResolvedValue({ fileName: 'a.pdf', fileType: 'application/pdf', fileBytes: new Uint8Array([1]).buffer, from: 'nowhere' });
      mount({ navigate: vi.fn() });
      await flush();
      expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent.startsWith('Continue in'))).toBe(false);
      expect(buttonByText('Redact it')).not.toBeUndefined();
    });

    it('Continue in Redact hands the unlocked file back and goes there', async () => {
      const navigate = vi.fn();
      await unlockFromRedact(navigate);
      await act(async () => { buttonByText('Continue in Redact').click(); await new Promise((resolve) => setTimeout(resolve, 20)); });
      const [tool, record] = saveHandoffMock.mock.calls[0];
      expect(tool).toBe('redact');
      expect(record.fileName).toBe('form_unlocked.pdf');
      expect(new TextDecoder().decode(record.fileBytes)).toBe('unlocked-bytes');
      expect(navigate).toHaveBeenCalledWith('/redact/');
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

    it('the finished unlock replaces the form: the Unlock button becomes the Download', async () => {
      await unlockDone(vi.fn());
      expect(container.querySelector('form')).toBeNull();
      expect(container.querySelector('input[type="password"]')).toBeNull();
      expect(buttonByText('Unlock PDF')).toBeUndefined();
      expect(container.querySelector(`.${pdfToolStyles['download-button']}`)).not.toBeNull();
    });

    it('protect keeps its password as the setting and swaps only the button for Download', async () => {
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
      expect(container.querySelector('input[type="password"]')).not.toBeNull();
      expect(buttonByText('Protect PDF')).toBeUndefined();
      expect(container.querySelector(`.${pdfToolStyles['download-button']}`)).not.toBeNull();
    });

    it('Share sits right after Download, outside the row that holds only Redact it and Sign it', async () => {
      const nativeShare = mockNativeFileShare();
      await unlockDone(vi.fn());
      const share = buttonByText('Share');
      const download = container.querySelector(`a.${pdfToolStyles['download-button']}`);
      const row = buttonByText('Redact it').parentElement;
      expect(row.contains(share)).toBe(false);
      expect(Array.from(row.querySelectorAll('button')).map((b) => b.textContent.trim())).toEqual(['Redact it', 'Sign it']);
      expect(download.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(download.nextElementSibling === share || download.nextElementSibling?.contains(share)).toBe(true);
      nativeShare.restore();
    });

    it('protect done shows Download and Share, and no next-tool actions', async () => {
      const nativeShare = mockNativeFileShare();
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
      expect(container.querySelector(`a.${pdfToolStyles['download-button']}`)).not.toBeNull();
      expect(buttonByText('Share')).not.toBeUndefined();
      expect(buttonByText('Redact it')).toBeUndefined();
      expect(buttonByText('Sign it')).toBeUndefined();
      nativeShare.restore();
    });

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
    probeEncryption.mockResolvedValue('open');
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
