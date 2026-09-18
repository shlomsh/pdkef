import { describe, expect, it } from 'vitest';
import { WYSIWYG_STRING_CASES } from '../test/fixtures/wysiwygStrings.js';
import { detectTextDirection, getEffectiveTextDirection, textAnchorsRightEdge } from './signHelpers.js';

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

describe('textAnchorsRightEdge', () => {
  it('is true only for a free RTL text box - the one whose `left` is its right edge', () => {
    expect(textAnchorsRightEdge({ type: 'text', text: 'שלום' })).toBe(true);
  });

  it('is false for LTR or neutral text, whatever direction was seeded', () => {
    expect(textAnchorsRightEdge({ type: 'text', text: 'Hello' })).toBe(false);
    expect(textAnchorsRightEdge({ type: 'text', text: '', textDirection: 'rtl' })).toBe(false);
  });

  it('is false for a comb or a form-cell box: a fixed span stays left-anchored', () => {
    expect(textAnchorsRightEdge({ type: 'text', text: 'שלום', width: 17 })).toBe(false);
    expect(textAnchorsRightEdge({ type: 'text', text: 'שלום', minWidth: 26 })).toBe(false);
  });

  it('is false for anything that is not text', () => {
    expect(textAnchorsRightEdge({ type: 'signature', text: 'שלום' })).toBe(false);
    expect(textAnchorsRightEdge(null)).toBe(false);
  });
});
