import { describe, expect, it } from 'vitest';
import { HIGHLIGHT_COLORS } from '#editor/model/highlightColors.ts';
import { DEFAULT_MARKER, MORE_COLORS, TOP_COLORS, commentBandColor, isTopColor, rearm } from './markerState.ts';

describe('markerState', () => {
  it('the top three are yellow, pink and green, and the rest sit behind more', () => {
    expect(TOP_COLORS.map((c) => c.id)).toEqual(['yellow', 'pink', 'green']);
    expect(MORE_COLORS.map((c) => c.id)).toEqual(['orange', 'red', 'blue']);
  });
  it('isTopColor ignores case and says no to the rest and to custom colors', () => {
    expect(isTopColor('#ff8fcf')).toBe(true);
    expect(isTopColor('#FFF34D')).toBe(true);
    expect(isTopColor('#FFB15C')).toBe(false);
    expect(isTopColor('#336699')).toBe(false);
  });
  it('defaults to the first palette color, yellow', () => {
    expect(HIGHLIGHT_COLORS[0].id).toBe('yellow');
    expect(DEFAULT_MARKER).toEqual({ color: HIGHLIGHT_COLORS[0].hex, style: 'highlight', opacity: 0.5 });
  });
  it('rearm merges a change', () => {
    expect(rearm(DEFAULT_MARKER, { style: 'underline' })).toEqual({ ...DEFAULT_MARKER, style: 'underline' });
    expect(rearm({ ...DEFAULT_MARKER, style: 'underline', strokeWidth: 2, stroke: 'sketch' }, { style: 'pencil' })).toEqual({ ...DEFAULT_MARKER, style: 'pencil' });
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
    expect(rearm(DEFAULT_MARKER, { stroke: 'sketch' }).stroke).toBe('sketch');
    expect('stroke' in rearm({ ...DEFAULT_MARKER, stroke: 'sketch' }, { stroke: undefined })).toBe(false);
  });
  it('rearm clamps an opacity already out of range even with no change to it', () => {
    expect(rearm({ ...DEFAULT_MARKER, opacity: 0 }, { color: '#000' }).opacity).toBe(0.3);
  });
  it('commentBandColor is the last used color or the default', () => {
    expect(commentBandColor(null)).toBe(DEFAULT_MARKER.color);
    expect(commentBandColor({ ...DEFAULT_MARKER, color: '#FF8080' })).toBe('#FF8080');
  });
});
