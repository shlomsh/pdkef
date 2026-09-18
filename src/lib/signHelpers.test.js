import { describe, expect, it } from 'vitest';
import { WYSIWYG_STRING_CASES } from '../test/fixtures/wysiwygStrings.js';
import { detectTextDirection, dominantTextDirection, getEffectiveTextDirection, textAnchorsRightEdge } from './signHelpers.js';

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

describe('dominantTextDirection', () => {
  it('reads a Hebrew form as RTL even with Latin runs on it', () => {
    // Form 101's page 1: Hebrew labels, plus a form number, "Email", a URL.
    expect(dominantTextDirection([
      'טופס 101', 'כרטיס עובד ובקשה להקלה', 'שם משפחה', 'מספר זהות', 'תאריך לידה',
      'Email', 'www.gov.il/taxes', '2026',
    ])).toBe('rtl');
  });

  it('reads an English form as LTR', () => {
    expect(dominantTextDirection(['E-Ticket', 'Traveller Name', 'Nationality', 'Passport/ID', 'שם'])).toBe('ltr');
  });

  it('counts letters, not runs, so one long Hebrew paragraph outvotes many short Latin labels', () => {
    expect(dominantTextDirection(['a', 'b', 'c', 'd', 'הצהרת בריאות לעובד חדש במקום העבודה'])).toBe('rtl');
  });

  it('gives digits and punctuation no vote and falls back to LTR', () => {
    expect(dominantTextDirection(['123', '27/05/2008', '', undefined])).toBe('ltr');
    expect(dominantTextDirection([])).toBe('ltr');
  });
});
