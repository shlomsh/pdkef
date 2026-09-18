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
      onDevice: 'עובד מקומית',
      openSignTool: expect.stringContaining('באנגלית'),
    });
  });

  it('rejects an incomplete catalog before an LTR locale can publish', () => {
    expect(() => assertDocumentationShellMessages('hi', {
      ...getDocumentationShellMessages('en'),
      previewNotice: '',
    })).toThrow(/hi.*previewNotice/);
  });

  it('lets a locale publish without heroAccent, and only without that key', () => {
    const { heroAccent, ...withoutAccent } = getDocumentationShellMessages('en');
    expect(heroAccent).toBe('on your device');
    expect(() => assertDocumentationShellMessages('hi', withoutAccent)).not.toThrow();
    expect(() => assertDocumentationShellMessages('hi', {
      ...withoutAccent,
      language: '',
    })).toThrow(/hi.*language/);
  });

  it('rejects a missing catalog before an RTL locale can publish', () => {
    expect(() => getDocumentationShellMessages('ar')).toThrow(/ar.*required before a page can publish/);
  });
});
