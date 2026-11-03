import { describe, expect, it } from 'vitest';
import { englishImageToPdfMessages, hebrewImageToPdfMessages, getImageToPdfMessages } from './messages';

describe('image-to-pdf tool messages', () => {
  it('marks the English catalogue LTR and the Hebrew catalogue RTL', () => {
    expect([englishImageToPdfMessages.lang, englishImageToPdfMessages.dir]).toEqual(['en', 'ltr']);
    expect([hebrewImageToPdfMessages.lang, hebrewImageToPdfMessages.dir]).toEqual(['he', 'rtl']);
  });

  it('is served for both locales, English for any other', () => {
    expect(getImageToPdfMessages('en')).toBe(englishImageToPdfMessages);
    expect(getImageToPdfMessages('he')).toBe(hebrewImageToPdfMessages);
    expect(getImageToPdfMessages('hi')).toBe(englishImageToPdfMessages);
  });
});
