import { describe, expect, it } from 'vitest';
import { getEffectiveTextDirection } from './textDirection.js';
import { getTextAlign, textAnchorsRightEdge, textElementLayout } from './textLayout.js';

describe('text direction anchoring', () => {
  it('keeps an empty field-spanned box left-anchored even when it reads RTL', () => {
    expect(textAnchorsRightEdge({ type: 'text', text: '', textDirection: 'rtl', width: 17 })).toBe(false);
    expect(textAnchorsRightEdge({ type: 'text', text: '', textDirection: 'rtl', minWidth: 26 })).toBe(false);
  });
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
