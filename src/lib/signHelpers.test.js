import { describe, expect, it } from 'vitest';
import { WYSIWYG_STRING_CASES } from '../test/fixtures/wysiwygStrings.js';
import { detectTextDirection, dominantTextDirection, getEffectiveTextDirection, getTextAlign, textAnchorsRightEdge, textElementLayout } from './signHelpers.js';

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

  it('keeps an empty field-spanned box left-anchored even when it reads RTL', () => {
    expect(textAnchorsRightEdge({ type: 'text', text: '', textDirection: 'rtl', width: 17 })).toBe(false);
    expect(textAnchorsRightEdge({ type: 'text', text: '', textDirection: 'rtl', minWidth: 26 })).toBe(false);
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

  it('is false for LTR text; an empty free box follows its seeded direction (SIGN-34)', () => {
    expect(textAnchorsRightEdge({ type: 'text', text: 'Hello' })).toBe(false);
    expect(textAnchorsRightEdge({ type: 'text', text: '', textDirection: 'rtl' })).toBe(true);
    expect(textAnchorsRightEdge({ type: 'text', text: '' })).toBe(false);
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

describe('getTextAlign', () => {
  // A box on a detected cell of a Hebrew form: seeded RTL by the tap.
  const onHebrewForm = (text, extra = {}) => ({ type: 'text', text, minWidth: 13, textDirection: 'rtl', ...extra });

  it('puts a phone number or a date at the right of its cell on a Hebrew form, with the Hebrew answers', () => {
    expect(getTextAlign(onHebrewForm('0528200202'))).toBe('right');
    expect(getTextAlign(onHebrewForm('18/09/2026'))).toBe('right');
    expect(getTextAlign(onHebrewForm(''))).toBe('right');
  });

  it('still lays those digits out left to right - only the alignment follows the form', () => {
    expect(getEffectiveTextDirection(onHebrewForm('0528200202'))).toBe('ltr');
  });

  it('follows the text\'s own direction once it has letters', () => {
    expect(getTextAlign(onHebrewForm('Shlomi'))).toBe('left');
    expect(getTextAlign({ type: 'text', text: 'שלומי', minWidth: 13, textDirection: 'ltr' })).toBe('right');
  });

  it('is the person\'s explicit choice when they made one', () => {
    expect(getTextAlign(onHebrewForm('0528200202', { textAlign: 'center' }))).toBe('center');
    expect(getTextAlign(onHebrewForm('שלומי', { textAlign: 'left' }))).toBe('left');
  });

  it('gives a free box the start edge of its own text, never a remembered seed', () => {
    expect(getTextAlign({ type: 'text', text: '0528200202', textDirection: 'rtl' })).toBe('left');
    expect(getTextAlign({ type: 'text', text: 'שלום', textDirection: 'ltr' })).toBe('right');
  });
});

describe('textElementLayout', () => {
  it('sizes a plain LTR box: left-anchored, auto width/height, font scaled by scaleFactor', () => {
    const element = { type: 'text', text: 'Hello', left: 20, top: 30, fontFamily: 'Arimo', fontSize: 12 };
    const layout = textElementLayout(element, 2);

    expect(layout.box).toEqual({ top: '30%', width: 'auto', height: 'auto', left: '20%' });
    expect(layout.font.fontSize).toBe(24);
    expect(layout.font.fontFamily).toBe('Arimo');
    expect(layout.font.fontWeight).toBe('normal');
    expect(layout.font.fontStyle).toBe('normal');
    expect(layout.textAlign).toBe('left');
    expect(layout.direction).toBe('ltr');
  });

  it('keeps a comb field left-anchored at its own fixed width, regardless of direction', () => {
    const element = { type: 'text', text: '', left: 10, top: 5, width: 30, combCells: 3, fontFamily: 'Arimo', fontSize: 10, textDirection: 'rtl' };
    const layout = textElementLayout(element);

    expect(layout.box).toEqual({ top: '5%', width: '30%', height: 'auto', left: '10%' });
    // A comb's span is fixed by the paper, so it never right-anchors even
    // when its own reading direction is RTL (textAnchorsRightEdge).
    expect(layout.direction).toBe('rtl');
  });

  it('keeps a detected-cell box left-anchored with a minWidth floor', () => {
    const element = { type: 'text', text: '', left: 40, top: 12, minWidth: 22, fontFamily: 'Arimo', fontSize: 11, textDirection: 'rtl' };
    const layout = textElementLayout(element);

    expect(layout.box).toEqual({ top: '12%', width: 'auto', minWidth: '22%', height: 'auto', left: '40%' });
    expect(layout.direction).toBe('rtl');
  });

  it('right-anchors a free RTL box instead of left-anchoring it', () => {
    const element = { type: 'text', text: 'שלום', left: 60, top: 15, fontFamily: 'Arimo', fontSize: 12 };
    const layout = textElementLayout(element);

    expect(layout.box).toEqual({ top: '15%', width: 'auto', height: 'auto', right: '40%' });
    expect(layout.direction).toBe('rtl');
    expect(layout.textAlign).toBe('right');
  });
});
