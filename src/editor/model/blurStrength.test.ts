import { describe, expect, it } from 'vitest';
import { BLUR_STRENGTHS, DEFAULT_BLUR_STRENGTH, blurRadius, isBlurStrength, resolveBlurStrength } from './blurStrength.ts';

describe('blurStrength', () => {
  it('keeps today\'s 8px screen / 24px export blur as the default', () => {
    expect(DEFAULT_BLUR_STRENGTH).toBe('strong');
    expect(blurRadius(undefined)).toEqual({ screenPx: 8, exportPx: 24 });
  });

  it('orders levels from light to strong, each blurrier than the last', () => {
    const radii = BLUR_STRENGTHS.map((s) => blurRadius(s));
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i].screenPx).toBeGreaterThan(radii[i - 1].screenPx);
      expect(radii[i].exportPx).toBeGreaterThan(radii[i - 1].exportPx);
    }
  });

  it('never goes below the 12px export floor', () => {
    for (const s of BLUR_STRENGTHS) expect(blurRadius(s).exportPx).toBeGreaterThanOrEqual(12);
  });

  it('rejects unknown values and resolves them to the default', () => {
    expect(isBlurStrength('light')).toBe(true);
    expect(isBlurStrength('toString')).toBe(false);
    expect(isBlurStrength(0.5)).toBe(false);
    expect(resolveBlurStrength('bogus')).toBe('strong');
    expect(resolveBlurStrength('medium')).toBe('medium');
  });
});
