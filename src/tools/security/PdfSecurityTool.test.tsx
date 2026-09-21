// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import PdfSecurityTool from './PdfSecurityTool.tsx';
import * as securityLib from './security.js';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import { mockNativeFileShare } from '../../test/mockFileShare.js';
import { setInputFiles } from '../../test/setInputFiles.js';

vi.mock('./security.js', () => ({
  isPdfEncrypted: vi.fn(),
  unlockPdf: vi.fn(),
  protectPdf: vi.fn(),
  WrongPasswordError: class WrongPasswordError extends Error {
    constructor() { super('Incorrect password'); this.name = 'WrongPasswordError'; }
  },
  SecurityError: class SecurityError extends Error {
    constructor(msg) { super(msg); this.name = 'SecurityError'; }
  }
}));

describe('PdfSecurityTool', () => {
  let container;

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.clearAllMocks();
  });

  function mount(props = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfSecurityTool {...props} />, container);
    });
  }

  async function loadFile(name = 'test.pdf') {
    const input = container.querySelector('input[type="file"]');
    const file = new File(['dummy'], name, { type: 'application/pdf' });
    
    await act(async () => {
      setInputFiles(input, [file]);
      await new Promise(resolve => setTimeout(resolve, 10)); // wait for async checks
    });
  }

  it('detects encrypted PDF and prompts to unlock', async () => {
    securityLib.isPdfEncrypted.mockResolvedValue(true);
    mount();
    
    await loadFile();
    
    const submitBtn = container.querySelector('button[type="submit"]');
    expect(submitBtn.textContent).toContain('Unlock PDF');
    expect(container.textContent).toContain("Enter its password to unlock");
  });

  it('detects unencrypted PDF and prompts to protect', async () => {
    securityLib.isPdfEncrypted.mockResolvedValue(false);
    mount();
    
    await loadFile();
    
    const submitBtn = container.querySelector('button[type="submit"]');
    expect(submitBtn.textContent).toContain('Protect PDF');
    expect(container.textContent).toContain("Enter a password to protect it");
  });

  // Replace is the one file action this tool has now: Start over used to sit
  // beside it saying the same thing, once in the form above and again under the
  // result. Swapping the file while a password is typed still has to ask.
  it('confirms before a replacement closes the file with a password typed', async () => {
    securityLib.isPdfEncrypted.mockResolvedValue(true);
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
    securityLib.isPdfEncrypted.mockResolvedValue(true);
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
    securityLib.isPdfEncrypted.mockResolvedValue(true);
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
    securityLib.isPdfEncrypted.mockResolvedValue(false);
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
    securityLib.isPdfEncrypted.mockResolvedValue(true);
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
      securityLib.isPdfEncrypted
        .mockImplementationOnce(() => new Promise((resolve) => { resolveFirstCheck = resolve; }))
        .mockResolvedValue(false);
      mount();

      await loadFile('big-encrypted.pdf');
      // The slow check has not answered yet, so there is no form to offer.
      expect(container.querySelector('form')).toBeNull();

      await loadFile('small-plain.pdf');
      await confirmReplace();
      expect(container.querySelector('button[type="submit"]').textContent).toContain('Protect PDF');

      // Only now does the replaced file's check answer, with the other answer.
      await act(async () => {
        resolveFirstCheck(true);
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(container.querySelector('button[type="submit"]').textContent).toContain('Protect PDF');
      expect(container.textContent).toContain('Enter a password to protect it');
    });

    it('never writes the replaced file\'s bytes under the new file\'s name', async () => {
      let resolveProtect;
      securityLib.isPdfEncrypted.mockResolvedValue(false);
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
});
