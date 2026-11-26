import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveHandoff } from '#lib/drafts/draftStore.ts';
import { openNewerStore } from '#lib/drafts/newerStore.test-helper.ts';
import { probeEncryption } from '#lib/pdf/pdfEncryption.ts';
import { formatFileSize } from '#lib/text/format.js';
import { recentActions, resetActionTrailForTests } from '#lib/telemetry/actionTrail.ts';
import { setScreen } from '../../test/support/screen.ts';
import { mockNativeFileShare } from '../../test/support/mockFileShare.js';
import { BYTES, UNLOCK_PASSWORD, realFile, useSecurityTool, waitUntil, type Protection } from './components/securityTool.test-helper.tsx';

vi.mock('#lib/drafts/draftStore.ts', { spy: true });

const PROTECT_PASSWORD = 'secret';
const SAVE_FAILED = 'Could not hand this off. Download it instead and open it there.';

describe('PdfSecurityTool finish', () => {
  const s = useSecurityTool();

  let installedShare: ReturnType<typeof mockNativeFileShare> | undefined;
  const nativeFileShare = () => {
    installedShare = mockNativeFileShare();
    return installedShare;
  };
  afterEach(() => {
    installedShare?.restore();
    installedShare = undefined;
  });

  const protectionOfRecord = async (record: { fileBytes?: ArrayBuffer } | null) => {
    if (!record?.fileBytes) throw new Error('Expected a parked file');
    return probeEncryption(record.fileBytes);
  };
  const parkFor = (fileName: string, kind: Protection, from: string) => saveHandoff('unlock', {
    fileName, fileType: 'application/pdf', fileBytes: BYTES[kind].slice().buffer, from,
  });
  const unlockedDone = async (props: { navigate?: (href: string) => void; messages?: { dir: 'rtl' } } = {}) => {
    s.mount(props);
    await s.load(realFile('needs-password', 'doc.pdf'));
    await s.submitPassword(UNLOCK_PASSWORD);
  };
  const protectedDone = async () => {
    s.mount();
    await s.load(realFile('open'));
    await s.submitPassword(PROTECT_PASSWORD);
  };
  const hasContinueButton = () => s.buttons().some((button) => button.textContent?.startsWith('Continue in'));

  it('unlocks with the typed password, names the output, and shares that file', async () => {
    const nativeShare = nativeFileShare();
    s.mount();
    await s.load(realFile('needs-password'));
    await s.submitPassword(UNLOCK_PASSWORD);
    await waitUntil(() => expect(s.container.querySelector('a[download]')).not.toBeNull());
    expect(await s.outputProtection()).toBe('open');
    expect(s.container.querySelector('a[download]')?.getAttribute('download')).toBe('test_unlocked.pdf');
    const shareButton = s.buttonByText('Share');
    expect(shareButton).not.toBeUndefined();
    await s.click(shareButton);
    await waitUntil(() => expect(s.announced()).toBe('Unlocked PDF shared successfully.'));
    const [shared] = nativeShare.share.mock.calls[0] as unknown as [ShareData];
    expect(shared.files?.[0]?.name).toBe('test_unlocked.pdf');
  });

  describe('Share through the shared download flow', () => {
    const shareDone = async (shareRejection?: Error) => {
      const nativeShare = nativeFileShare();
      // oxlint-disable-next-line landmines/no-test-doubles -- Forced: jsdom has no navigator.share, so the share sheet's own refusal cannot happen for real.
      if (shareRejection) nativeShare.share.mockRejectedValueOnce(shareRejection);
      s.mount();
      await s.load(realFile('needs-password'));
      await s.submitPassword(UNLOCK_PASSWORD);
      await waitUntil(() => expect(s.buttonByText('Share')).not.toBeUndefined());
      resetActionTrailForTests();
      await s.click(s.buttonByText('Share'));
    };

    it('says the PDF is still ready when the share sheet is canceled, and records nothing', async () => {
      await shareDone(Object.assign(new Error('cancel'), { name: 'AbortError' }));
      await waitUntil(() => expect(s.announced()).toBe('Sharing canceled. Your PDF is still ready.'));
      expect(recentActions()).toEqual([]);
    });

    it('says the sheet could not open when sharing fails, and records nothing', async () => {
      await shareDone(new Error('boom'));
      await waitUntil(() => expect(s.announced()).toBe('Could not open the share sheet. Please try again.'));
      expect(recentActions()).toEqual([]);
    });

    it('records the Download tap by the name "download"', async () => {
      await shareDone();
      await waitUntil(() => expect(s.announced()).toBe('Unlocked PDF shared successfully.'));
      resetActionTrailForTests();
      const quiet = s.container.querySelector<HTMLAnchorElement>('a[download]');
      const rail = s.railDownload();
      expect(quiet).not.toBe(rail);
      quiet?.addEventListener('click', (event) => event.preventDefault());
      rail?.addEventListener('click', (event) => event.preventDefault());
      await s.click(quiet);
      expect(recentActions()).toEqual(['download']);
      resetActionTrailForTests();
      await s.click(s.railDownload());
      expect(recentActions()).toEqual(['download']);
    });

    it('announces and records a completed share', async () => {
      await shareDone();
      await waitUntil(() => expect(s.announced()).toBe('Unlocked PDF shared successfully.'));
      expect(recentActions()).toEqual(['share']);
    });
  });

  it('protects with the typed password, names the output, and the bytes ask for it', async () => {
    s.mount();
    await s.load(realFile('open'));
    await s.submitPassword(PROTECT_PASSWORD);
    await waitUntil(() => expect(s.container.querySelector('a[download]')).not.toBeNull());
    expect(await s.outputProtection()).toBe('needs-password');
    expect(s.container.querySelector('a[download]')?.getAttribute('download')).toBe('test_protected.pdf');
  });

  it('unlocks an owner-password-only file with no input', async () => {
    s.mount();
    await s.pick(realFile('owner-restricted', 'owner-only.pdf'));
    await waitUntil(() => expect(s.text()).toContain('The protection is off.'));
    expect(s.input()).toBeNull();
    expect(s.text()).toContain('No password needed. The protection is off.');
    expect(s.container.querySelector('a[download]')?.getAttribute('download')).toBe('owner-only_unlocked.pdf');
    expect(await s.outputProtection()).toBe('open');
  });

  describe('a file Redact sent here', () => {
    const unlockFromRedact = async (navigate: (href: string) => void) => {
      await parkFor('form.pdf', 'needs-password', 'redact');
      nativeFileShare();
      s.mount({ navigate });
      await waitUntil(() => expect(s.input()).not.toBeNull());
      await s.submitPassword(UNLOCK_PASSWORD);
      await waitUntil(() => expect(s.container.querySelector('a[download]')).not.toBeNull());
    };

    it('keeps the way back above the preview on the phone: the layout carries the return-first modifier', async () => {
      await unlockFromRedact(vi.fn());
      expect(s.container.querySelector('[data-fills-stage]')?.className).toContain('return-first');
    });

    it('leads back to Redact: Continue in Redact first, a quiet download, nothing else', async () => {
      await unlockFromRedact(vi.fn());
      const text = s.text();
      expect(s.buttonByText('Continue in Redact')).not.toBeUndefined();
      expect(text.indexOf('Continue in Redact')).toBeLessThan(text.indexOf('Download unlocked PDF'));
      const download = Array.from(s.container.querySelectorAll('a[data-quiet-download]')).pop();
      expect(download?.getAttribute('download')).toBe('form_unlocked.pdf');
      expect(download?.hasAttribute('data-quiet-download')).toBe(true);
      const share = s.buttonByText('Share');
      expect(share).not.toBeUndefined();
      expect(download?.parentElement?.contains(share ?? null)).toBe(true);
      expect(s.buttonByText('Sign')).toBeUndefined();
      expect(s.buttonByText('Redact')).toBeUndefined();
    });

    it.each([
      ['sign', 'Continue in Sign', '/sign/'],
      ['compress', 'Continue in Compress', '/compress/'],
      ['edit-pdf', 'Continue in Organize PDF', '/organize-pdf/'],
      ['merge', 'Continue in Merge', '/merge/'],
    ])('leads back to whichever tool sent it (%s)', async (from, label, href) => {
      await parkFor('a.pdf', 'owner-restricted', from);
      const navigate = vi.fn();
      s.mount({ navigate });
      await waitUntil(() => expect(s.buttonByText(label)).not.toBeUndefined());
      await s.click(s.buttonByText(label));
      await s.harness.settle();
      expect(navigate).toHaveBeenCalled();
      const parked = await s.harness.takeHandoff(from);
      expect(parked?.fileName).toBe('a_unlocked.pdf');
      expect(await protectionOfRecord(parked)).toBe('open');
      expect(navigate).toHaveBeenCalledWith(href);
    });

    it('ignores a sender it does not know and shows the ordinary next steps', async () => {
      await parkFor('a.pdf', 'owner-restricted', 'nowhere');
      s.mount({ navigate: vi.fn() });
      await waitUntil(() => expect(s.buttonByText('Redact')).not.toBeUndefined());
      expect(hasContinueButton()).toBe(false);
      expect(s.buttonByText('Redact')).not.toBeUndefined();
    });

    it('Continue in Redact hands the unlocked file back and goes there', async () => {
      const navigate = vi.fn();
      await unlockFromRedact(navigate);
      await s.click(s.buttonByText('Continue in Redact'));
      await s.harness.settle();
      expect(navigate).toHaveBeenCalled();
      const record = await s.harness.takeHandoff('redact');
      expect(record?.fileName).toBe('form_unlocked.pdf');
      expect(await protectionOfRecord(record)).toBe('open');
      expect(navigate).toHaveBeenCalledWith('/redact/');
    });
  });

  describe('a file handed off from another tool', () => {
    it('loads as if picked here and shows the password prompt', async () => {
      await saveHandoff('unlock', { fileName: 'from-redact.pdf', fileType: 'application/pdf', fileBytes: BYTES['needs-password'].slice().buffer });
      s.mount();
      await waitUntil(() => expect(s.container.querySelector('button[type="submit"]')).not.toBeNull());
      expect(await s.harness.takeHandoff('unlock')).toBeNull();
      expect(s.text()).toContain('from-redact.pdf');
      expect(s.container.querySelector('button[type="submit"]')?.textContent).toContain('Unlock PDF');
      expect(s.text()).toContain('Enter its password to unlock');
    });
  });

  describe('next steps after unlocking', () => {
    it('the finished unlock replaces the form: the Unlock button becomes the Download', async () => {
      await unlockedDone({ navigate: vi.fn() });
      expect(s.form()).toBeNull();
      expect(s.input()).toBeNull();
      expect(s.buttonByText('Unlock PDF')).toBeUndefined();
      expect(s.container.querySelector('a[download]')).not.toBeNull();
    });

    it('protect keeps its password as the setting and swaps only the button for Download', async () => {
      await protectedDone();
      expect(s.input()).not.toBeNull();
      expect(s.buttonByText('Protect PDF')).toBeUndefined();
      expect(s.container.querySelector('a[download]')).not.toBeNull();
    });

    it('Share leads the finish row, then Redact and Sign, all after the Download element', async () => {
      nativeFileShare();
      await unlockedDone({ navigate: vi.fn() });
      const share = s.buttonByText('Share');
      const row = s.buttonByText('Redact')?.parentElement;
      expect(Array.from(row?.querySelectorAll('button') ?? []).map((button) => button.textContent?.trim())).toEqual(['Share', 'Redact', 'Sign']);
      const download = s.railDownload();
      expect((download?.compareDocumentPosition(share ?? download) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('protect done shows Download and Share, and no next-tool actions', async () => {
      nativeFileShare();
      await protectedDone();
      expect(s.container.querySelector('a[download]')).not.toBeNull();
      expect(s.buttonByText('Share')).not.toBeUndefined();
      expect(s.buttonByText('Redact')).toBeUndefined();
      expect(s.buttonByText('Sign')).toBeUndefined();
    });

    it('the unlock finish offers Redact and Sign hand-offs in the shared finish row', async () => {
      await unlockedDone({ navigate: vi.fn() });
      const row = s.buttonByText('Redact')?.parentElement;
      expect(row?.getAttribute('data-count')).toBeTypeOf('string');
      expect(Array.from(row?.querySelectorAll('button') ?? []).map((button) => button.textContent?.trim())).toContain('Sign');
      expect(hasContinueButton()).toBe(false);
    });

    it('puts Redact and Sign after Download, never before', async () => {
      await unlockedDone({ navigate: vi.fn() });
      const block = s.railDownload()?.parentElement?.textContent ?? '';
      expect(block.indexOf('Download')).toBeGreaterThanOrEqual(0);
      expect(block.indexOf('Download')).toBeLessThan(block.indexOf('Redact'));
      expect(block.indexOf('Redact')).toBeLessThan(block.indexOf('Sign'));
    });

    it('does not carry the return-first modifier without a return tool', async () => {
      await unlockedDone({ navigate: vi.fn() });
      expect(s.container.querySelector('[data-fills-stage]')?.className).not.toContain('return-first');
    });

    it('isolates the size in right-to-left text, in the Download element and the phone bar', async () => {
    setScreen({ width: 390, height: 844 }); // a phone, where the Download element is the phone bar
      await unlockedDone({ messages: { dir: 'rtl' } });
      await waitUntil(() => expect(s.container.querySelector('a[download]')).not.toBeNull());
      const size = s.harness.blobForUrl(s.railDownload()?.getAttribute('href'))?.size ?? 0;
      const isolated = `\u2066${formatFileSize(size)}\u2069`;
      expect(size).toBeGreaterThan(0);
      expect(s.railDownload()?.parentElement?.textContent).toContain(isolated);
      const quiet = s.container.querySelector<HTMLAnchorElement>('a[data-quiet-download]');
      quiet?.addEventListener('click', (event) => event.preventDefault());
      await s.click(quiet);
      expect(quiet?.parentElement?.textContent).toContain(isolated);
    });

    it.each([
      ['Redact', 'redact', '/redact/'],
      ['Sign', 'sign', '/sign/'],
    ])('%s saves the unlocked bytes and navigates', async (label, key, href) => {
      const navigate = vi.fn();
      await unlockedDone({ navigate });
      await s.click(s.buttonByText(label));
      await s.harness.settle();
      expect(navigate).toHaveBeenCalledWith(href);
      const other = key === 'redact' ? 'sign' : 'redact';
      expect(await s.harness.takeHandoff(other)).toBeNull();
      const record = await s.harness.takeHandoff(key);
      expect(record?.fileName).toBe('doc_unlocked.pdf');
      expect(record?.fileType).toBe('application/pdf');
      expect(record?.from).toBe('unlock');
      expect(await protectionOfRecord(record)).toBe('open');
      expect(navigate).toHaveBeenCalledWith(href);
    });

    it('shows a quiet line and re-enables the buttons when the save fails', async () => {
      const navigate = vi.fn();
      // A store already at a newer version: the product's own open fails with a real VersionError, so the save answers false.
      await openNewerStore();
      await unlockedDone({ navigate });
      await s.click(s.buttonByText('Sign'));
      await waitUntil(() => expect(s.text()).toContain(SAVE_FAILED));
      expect(navigate).not.toHaveBeenCalled();
      expect(s.text()).toContain(SAVE_FAILED);
      expect(s.buttonByText('Sign')?.hasAttribute('disabled')).toBe(false);
      expect(s.buttonByText('Redact')?.hasAttribute('disabled')).toBe(false);
    });

    it('does not offer them after protecting', async () => {
      await protectedDone();
      expect(s.buttonByText('Redact')).toBeUndefined();
      expect(s.buttonByText('Sign')).toBeUndefined();
    });
  });
});
