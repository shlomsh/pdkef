import { describe, expect, it } from 'vitest';
import { underlineInk } from '#editor/model/underlineInk.ts';
import { CURSOR_FALLBACK, CURSOR_HOTSPOT, CURSOR_SIZE, cursorSvg, cursorValue } from './cursor.ts';
import type { Marker } from './markerState.ts';

const yellow: Marker = { color: '#FFF34D', style: 'highlight', opacity: 1 };
const decoded = (value: string) => decodeURIComponent(/url\("data:image\/svg\+xml,([^"]*)"\)/.exec(value)![1]);

describe('highlighter cursor (R14)', () => {
  it('is a 24 px image', () => {
    expect(CURSOR_SIZE).toBe(24);
    expect(cursorSvg(yellow)).toMatch(/width="24" height="24"/);
  });

  it('puts the hotspot at the tip, scaled from the 32 grid, inside the image', () => {
    expect(CURSOR_HOTSPOT).toEqual({ x: 5, y: 22 });
    expect(CURSOR_HOTSPOT.x).toBeLessThan(CURSOR_SIZE);
    expect(CURSOR_HOTSPOT.y).toBeLessThan(CURSOR_SIZE);
  });

  it('is a css cursor value: the data url, the hotspot, then crosshair', () => {
    const value = cursorValue(yellow);
    expect(value.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect(value.endsWith('") 5 22, crosshair')).toBe(true);
    expect(CURSOR_FALLBACK).toBe('crosshair');
  });

  it('keeps the data url free of characters that would end the css string', () => {
    const url = /url\("([^"]*)"\)/.exec(cursorValue(yellow))![1];
    expect(url).not.toMatch(/["\s]/);
  });

  it('highlighting: the tip is the armed color, a chisel', () => {
    const svg = decoded(cursorValue(yellow));
    expect(svg).toContain('data-tip="chisel"');
    expect(svg).toMatch(/data-tip="chisel"[^>]*fill="#FFF34D"/);
  });

  it('underlining: a fine tip in the darkened ink', () => {
    const svg = decoded(cursorValue({ ...yellow, style: 'underline' }));
    expect(svg).toContain('data-tip="fine"');
    expect(svg).toContain(underlineInk('#FFF34D'));
    expect(svg).not.toContain('data-tip="chisel"');
  });

  it('shows a lighter marker lighter, never fainter than a visible tip', () => {
    const faint = decoded(cursorValue({ ...yellow, opacity: 0.3 }));
    expect(faint).toMatch(/data-tip="chisel"[^>]*fill-opacity="0\.55"/);
    const full = decoded(cursorValue(yellow));
    expect(full).toMatch(/data-tip="chisel"[^>]*fill-opacity="1"/);
  });

  it('a new color gives a new cursor', () => {
    expect(cursorValue({ ...yellow, color: '#FF8FCF' })).not.toBe(cursorValue(yellow));
  });
});
