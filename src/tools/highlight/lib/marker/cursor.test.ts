import { describe, expect, it } from 'vitest';
import { underlineInk } from '#editor/model/underlineInk.ts';
import { cursorValue } from './cursor.ts';
import type { Marker } from './markerState.ts';

const yellow: Marker = { color: '#FFF34D', style: 'highlight', opacity: 1 };
const decoded = (value: string) => decodeURIComponent(/url\("data:image\/svg\+xml,([^"]*)"\)/.exec(value)![1]);

describe('highlighter cursor (R14)', () => {
  it('is a 24 px image', () => {
    expect(decoded(cursorValue(yellow))).toMatch(/width="24" height="24"/);
  });

  it('puts the hotspot at the tip, scaled from the 32 grid, inside the image', () => {
    const [x, y] = /\) (\d+) (\d+),/.exec(cursorValue(yellow))!.slice(1).map(Number);
    expect([x, y]).toEqual([5, 22]);
    expect(x).toBeLessThan(24);
    expect(y).toBeLessThan(24);
  });

  it('is a css cursor value: the data url, the hotspot, then crosshair', () => {
    const value = cursorValue(yellow);
    expect(value.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect(value.endsWith('") 5 22, crosshair')).toBe(true);
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

  it('pencil: the highlight body with a hatch tip in the color', () => {
    const svg = decoded(cursorValue({ ...yellow, style: 'pencil' }));
    expect(svg).toContain('data-tip="hatch"');
    expect(svg).toMatch(/data-tip="hatch"[^>]*stroke="#FFF34D"/);
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
