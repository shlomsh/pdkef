import { describe, expect, it } from 'vitest';
import {
  assertDocumentationShellMessages,
  getDocumentationShellMessages,
} from './documentationMessages';
import { getDocumentationLocale } from './documentationLocales';

describe('documentation shell messages', () => {
  it('provides complete LTR shell copy for the published English edition', () => {
    const messages = getDocumentationShellMessages('en');
    expect(getDocumentationLocale('en')?.dir).toBe('ltr');
    expect(messages).toMatchObject({
      language: 'Language',
      faqHeading: 'Frequently asked questions',
      reportBug: 'Report a bug',
    });
  });

  it('provides complete RTL shell copy for Hebrew and keeps the editor destination explicit', () => {
    const messages = getDocumentationShellMessages('he');
    expect(getDocumentationLocale('he')?.dir).toBe('rtl');
    expect(messages).toMatchObject({
      language: 'שפה',
      onDevice: 'במכשיר שלך',
      openSignTool: expect.stringContaining('באנגלית'),
    });
  });

  it('rejects an incomplete catalog before an LTR locale can publish', () => {
    expect(() => assertDocumentationShellMessages('hi', {
      ...getDocumentationShellMessages('en'),
      previewNotice: '',
    })).toThrow(/hi.*previewNotice/);
  });

  it('rejects a missing catalog before an RTL locale can publish', () => {
    expect(() => getDocumentationShellMessages('ar')).toThrow(/ar.*required before a page can publish/);
  });
});
