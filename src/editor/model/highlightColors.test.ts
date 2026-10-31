import { describe, it, expect } from 'vitest';
import { HIGHLIGHT_COLORS, DEFAULT_HIGHLIGHT_COLOR } from './highlightColors.ts';

describe('highlight colors', () => {
  it('offers six colors with unique ids', () => {
    expect(HIGHLIGHT_COLORS).toHaveLength(6);
    expect(new Set(HIGHLIGHT_COLORS.map((c) => c.id)).size).toBe(6);
  });

  it('uses #RRGGBB hex values', () => {
    for (const { hex } of HIGHLIGHT_COLORS) expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('defaults to the yellow entry', () => {
    const yellow = HIGHLIGHT_COLORS.find((c) => c.id === 'yellow');
    expect(yellow?.hex).toBe(DEFAULT_HIGHLIGHT_COLOR);
  });
});
