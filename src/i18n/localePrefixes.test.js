import { describe, expect, it } from 'vitest';
import { documentationLocales } from './documentationLocales';
import { LOCALIZED_PATH_PREFIXES, isLocalizedPath } from './localePrefixes.js';

describe('localePrefixes mirror of documentationLocales', () => {
  it('lists exactly the non-English prefixes in the registry, in order', () => {
    expect([...LOCALIZED_PATH_PREFIXES]).toEqual(
      documentationLocales.filter((locale) => locale.prefix).map((locale) => locale.prefix),
    );
  });

  it('recognises locale-prefixed paths and nothing else', () => {
    expect(isLocalizedPath('he/merge/index.html')).toBe(true);
    expect(isLocalizedPath('/he/merge/')).toBe(true);
    expect(isLocalizedPath('zh-hans/sign/index.html')).toBe(true);
    expect(isLocalizedPath('merge/index.html')).toBe(false);
    expect(isLocalizedPath('/merge/')).toBe(false);
    expect(isLocalizedPath('index.html')).toBe(false);
    // A root page whose slug happens to look like a prefix is still English.
    expect(isLocalizedPath('he')).toBe(false);
    expect(isLocalizedPath('/he/')).toBe(false);
  });
});
