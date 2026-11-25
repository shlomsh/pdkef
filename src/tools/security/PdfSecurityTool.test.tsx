import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { probeEncryption } from '#lib/pdf/pdfEncryption.ts';
import { recentActions } from '#lib/telemetry/actionTrail.ts';
import { protectPdf } from './lib/security.js';
import { BYTES, UNLOCK_PASSWORD, realFile, useSecurityTool, waitUntil } from './components/securityTool.test-helper.tsx';
import { HeldFile } from '../../test/support/heldFile.ts';
import { mockNativeFileShare } from '../../test/support/mockFileShare.js';

vi.mock('#lib/pdf/pdfEncryption.ts', { spy: true });
vi.mock('./lib/security.js', { spy: true });

// A real file whose encryption reads as {kind} but whose "%PDF" header is broken, so opening it for real fails.
const withBrokenHeader = (kind: 'needs-password' | 'owner-restricted') => {
  const bytes = BYTES[kind].slice();
  bytes[1] = 0x58;
  return new File([bytes], 'test.pdf', { type: 'application/pdf' });
};

describe('PdfSecurityTool', () => {
  const s = useSecurityTool();

  const submitButtonText = () => s.container.querySelector('button[type="submit"]')?.textContent ?? '';
  const stripText = () => s.container.querySelector('[data-fills-stage] > :first-child')?.textContent ?? '';
  const frameBusy = () => s.container.querySelector('[data-page-frame]')?.getAttribute('aria-busy');
  const downloadReady = () => s.container.querySelector('a[download]') !== null;

  it('sends the page view on load, before any file says unlock or protect, and only once (DEBT-58)', async () => {
    s.mount({ intent: 'unlock' });
    await waitUntil(() => expect(s.harness.usageEvents('tool_page_viewed')).toMatchObject([{ name: 'tool_page_viewed', properties: { tool: 'unlock' } }]));
    await s.load(realFile('open'));
    await s.drain();
    await s.harness.flush();
    expect(s.harness.usageEvents('tool_page_viewed')).toHaveLength(1);
  });

  it('detects encrypted PDF and prompts to unlock', async () => {
    s.mount();
    await s.load(realFile('needs-password'));
    expect(submitButtonText()).toContain('Unlock PDF');
    expect(s.text()).toContain('Enter its password to unlock');
  });

  it('detects unencrypted PDF and prompts to protect', async () => {
    s.mount();
    await s.load(realFile('open'));
    expect(submitButtonText()).toContain('Protect PDF');
    expect(s.text()).toContain('Enter a password to protect it');
  });

  it('shows a read error, no form and no "Checking file" when the check fails', async () => {
    s.mount();
    await s.load(realFile('unreadable', 'broken.pdf'));
    expect(s.container.querySelector('[role="alert"]')?.textContent).toContain('could not be read');
    expect(s.form()).toBeNull();
    expect(s.container.querySelector('[role="status"]')?.textContent).not.toContain('Checking file');
    expect(s.container.querySelector('[role="status"]')?.textContent).toContain('could not be read');
  });

  it('does not count an unreadable file as a failed operation (DEBT-44)', async () => {
    s.mount();
    await s.load(realFile('unreadable', 'broken.pdf'));
    expect(s.container.querySelector('[role="alert"]')?.textContent).toContain('could not be read');
    await s.harness.flush();
    expect(s.harness.usageEvents('tool_operation_failed')).toEqual([]);
  });

  it('ignores a stale read failure after the file was replaced', async () => {
    const slow = realFile('open', 'slow-broken.pdf');
    const reading = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();
    slow.arrayBuffer = async () => {
      reading.resolve();
      await gate.promise;
      throw new Error('read died');
    };
    s.mount();
    await s.pick(slow);
    await reading.promise;
    await s.load(realFile('open', 'fine.pdf'));
    await s.confirmReplace();
    await waitUntil(() => expect(submitButtonText()).toContain('Protect PDF'));
    gate.resolve();
    await s.drain();
    expect(s.container.querySelector('[role="alert"]')).toBeNull();
    expect(submitButtonText()).toContain('Protect PDF');
  });

  it('confirms before a replacement closes the file with a password typed', async () => {
    s.mount();
    await s.load(realFile('needs-password'));
    await s.type('hunter2');
    const passwordInput = s.input();

    await s.pick(realFile('needs-password', 'replacement.pdf'));
    await waitUntil(() => expect(s.replaceDialogOpen()).toBe(true));
    const dialog = s.replaceDialog();
    expect(dialog?.open).toBe(true);
    expect(dialog?.textContent).toContain('replacement.pdf');
    expect(dialog?.textContent).toContain('test.pdf');
    expect(dialog?.textContent).toContain('stays in your recent files');

    await s.click(s.dialogButton('Cancel'));
    expect(dialog?.open).toBe(false);
    expect(s.text()).toContain('test.pdf');
    expect(s.text()).not.toContain('replacement.pdf');
    expect(passwordInput?.value).toBe('hunter2');

    await s.pick(realFile('needs-password', 'replacement.pdf'));
    await waitUntil(() => expect(s.replaceDialogOpen()).toBe(true));
    await s.confirmReplace();
    expect(s.text()).toContain('replacement.pdf');
    await waitUntil(() => expect(s.input()?.value).toBe(''));
  });

  it('still asks before replacing when nothing has been entered yet', async () => {
    s.mount();
    await s.load(realFile('needs-password'));
    await s.pick(realFile('needs-password', 'replacement.pdf'));
    await waitUntil(() => expect(s.replaceDialogOpen()).toBe(true));
    expect(s.replaceDialog()?.open).toBe(true);
    expect(s.replaceDialog()?.textContent).toContain('closes test.pdf');
    expect(s.text()).toContain('File "test.pdf" loaded');
  });

  it('handles wrong password during unlock', async () => {
    s.mount();
    await s.load(realFile('needs-password'));
    await s.submitPassword('wrong');
    await waitUntil(() => expect(s.text()).toContain('The password may be incorrect.'));
    expect(s.text()).toContain('The password may be incorrect.');
  });

  it('says a damaged file could not be unlocked, not that the password is wrong', async () => {
    s.mount();
    await s.load(withBrokenHeader('needs-password'));
    await s.submitPassword('whatever');
    await waitUntil(() => expect(s.text()).toContain('This file could not be unlocked. It may be damaged.'));
    expect(s.text()).not.toContain('The password may be incorrect.');
  });

  it('does not count a wrong password as a failed operation', async () => {
    s.mount();
    await s.load(realFile('needs-password'));
    await s.submitPassword('wrong');
    await s.submitPassword('wrong again');
    expect(s.text()).toContain('The password may be incorrect.');
    expect(s.harness.usageEvents('tool_operation_failed')).toEqual([]);
    expect(s.harness.reports()).toEqual([]);
  });

  it('counts a failure that is not the password as failed, and does not blame the file for our own error', async () => {
    const file = realFile('needs-password');
    const original = file.arrayBuffer.bind(file);
    let failNext = false;
    file.arrayBuffer = () => {
      if (!failNext) return original();
      failNext = false;
      return Promise.reject(new ReferenceError('x is not defined'));
    };
    s.mount();
    await s.load(file);
    failNext = true;
    await s.submitPassword(UNLOCK_PASSWORD);
    expect(s.text()).toContain('Something went wrong while unlocking this file. Please try again.');
    expect(s.text()).not.toContain('It may be damaged.');
    expect(s.harness.usageEvents('tool_operation_failed')).toMatchObject([{ properties: { tool: 'unlock' } }]);
    expect(s.harness.reports()).toMatchObject([{ area: 'pdf_tool_run', step: 'unlock', type: 'ReferenceError' }]);
  });

  it('reports what made a file unreadable, not the wrapper that says so', async () => {
    const prepare = Error.prepareStackTrace;
    // Forced: the reported stack is read through the engine's own prepareStackTrace, the one hook for the stack's text.
    Error.prepareStackTrace = (error) => `${error.name}: ${error.message}\n    at run (https://pdkef.com/_astro/${error.constructor.name}.js:1:1)`;
    try {
      s.mount();
      await s.load(withBrokenHeader('needs-password'));
      await s.submitPassword('whatever');
      expect(s.text()).toContain('This file could not be unlocked. It may be damaged.');
      expect(s.harness.reports()).toMatchObject([{ area: 'pdf_tool_run', step: 'unlock', name: 'MissingPDFHeaderError', stack: ['MissingPDFHeaderError.js:1:1'] }]);
    } finally {
      Error.prepareStackTrace = prepare;
    }
  });

  it('still asks for the password of a file that needs one, and tells wrong from right', async () => {
    s.mount();
    await s.pick(realFile('needs-password'));
    await waitUntil(() => expect(s.text()).toContain('Enter its password to unlock'));
    expect(s.container.querySelector('[data-processing]')).toBeNull();
    expect(downloadReady()).toBe(false);

    await s.submitPassword('wrong');
    await waitUntil(() => expect(s.text()).toContain('The password may be incorrect.'));

    await s.submitPassword(UNLOCK_PASSWORD);
    await waitUntil(() => expect(downloadReady()).toBe(true));
    expect(s.text()).not.toContain('The password may be incorrect.');
    expect(s.container.querySelector('[data-processing]')).toBeNull();
    expect(await s.outputProtection()).toBe('open');
  });

  describe('a file replaced mid-flight (DEBT-18)', () => {
    it('keeps the mode of the file that is actually loaded', async () => {
      const first = new HeldFile(BYTES['needs-password'], 'big-encrypted.pdf');
      s.mount();
      await s.pick(first);
      await first.started;
      expect(s.form()).toBeNull();

      await s.load(realFile('open', 'small-plain.pdf'));
      await s.confirmReplace();
      await waitUntil(() => expect(submitButtonText()).toContain('Protect PDF'));
      const checksBefore = vi.mocked(probeEncryption).mock.results.length;

      first.release();
      await first.arrayBuffer();
      await s.drain();
      expect(probeEncryption).toHaveBeenCalledTimes(checksBefore + 1);
      await vi.mocked(probeEncryption).mock.results[checksBefore].value;
      await s.drain();

      expect(submitButtonText()).toContain('Protect PDF');
      expect(s.text()).toContain('Enter a password to protect it');
    });

    it('never writes the replaced file\'s bytes under the new file\'s name', async () => {
      const nativeShare = mockNativeFileShare();
      const first = new HeldFile(BYTES.open, 'first.pdf', { held: false });
      s.mount();
      await s.load(first);
      await waitUntil(() => expect(frameBusy()).toBeNull());
      first.hold();
      const protectsBefore = vi.mocked(protectPdf).mock.results.length;
      await s.type('secret');
      await act(async () => { s.form()?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
      await first.started;

      await s.load(realFile('open', 'second.pdf'));
      await s.confirmReplace();

      first.release();
      await vi.mocked(protectPdf).mock.results[protectsBefore].value;
      await s.drain();
      await waitUntil(() => expect(s.container.querySelector('[data-processing]')).toBeNull());
      await s.harness.flush();

      expect(s.text()).toContain('second.pdf');
      expect(downloadReady()).toBe(false);
      expect(s.buttonByText('Share')).toBeUndefined();
      await s.submitPassword('secret');
      await waitUntil(() => expect(s.buttonByText('Share')).not.toBeUndefined());
      nativeShare.restore();
    });
  });

  it('records add and export by name only; the password never reaches the trail', async () => {
    s.mount();
    await s.load(realFile('open', 'private_name.pdf'));
    await s.submitPassword('hunter2-secret');
    expect(recentActions()).toEqual(['add_files', 'export']);
    expect(JSON.stringify(recentActions())).not.toMatch(/hunter2|private_name/);
  });

  describe('the strip while loading or failing (HERO-07 review)', () => {
    it('keeps the file name and Replace when the file cannot be read', async () => {
      s.mount();
      await s.load(realFile('unreadable', 'broken.pdf'));
      expect(stripText()).toContain('broken.pdf');
      expect(s.buttons().some((button) => /Replace/.test(button.textContent ?? ''))).toBe(true);
      expect(s.container.querySelector('[role="alert"]')).not.toBeNull();
    });

    it('shows the file name, a Checking tag and a busy frame while the encryption check is pending', async () => {
      const slow = new HeldFile(BYTES.open, 'slow.pdf');
      s.mount();
      await s.pick(slow);
      await slow.started;
      expect(stripText()).toContain('slow.pdf');
      expect(s.tag()).toBe('Checking');
      expect(s.announced()).toContain('Checking file "slow.pdf"');
      expect(frameBusy()).toBe('true');
      slow.release();
      await waitUntil(() => expect(s.announced()).not.toContain('Checking file'));
    });
  });
});
