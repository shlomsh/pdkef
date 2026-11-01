import { describe, expect, it } from 'vitest';
import { UNDERLINE_DARKEN, underlineInk } from './underlineInk.ts';

describe('underlineInk', () => {
  it('darkens each channel by 35 percent', () => {
    expect(UNDERLINE_DARKEN).toBe(0.35);
    expect(underlineInk('#FFF34D')).toBe('#A69E32');
    expect(underlineInk('#000000')).toBe('#000000');
    expect(underlineInk('#ffffff')).toBe('#A6A6A6');
  });
  it('falls back to the default highlight color for a bad value', () => {
    expect(underlineInk('yellow')).toBe(underlineInk('#FFF34D'));
  });
});
