import { describe, expect, it } from 'vitest';
import { englishSplitMessages, hebrewSplitMessages, getSplitMessages } from './messages';

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

  it('is served for both locales, English for any other', () => {
    expect(getSplitMessages('en')).toBe(englishSplitMessages);
    expect(getSplitMessages('he')).toBe(hebrewSplitMessages);
    expect(getSplitMessages('hi')).toBe(englishSplitMessages);
  });
});
