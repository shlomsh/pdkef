import { describe, expect, it } from 'vitest';
import { englishSplitMessages, hebrewSplitMessages, englishToImageMessages, hebrewToImageMessages, englishImageToPdfMessages, hebrewImageToPdfMessages, getToolMessages } from './toolMessages';
import { englishSignMessages, hebrewSignMessages } from '../editor/registry/signMessages';
import { signUpdateDescription } from '../editor/registry/signLabels';
import { englishShellMessages, hebrewShellMessages } from '../shell/shellMessages';

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

describe('split tool messages', () => {
  it('gives the Hebrew catalogue the exact same keys as the English one', () => {
    expect(Object.keys(hebrewSplitMessages).sort()).toEqual(Object.keys(englishSplitMessages).sort());
  });

  it('marks the English catalogue LTR and the Hebrew catalogue RTL', () => {
    expect([englishSplitMessages.lang, englishSplitMessages.dir]).toEqual(['en', 'ltr']);
    expect([hebrewSplitMessages.lang, hebrewSplitMessages.dir]).toEqual(['he', 'rtl']);
  });

  it('every Hebrew value is a non-empty string with the same placeholders as English', () => {
    const tokens = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const [key, value] of Object.entries(hebrewSplitMessages)) {
      expect(typeof value, key).toBe('string');
      expect(value.length, key).toBeGreaterThan(0);
      expect(tokens(value), key).toEqual(tokens((englishSplitMessages as any)[key]));
    }
  });

  it('uses no em dashes', () => {
    for (const [key, value] of Object.entries(hebrewSplitMessages)) expect(value, key).not.toContain('\u2014');
  });

  it('is served for split in both locales', () => {
    expect(getToolMessages('split', 'en')).toBe(englishSplitMessages);
    expect(getToolMessages('split', 'he')).toBe(hebrewSplitMessages);
  });
});

describe('pdf-to-image tool messages', () => {
  it('gives the Hebrew catalogue the exact same keys as the English one', () => {
    expect(Object.keys(hebrewToImageMessages).sort()).toEqual(Object.keys(englishToImageMessages).sort());
  });

  it('marks the English catalogue LTR and the Hebrew catalogue RTL', () => {
    expect([englishToImageMessages.lang, englishToImageMessages.dir]).toEqual(['en', 'ltr']);
    expect([hebrewToImageMessages.lang, hebrewToImageMessages.dir]).toEqual(['he', 'rtl']);
  });

  it('every Hebrew value is a non-empty string with the same placeholders as English', () => {
    const tokens = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const [key, value] of Object.entries(hebrewToImageMessages)) {
      expect(typeof value, key).toBe('string');
      expect(value.length, key).toBeGreaterThan(0);
      expect(tokens(value), key).toEqual(tokens((englishToImageMessages as any)[key]));
    }
  });

  it('uses no em dashes', () => {
    for (const [key, value] of Object.entries(hebrewToImageMessages)) expect(value, key).not.toContain('\u2014');
  });

  it('is served for pdf-to-image in both locales', () => {
    expect(getToolMessages('pdf-to-image', 'en')).toBe(englishToImageMessages);
    expect(getToolMessages('pdf-to-image', 'he')).toBe(hebrewToImageMessages);
  });
});

describe('shell messages', () => {
  it('declare their direction, which describeFile uses to isolate the file size', () => {
    expect(englishShellMessages.dir).toBe('ltr');
    expect(hebrewShellMessages.dir).toBe('rtl');
  });
});

describe('image-to-pdf tool messages', () => {
  it('gives the Hebrew catalogue the exact same keys as the English one', () => {
    expect(Object.keys(hebrewImageToPdfMessages).sort()).toEqual(Object.keys(englishImageToPdfMessages).sort());
  });

  it('marks the English catalogue LTR and the Hebrew catalogue RTL', () => {
    expect([englishImageToPdfMessages.lang, englishImageToPdfMessages.dir]).toEqual(['en', 'ltr']);
    expect([hebrewImageToPdfMessages.lang, hebrewImageToPdfMessages.dir]).toEqual(['he', 'rtl']);
  });

  it('every Hebrew value is a non-empty string with the same placeholders as English', () => {
    const tokens = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const [key, value] of Object.entries(hebrewImageToPdfMessages)) {
      expect(typeof value, key).toBe('string');
      expect(value.length, key).toBeGreaterThan(0);
      expect(tokens(value), key).toEqual(tokens((englishImageToPdfMessages as any)[key]));
    }
  });

  it('uses no em dashes', () => {
    for (const [key, value] of Object.entries(hebrewImageToPdfMessages)) expect(value, key).not.toContain('\u2014');
  });

  it('is served for image-to-pdf in both locales', () => {
    expect(getToolMessages('image-to-pdf', 'en')).toBe(englishImageToPdfMessages);
    expect(getToolMessages('image-to-pdf', 'he')).toBe(hebrewImageToPdfMessages);
  });
});
