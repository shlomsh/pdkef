import { describe, expect, it } from 'vitest';
import { englishToImageMessages, hebrewToImageMessages, getToImageMessages } from './messages';

describe('pdf-to-image tool messages', () => {
  it('marks the English catalogue LTR and the Hebrew catalogue RTL', () => {
    expect([englishToImageMessages.lang, englishToImageMessages.dir]).toEqual(['en', 'ltr']);
    expect([hebrewToImageMessages.lang, hebrewToImageMessages.dir]).toEqual(['he', 'rtl']);
  });

  it('is served for both locales, English for any other', () => {
    expect(getToImageMessages('en')).toBe(englishToImageMessages);
    expect(getToImageMessages('he')).toBe(hebrewToImageMessages);
    expect(getToImageMessages('hi')).toBe(englishToImageMessages);
  });
});
