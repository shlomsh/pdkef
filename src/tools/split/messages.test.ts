import { describe, expect, it } from 'vitest';
import { englishSplitMessages, hebrewSplitMessages, getSplitMessages } from './messages';

describe('split tool messages', () => {
  it('marks the English catalogue LTR and the Hebrew catalogue RTL', () => {
    expect([englishSplitMessages.lang, englishSplitMessages.dir]).toEqual(['en', 'ltr']);
    expect([hebrewSplitMessages.lang, hebrewSplitMessages.dir]).toEqual(['he', 'rtl']);
  });

  it('is served for both locales, English for any other', () => {
    expect(getSplitMessages('en')).toBe(englishSplitMessages);
    expect(getSplitMessages('he')).toBe(hebrewSplitMessages);
    expect(getSplitMessages('hi')).toBe(englishSplitMessages);
  });
});
