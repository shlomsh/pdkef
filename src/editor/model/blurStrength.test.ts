import { describe, expect, it } from 'vitest';
import { BLUR_STRENGTHS, DEFAULT_BLUR_STRENGTH, blurFactor, blurRadiusPx, isBlurStrength, resolveBlurStrength } from './blurStrength.ts';

describe('blurStrength', () => {
  it('restores a blur box saved without a strength as strong', () => {
    expect(DEFAULT_BLUR_STRENGTH).toBe('strong');
    expect(blurFactor(undefined)).toBe(blurFactor('strong'));
  });

  it('orders levels from light to strong, each blurrier than the last', () => {
    const factors = BLUR_STRENGTHS.map((s) => blurFactor(s));
    for (let i = 1; i < factors.length; i++) expect(factors[i]).toBeGreaterThan(factors[i - 1]);
  });

  it('keeps every level above the 0.25 x box height that measured as a smear', () => {
    for (const s of BLUR_STRENGTHS) expect(blurFactor(s)).toBeGreaterThan(0.25);
  });

  it('scales the radius with the box height, so big text gets more blur', () => {
    expect(blurRadiusPx('light', 100)).toBeCloseTo(30);
    expect(blurRadiusPx('light', 200)).toBeCloseTo(60);
    expect(blurRadiusPx('strong', 50)).toBeCloseTo(25);
  });

  it('never returns less than a 1px blur for a sliver of a box', () => {
    expect(blurRadiusPx('light', 0)).toBe(1);
  });

  it('rejects unknown values and resolves them to the default', () => {
    expect(isBlurStrength('light')).toBe(true);
    expect(isBlurStrength('toString')).toBe(false);
    expect(isBlurStrength(0.5)).toBe(false);
    expect(resolveBlurStrength('bogus')).toBe('strong');
    expect(resolveBlurStrength('medium')).toBe('medium');
  });
});
