import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPdfWithPages } from '#lib/pdf/loadPdfPages.ts';
import { hebrewSplitMessages } from './messages';
import { hebrewShellMessages } from '#shell/shellMessages.ts';
import { fixtureFile, pdf, fivePages, useSplitTool, waitUntil } from './components/splitTool.test-helper.tsx';

vi.mock('#lib/pdf/loadPdfPages.ts', { spy: true });

describe('PdfSplitTool loading a file', () => {
  const s = useSplitTool();
  beforeEach(() => {
    vi.mocked(loadPdfWithPages).mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips a file that is not a PDF with a note, in Hebrew only isolated', async () => {
    const note = async () => {
      await s.pickOnly(new File(['plain text'], '2025-notes.txt', { type: 'text/plain' }));
      await waitUntil(() => expect(s.container.querySelector('[role="status"]')).not.toBeNull());
      return s.container.querySelector('[role="status"]')?.textContent ?? '';
    };
    s.mount({ messages: hebrewSplitMessages });
    expect(await note()).toContain('⁨2025-notes.txt⁩');
    s.unmount();
    s.mount();
    const english = await note();
    expect(english).toContain('2025-notes.txt');
    expect(english).not.toContain('⁨');
  });

  describe.each([
    ['needs-password', 'This PDF has a password'],
    ['owner-restricted', 'This PDF is protected'],
  ] as const)('a %s PDF', (protection, text) => {
    it('shows NeedsUnlock, never builds, reports nothing, and is not a failed operation', async () => {
      s.mount();
      await s.pick(fixtureFile(protection, 'locked.pdf'));
      expect(s.text()).toContain(text);
      expect(s.cells()).toHaveLength(0);
      expect(s.findDownload()).toBeNull();
      expect(s.harness.createdBlobs()).toHaveLength(0);
      await s.harness.flush();
      expect(s.harness.reports()).toEqual([]);
      expect(await s.events('tool_operation_failed')).toBe(0);
    });
  });

  it('ignores a load that was replaced before it finished', async () => {
    let releaseFirst: (() => void) | undefined;
    const before = vi.mocked(loadPdfWithPages).mock.calls.length;
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: the loader works on bytes already read, so nothing of the test's own can hold it. The first load (five pages) is held open, then runs for real; the replacement (three pages) is not held.
    vi.mocked(loadPdfWithPages).mockImplementationOnce(async (bytes) => {
      await new Promise<void>((resolve) => { releaseFirst = resolve; });
      const real = await vi.importActual<typeof import('#lib/pdf/loadPdfPages.ts')>('#lib/pdf/loadPdfPages.ts');
      return real.loadPdfWithPages(bytes);
    });
    s.mount();
    await s.pickOnly(pdf('five.pdf', await fivePages()));
    await waitUntil(() => expect(releaseFirst).toBeDefined());
    await s.replaceWith(fixtureFile('three-pages', 'three.pdf'));
    await s.drain();
    releaseFirst?.();
    await s.drain();
    await vi.mocked(loadPdfWithPages).mock.results[before]?.value;
    await s.drain();
    expect(s.cells()).toHaveLength(3);
    expect(s.field().value).toBe('1-3');
    expect(s.headingText()).toContain('extracted_three.pdf');
  });

  it('a load failure still offers Replace file, which asks first, and counts as a failed operation', async () => {
    s.mount();
    await s.pick(new File(['this is not a PDF'], 'broken.pdf', { type: 'application/pdf' }));
    await waitUntil(() => expect(s.findButton('Replace file')).toBeDefined());
    expect(s.alert()).not.toBeNull();
    expect(await s.events('tool_operation_failed')).toBe(1);
    await s.click(s.button('Replace file'));
    expect(s.replaceDialog().open).toBe(true);
  });

  it.each([
    ['needs-password', 'protectedNeedsPasswordTitle'],
    ['owner-restricted', 'protectedOwnerOnlyTitle'],
  ] as const)('shows the Hebrew protected-file copy for a %s PDF', async (protection, titleKey) => {
    s.mount({ messages: hebrewSplitMessages, shellMessages: hebrewShellMessages });
    await s.pick(fixtureFile(protection, 'locked.pdf'));
    expect(s.text()).toContain(hebrewSplitMessages[titleKey]);
    expect(s.text()).toContain(hebrewSplitMessages.protectedUnlockIt);
    expect(s.text()).not.toContain('This PDF');
  });
});
