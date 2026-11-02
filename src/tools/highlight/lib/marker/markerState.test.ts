import { describe, expect, it } from 'vitest';
import { DEFAULT_MARKER, HIGHLIGHT_COLORS, commentBandColor, rearm } from './markerState.ts';

describe('markerState', () => {
  it('defaults to the first palette color, yellow', () => {
    expect(HIGHLIGHT_COLORS[0].id).toBe('yellow');
    expect(DEFAULT_MARKER).toEqual({ color: HIGHLIGHT_COLORS[0].hex, style: 'highlight', opacity: 0.5 });
  });
  it('rearm merges a change', () => {
    expect(rearm(DEFAULT_MARKER, { style: 'underline' })).toEqual({ ...DEFAULT_MARKER, style: 'underline' });
  });
  it('rearm clamps opacity to 0.3..1', () => {
    expect(rearm(DEFAULT_MARKER, { opacity: 0.1 }).opacity).toBe(0.3);
    expect(rearm(DEFAULT_MARKER, { opacity: 2 }).opacity).toBe(1);
    expect(rearm(DEFAULT_MARKER, { opacity: 0.5 }).opacity).toBe(0.5);
  });
  it('READ-04: rearm keeps the stroke width within 1..4', () => {
    expect(rearm(DEFAULT_MARKER, { strokeWidth: 9 }).strokeWidth).toBe(4);
    expect(rearm(DEFAULT_MARKER, { strokeWidth: 0.2 }).strokeWidth).toBe(1);
    expect(rearm(DEFAULT_MARKER, { strokeWidth: 2 }).strokeWidth).toBe(2);
    expect('strokeWidth' in rearm(DEFAULT_MARKER, {})).toBe(false);
  });
  it('rearm clamps an opacity already out of range even with no change to it', () => {
    expect(rearm({ ...DEFAULT_MARKER, opacity: 0 }, { color: '#000' }).opacity).toBe(0.3);
  });
  it('commentBandColor is the last used color or the default', () => {
    expect(commentBandColor(null)).toBe(DEFAULT_MARKER.color);
    expect(commentBandColor({ ...DEFAULT_MARKER, color: '#FF8080' })).toBe('#FF8080');
  });
});
