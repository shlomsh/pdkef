import { describe, expect, it } from 'vitest';
import { UNDERLINE_DARKEN, UNDERLINE_LIFT, UNDERLINE_WIDTH, underlineInk } from './underlineInk.ts';

describe('underlineInk', () => {
  it('darkens each channel by 28 percent', () => {
    expect(UNDERLINE_DARKEN).toBe(0.28);
    expect(underlineInk('#FFF34D')).toBe('#B8AF37');
    expect(underlineInk('#9CF27A')).toBe('#70AE58');
    expect(underlineInk('#000000')).toBe('#000000');
    expect(underlineInk('#ffffff')).toBe('#B8B8B8');
  });
  it('draws a 3 pt line lifted 1 pt off the band bottom', () => {
    expect(UNDERLINE_WIDTH.default).toBe(3);
    expect(UNDERLINE_LIFT).toBe(1);
  });
  it('falls back to the default highlight color for a bad value', () => {
    expect(underlineInk('yellow')).toBe(underlineInk('#FFF34D'));
  });
});
