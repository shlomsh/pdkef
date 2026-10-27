import { describe, expect, it } from 'vitest';
import { englishToImageMessages, hebrewToImageMessages, getToImageMessages } from './messages';

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

  it('is served for both locales, English for any other', () => {
    expect(getToImageMessages('en')).toBe(englishToImageMessages);
    expect(getToImageMessages('he')).toBe(hebrewToImageMessages);
    expect(getToImageMessages('hi')).toBe(englishToImageMessages);
  });
});
