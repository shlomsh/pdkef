import { describe, expect, it } from 'vitest';
import { documentationPath, getDocumentationLocale } from '../data/documentationLocales';
import { resolveDocumentationLink } from './documentation';

describe('documentation locale registry', () => {
  it('keeps English at its established root URL and uses locale prefixes elsewhere', () => {
    expect(documentationPath('how-to-sign-a-pdf-on-android')).toBe('/how-to-sign-a-pdf-on-android/');
    expect(documentationPath('how-to-sign-a-pdf-on-android', 'he')).toBe('/he/how-to-sign-a-pdf-on-android/');
    expect(getDocumentationLocale('ar')).toMatchObject({ dir: 'rtl', nativeName: 'العربية' });
  });
});

describe('resolveDocumentationLink', () => {
  const variants = [
    { pageId: 'how-to-sign-a-pdf-on-android', locale: 'en' as const, status: 'english' as const, preview: false },
    { pageId: 'how-to-sign-a-pdf-on-android', locale: 'he' as const, status: 'published' as const, preview: false },
    { pageId: 'how-to-sign-a-pdf-on-iphone', locale: 'he' as const, status: 'draft' as const, preview: true },
  ];

  it('uses the same topic and locale only when that edition is available', () => {
    expect(resolveDocumentationLink('how-to-sign-a-pdf-on-android', 'he', variants)).toEqual({
      href: '/he/how-to-sign-a-pdf-on-android/',
      effectiveLocale: 'he',
      fallback: false,
    });
  });

  it('falls back explicitly to the same English article instead of another topic', () => {
    expect(resolveDocumentationLink('how-to-sign-a-pdf-on-iphone', 'he', variants.slice(0, 2))).toEqual({
      href: '/how-to-sign-a-pdf-on-iphone/',
      effectiveLocale: 'en',
      fallback: true,
    });
  });

  it('does not expose draft editions unless the caller supplies preview variants', () => {
    expect(resolveDocumentationLink('how-to-sign-a-pdf-on-iphone', 'he', variants)).toMatchObject({
      href: '/he/how-to-sign-a-pdf-on-iphone/',
      fallback: false,
    });
  });
});
