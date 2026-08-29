import { describe, expect, it } from 'vitest';
import { WYSIWYG_STRING_CASES } from '../test/fixtures/wysiwygStrings.js';
import { detectTextDirection, getEffectiveTextDirection } from './signHelpers.js';

describe('sign text direction helpers', () => {
  it('defaults empty and neutral legacy fields to English/LTR', () => {
    expect(getEffectiveTextDirection({ text: '', textDirection: 'rtl' })).toBe('ltr');
    expect(getEffectiveTextDirection({ text: '  () ', textDirection: 'rtl' })).toBe('ltr');
    expect(getEffectiveTextDirection({ text: '27/05/2008', textDirection: 'rtl' })).toBe('ltr');
  });

  it('follows the first typed strong language direction', () => {
    expect(detectTextDirection('Hello שלום')).toBe('ltr');
    expect(detectTextDirection('שלום Hello')).toBe('rtl');
    expect(getEffectiveTextDirection({ text: 'مرحبا', textDirection: 'ltr' })).toBe('rtl');
  });

  it('ignores leading neutral characters before detecting the first strong letter', () => {
    expect(detectTextDirection('  (123) שלום')).toBe('rtl');
    expect(detectTextDirection('  (123) Hello')).toBe('ltr');
  });

  it('recognizes Arabic Extended letters as right-to-left', () => {
    // U+08A0 is an Arabic Extended-A letter, outside the old U+07FF cutoff.
    expect(detectTextDirection('\u08A0')).toBe('rtl');
    expect(getEffectiveTextDirection({ text: '\u08A0', textDirection: 'ltr' })).toBe('rtl');
  });

  it.each(WYSIWYG_STRING_CASES.map(({ id, text, direction }) => [id, text, direction]))(
    '%s: derives the expected first-strong direction from the supplied WYSIWYG string',
    (_id, text, direction) => {
      expect(detectTextDirection(text)).toBe(direction);
      // Persisted direction is deliberately ignored; authored text wins.
      expect(getEffectiveTextDirection({ text, textDirection: direction === 'rtl' ? 'ltr' : 'rtl' })).toBe(direction);
    },
  );
});
