// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import PdfSecurityTool from './PdfSecurityTool.tsx';
import * as securityLib from '../lib/security.js';
import pdfToolStyles from './PdfTool.module.css';
import { mockNativeFileShare } from '../test/mockFileShare.js';
import { setInputFiles } from '../test/setInputFiles.js';

vi.mock('../lib/security.js', () => ({
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
  it('confirms before a replacement discards the password', async () => {
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
    expect(dialog.textContent).toContain('discards the password you entered');

    const cancel = Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Cancel');
    await act(async () => cancel.click());
    expect(dialog.open).toBe(false);
    expect(container.textContent).toContain('test.pdf');
    expect(container.textContent).not.toContain('replacement.pdf');

    await loadFile('replacement.pdf');
    const confirm = Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Replace file');
    await act(async () => {
      confirm.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(container.textContent).toContain('replacement.pdf');
  });

  it('replaces without asking when nothing has been entered yet', async () => {
    securityLib.isPdfEncrypted.mockResolvedValue(true);
    mount();

    await loadFile();
    await loadFile('replacement.pdf');

    const dialog = container.querySelector('dialog[aria-labelledby="confirm-replace-title"]');
    expect(dialog.open).toBe(false);
    expect(container.textContent).toContain('replacement.pdf');
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
});
