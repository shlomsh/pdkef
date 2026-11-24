import { describe, expect, it } from 'vitest';
import { hebrewSplitMessages } from './messages';
import { hebrewShellMessages } from '#shell/shellMessages.ts';
import { useSplitTool } from './components/splitTool.test-helper.tsx';

describe('PdfSplitTool in Hebrew', () => {
  const s = useSplitTool();
  const hebrew = { messages: hebrewSplitMessages, shellMessages: hebrewShellMessages };

  it('renders every control from the messages prop', async () => {
    await s.open(hebrew);
    const text = s.text();
    expect(text).toContain(hebrewSplitMessages.modeCombined);
    expect(text).toContain(hebrewSplitMessages.modeSeparate);
    expect(text).toContain(hebrewSplitMessages.includeAll);
    expect(text).not.toContain('Include all');
    expect(text).not.toContain('One PDF');
    expect(s.downloadText()).toContain(hebrewSplitMessages.downloadLabel);
    expect(s.field().getAttribute('dir')).toBe('ltr');
    expect(s.field().getAttribute('placeholder')).toBe(hebrewSplitMessages.pageSelectorPlaceholder);
    expect(s.container.querySelector('[aria-label="סיבוב עמוד 1"]')).not.toBeNull();
  });

  it('isolates the size in the detail line, and only in Hebrew', async () => {
    await s.open(hebrew);
    expect(s.downloadText()).toMatch(/⁦[^⁦⁩]*\d[^⁦⁩]*⁩/);
    s.unmount();
    await s.open({});
    expect(s.downloadText()).not.toContain('⁦');
  });

  it('keeps the file name pattern whole and LTR in One PDF per page', async () => {
    await s.open(hebrew);
    await s.click(s.radio(hebrewSplitMessages.modeSeparate));
    expect(Array.from(s.heading()?.querySelectorAll('bdi[dir="ltr"]') ?? []).some((b) => b.textContent === 'open-page-N.pdf')).toBe(true);
  });

  it('shows a Hebrew page-range error', async () => {
    await s.open(hebrew);
    await s.type('9');
    expect(s.alert()?.textContent).toBe('עמוד 9 מחוץ לטווח (1-5)');
  });
});
