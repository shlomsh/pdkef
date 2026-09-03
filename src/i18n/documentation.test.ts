import { describe, expect, it } from 'vitest';
import { documentationPath, getDocumentationLocale } from './documentationLocales';
import { resolveDocumentationLink } from './documentation';
import {
  documentationSourceHash,
  normalizeDocumentationSource,
  validateDocumentationTranslationFreshness,
} from './documentationFreshness';

describe('documentation locale registry', () => {
  it('keeps English at its established root URL and uses locale prefixes elsewhere', () => {
    expect(documentationPath('how-to-sign-a-pdf-on-android')).toBe('/how-to-sign-a-pdf-on-android/');
    expect(documentationPath('how-to-sign-a-pdf-on-android', 'he')).toBe('/he/how-to-sign-a-pdf-on-android/');
    expect(getDocumentationLocale('ar')).toMatchObject({ dir: 'rtl', nativeName: 'العربية' });
  });
});

describe('documentation translation freshness', () => {
  const english = {
    title: 'Guide | PDkef',
    sections: [{ heading: 'Use the current instructions', blocks: ['first', 'second'] }],
  };

  it('allows a published translation recorded against the normalized English source', () => {
    const sourceHash = documentationSourceHash(english);
    expect(validateDocumentationTranslationFreshness(english, {
      id: 'he/example', pageId: 'example', status: 'published', sourceHash,
    })).toEqual({
      freshness: 'current',
      expectedSourceHash: sourceHash,
    });
  });

  it('fails a stale published translation', () => {
    const olderEnglish = { ...english, title: 'Old guide | PDkef' };
    expect(() => validateDocumentationTranslationFreshness(english, {
      id: 'he/example', pageId: 'example', status: 'published', sourceHash: documentationSourceHash(olderEnglish),
    })).toThrow('Published translation he/example is stale');
  });

  it('detects a stale draft while keeping it eligible for a preview warning', () => {
    expect(validateDocumentationTranslationFreshness(english, {
      id: 'he/example', pageId: 'example', status: 'draft', sourceHash: documentationSourceHash({ ...english, sections: [] }),
    })).toMatchObject({
      freshness: 'stale',
    });
  });

  it('does not change a source hash for object-key order or Unicode/newline normalization', () => {
    expect(normalizeDocumentationSource({ b: 'caf\u00e9\r\n', a: ['one'] })).toBe(
      normalizeDocumentationSource({ a: ['one'], b: 'cafe\u0301\n' }),
    );
  });

  it('treats Astro schema defaults the same as omitted YAML fields', () => {
    expect(documentationSourceHash({ sections: [{ heading: 'One' }] })).toBe(
      documentationSourceHash({ sections: [{ variant: 'default', heading: 'One' }] }),
    );
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
