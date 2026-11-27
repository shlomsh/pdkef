import { afterEach, describe, expect, it, vi } from 'vitest';
import { openThumbnailSource } from '#lib/pdf/thumbnails.js';
import { hebrewShellMessages } from '#shell/shellMessages.ts';
import { convertPdfToImages } from './lib/toImage.js';
import { hebrewToImageMessages } from './messages';
import { encryptedFixture, useToImageTool, waitUntil } from './components/toImageTool.test-helper.tsx';

vi.mock('./lib/toImage.js', { spy: true });
vi.mock('#lib/pdf/thumbnails.js', { spy: true });

describe('PdfToImageTool files', () => {
  const s = useToImageTool();
  afterEach(() => { vi.restoreAllMocks(); });
  const conversions = () => vi.mocked(convertPdfToImages).mock.calls.length;

  it('a document that cannot be read says so, still offers Replace file, and counts as a failed operation', async () => {
    s.mount();
    await s.pick(new File(['this is not a PDF'], 'report.pdf', { type: 'application/pdf' }));
    await waitUntil(() => expect(s.text()).toContain('The file may be damaged. Try another PDF.'));
    expect(s.cells()).toHaveLength(0);
    await s.click(s.button('Replace file'));
    expect(s.replaceDialog().open).toBe(true);
    expect(await s.events('tool_operation_failed')).toBe(1);
  });

  it('a password-locked PDF shows NeedsUnlock, never opens in pdf.js or builds, and is not a failed operation', async () => {
    const opened = vi.mocked(openThumbnailSource).mock.calls.length;
    const before = conversions();
    s.mount();
    await s.pick(encryptedFixture('needs-password', 'locked.pdf'));
    await waitUntil(() => expect(s.findButton('Unlock it')).toBeDefined());
    expect(s.text()).toContain('This PDF has a password');
    expect(s.text()).toContain('then you can turn it into images');
    await s.drain();
    expect(vi.mocked(openThumbnailSource).mock.calls.length).toBe(opened);
    expect(conversions()).toBe(before);
    expect(s.findDownload()).toBeNull();
    await s.harness.flush();
    expect(s.harness.reports()).toEqual([]);
    expect(await s.events('tool_operation_failed')).toBe(0);
  });

  it('an owner-restricted PDF still renders and converts as it is', async () => {
    const before = conversions();
    await s.open(3, {}, encryptedFixture('owner-only', 'report.pdf'));
    expect(s.text()).not.toContain('This PDF is protected');
    expect(s.cells()).toHaveLength(3);
    expect(conversions() - before).toBe(1);
  });

  it('speaks Hebrew with the skipped file name isolated', async () => {
    s.mount({ messages: hebrewToImageMessages });
    await s.pickOnly(new File(['x'], '2025-notes.txt', { type: 'text/plain' }));
    expect(s.container.querySelector('[role="status"]')?.textContent).toBe('דילגנו על "⁨2025-notes.txt⁩" - זה לא קובץ PDF.');
  });

  describe('Hebrew', () => {
    const hebrew = { messages: hebrewToImageMessages, shellMessages: hebrewShellMessages };

    it('renders every control from the messages prop, and keeps the digits and the size readable', async () => {
      await s.open(2, hebrew);
      const text = s.text();
      for (const word of ['פורמט', 'איכות', 'רגילה', 'גבוהה', 'מקסימלית', 'תמונה לכל עמוד', 'עמודים']) {
        expect(text).toContain(word);
      }
      for (const english of ['Format', 'Quality', 'Standard', 'Maximum', 'One image per page', 'Pages', 'Download', 'Include all']) {
        expect(text).not.toContain(english);
      }
      expect(s.field().getAttribute('dir')).toBe('ltr');
      expect(s.field().getAttribute('placeholder')).toBe(hebrewToImageMessages.pageSelectorPlaceholder);
      expect(s.downloadText()).toMatch(/⁦[^⁩]*B⁩/);
      expect(Array.from(s.heading()?.querySelectorAll('bdi[dir="ltr"]') ?? []).some((b) => b.textContent === 'report-page-N.png')).toBe(true);
      expect(s.headingText()).toContain('2 תמונות');
      await s.type('9');
      expect(s.alert()?.textContent).toBe('עמוד 9 מחוץ לטווח (1-2)');
    });

    it('counts the images and the saved files with the catalogue\'s own words', async () => {
      await s.open(3, hebrew);
      expect(s.downloadText()).toContain('הורדת 3 קובצי PNG');
      await s.saveAll(s.downloadElement(), 3);
      await waitUntil(() => expect(s.downloadText()).toContain('נשמרו 3 קובצי PNG'));
    });

    it('shows the Hebrew protected-file copy', async () => {
      s.mount(hebrew);
      await s.pick(encryptedFixture('needs-password', 'locked.pdf'));
      await waitUntil(() => expect(s.text()).toContain(hebrewToImageMessages.protectedUnlockIt));
      await s.drain();
      expect(s.text()).toContain(hebrewToImageMessages.protectedNeedsPasswordTitle);
      expect(s.text()).not.toContain('This PDF');
    });
  });
});
