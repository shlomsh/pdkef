import { describe, expect, it } from 'vitest';
import { englishImageToPdfMessages, hebrewImageToPdfMessages, getImageToPdfMessages } from './messages';

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

  it('is served for both locales, English for any other', () => {
    expect(getImageToPdfMessages('en')).toBe(englishImageToPdfMessages);
    expect(getImageToPdfMessages('he')).toBe(hebrewImageToPdfMessages);
    expect(getImageToPdfMessages('hi')).toBe(englishImageToPdfMessages);
  });
});
