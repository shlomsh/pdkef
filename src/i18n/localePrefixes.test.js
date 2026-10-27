import { describe, expect, it } from 'vitest';
import { documentationLocales } from './documentationLocales';
import { LOCALIZED_PATH_PREFIXES } from './localePrefixes.js';

describe('localePrefixes mirror of documentationLocales', () => {
  it('lists exactly the non-English prefixes in the registry, in order', () => {
    expect([...LOCALIZED_PATH_PREFIXES]).toEqual(
      documentationLocales.filter((locale) => locale.prefix).map((locale) => locale.prefix),
    );
  });
});
