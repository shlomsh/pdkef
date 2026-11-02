import { describe, expect, it } from 'vitest';
import { HIGHLIGHT_COLORS } from '#editor/model/highlightColors.ts';
import { BLANK_BARREL, WHEEL_CAP, deriveShades, markerShades } from './markerShades.ts';

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const distance = (a: string, b: string) => Math.max(...channels(a).map((v, i) => Math.abs(v - channels(b)[i])));

describe('markerShades', () => {
  it('gives the six palette inks their drawn cap and barrel', () => {
    expect(markerShades('#FFF34D')).toEqual({ cap: '#F5CF14', barrel: '#FFE83A' });
    expect(markerShades('#7fdbff')).toEqual({ cap: '#2CB5EE', barrel: '#6CD2FB' });
    for (const { hex } of HIGHLIGHT_COLORS) expect(markerShades(hex).cap).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('derives the drawn shades from the ink, within a small step on every channel', () => {
    for (const { hex } of HIGHLIGHT_COLORS) {
      const drawn = markerShades(hex), derived = deriveShades(hex);
      expect(distance(derived.cap, drawn.cap)).toBeLessThanOrEqual(24);
      expect(distance(derived.barrel, drawn.barrel)).toBeLessThanOrEqual(10);
    }
  });

  it('derives a custom ink: the cap darker than the barrel, the barrel a touch darker than the ink', () => {
    const { cap, barrel } = markerShades('#a99cff');
    expect(deriveShades('#a99cff')).toEqual({ cap, barrel });
    const light = (hex: string) => channels(hex).reduce((a, b) => a + b, 0);
    expect(light(cap)).toBeLessThan(light(barrel));
    expect(light(barrel)).toBeLessThan(light('#a99cff'));
    expect(markerShades('#A99CFF')).toEqual(markerShades('#a99cff'));
  });

  it('keeps black, white and grey inside the gamut', () => {
    expect(markerShades('#000000')).toEqual({ cap: '#000000', barrel: '#000000' });
    expect(markerShades('#ffffff').barrel).toMatch(/^#[0-9A-F]{6}$/);
    const [r, g, b] = channels(markerShades('#808080').cap);
    expect(r === g && g === b && r < 0x80).toBe(true);
  });

  it('reads anything that is not #rrggbb as the blank marker', () => {
    expect(markerShades('red').barrel).toBe(BLANK_BARREL);
  });

  it('draws the wheel cap from the six inks and a lavender', () => {
    for (const { hex } of HIGHLIGHT_COLORS) expect(WHEEL_CAP).toContain(hex);
    expect(WHEEL_CAP).toMatch(/^linear-gradient\(90deg, /);
  });
});
