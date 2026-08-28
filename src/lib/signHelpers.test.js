import { describe, expect, it } from 'vitest';
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
});
