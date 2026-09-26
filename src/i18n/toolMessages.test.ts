import { describe, expect, it } from 'vitest';
import { englishSignMessages, hebrewSignMessages, signUpdateDescription } from './toolMessages';

describe('sign tool messages', () => {
  // LOC-09 stage 1: the English catalogue is the contract every existing
  // English test asserts against, and the Hebrew catalogue has to cover the
  // exact same surface or a locale falls back to a half-translated row
  // silently. A key present in one and missing from the other is a build-time
  // catchable mistake, not something to find by eye on /he/sign/.
  it('gives the Hebrew catalogue the exact same keys as the English one', () => {
    expect(Object.keys(hebrewSignMessages).sort()).toEqual(Object.keys(englishSignMessages).sort());
  });

  it('marks the English catalogue LTR and the Hebrew catalogue RTL', () => {
    expect(englishSignMessages.lang).toBe('en');
    expect(englishSignMessages.dir).toBe('ltr');
    expect(hebrewSignMessages.lang).toBe('he');
    expect(hebrewSignMessages.dir).toBe('rtl');
  });

  it('every value is a non-empty string', () => {
    for (const [key, value] of Object.entries(hebrewSignMessages)) {
      expect(typeof value, `hebrewSignMessages.${key}`).toBe('string');
      expect((value as string).length, `hebrewSignMessages.${key}`).toBeGreaterThan(0);
    }
  });
});

// UNDO-04: signUpdateDescription is the one place an update entry's kind
// resolves to a label, so an added kind or a swapped template shows up here
// rather than only in a rendered history string nobody reads in a unit test.
describe('signUpdateDescription', () => {
  it('names a move by the element label', () => {
    expect(signUpdateDescription(englishSignMessages, 'move', 'text')).toBe('Moved Text');
  });

  it('names a resize by the element label', () => {
    expect(signUpdateDescription(englishSignMessages, 'resize', 'rectangle')).toBe('Resized Rectangle');
  });

  it('names a style change by the element label', () => {
    expect(signUpdateDescription(englishSignMessages, 'style', 'signature')).toBe('Changed Sign style');
  });

  it('names a text edit without interpolating the element label', () => {
    expect(signUpdateDescription(englishSignMessages, 'text', 'text')).toBe('Edited text');
  });
});
