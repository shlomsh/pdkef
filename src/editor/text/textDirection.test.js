import { describe, expect, it } from 'vitest';
import { WYSIWYG_STRING_CASES } from '../../test/support/fixtures/wysiwygStrings.js';
import { detectTextDirection, dominantTextDirection, getEffectiveTextDirection } from './textDirection.js';

describe('sign text direction helpers', () => {
  it('an empty or neutral box starts in its seeded (the document\'s) direction; digits stay LTR (SIGN-34)', () => {
    expect(getEffectiveTextDirection({ text: '', textDirection: 'rtl' })).toBe('rtl');
    expect(getEffectiveTextDirection({ text: '' })).toBe('ltr');
    expect(getEffectiveTextDirection({ text: '27/05/2008', textDirection: 'rtl' })).toBe('ltr');
  });

  it('honours the seeded direction on an empty field-spanned box (comb `width` or cell `minWidth`)', () => {
    // A box placed on a detected field on a Hebrew form is seeded 'rtl' from
    // the page itself (useWorkspaceGestures / useFieldNavigation). It has no
    // growing edge to mis-anchor, so before anything is typed it shows a
    // right-aligned cursor - the reported live bug was a left-aligned one.
    expect(getEffectiveTextDirection({ text: '', textDirection: 'rtl', width: 17 })).toBe('rtl');
    expect(getEffectiveTextDirection({ text: '', textDirection: 'rtl', minWidth: 26 })).toBe('rtl');
    expect(getEffectiveTextDirection({ text: '', textDirection: 'ltr', minWidth: 26 })).toBe('ltr');
    // Typed text still wins over the seed, both ways.
    expect(getEffectiveTextDirection({ text: 'Hello', textDirection: 'rtl', minWidth: 26 })).toBe('ltr');
    expect(getEffectiveTextDirection({ text: '27/05/2008', textDirection: 'rtl', width: 17 })).toBe('ltr');
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
