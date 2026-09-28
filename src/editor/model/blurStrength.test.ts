import { describe, expect, it } from 'vitest';
import { BLUR_STRENGTHS, DEFAULT_BLUR_STRENGTH, blurFactor, blurFraction, blurRadiusPx, isBlurStrength, resolveBlurStrength } from './blurStrength.ts';

describe('blurStrength', () => {
  it('restores a blur box saved without a strength as medium, the pre-levels blur', () => {
    expect(DEFAULT_BLUR_STRENGTH).toBe('medium');
    expect(blurFactor(undefined)).toBe(blurFactor('medium'));
  });

  it('orders levels from light to strong, each blurrier than the last', () => {
    const factors = BLUR_STRENGTHS.map((s) => blurFactor(s));
    for (let i = 1; i < factors.length; i++) expect(factors[i]).toBeGreaterThan(factors[i - 1]);
  });

  it('keeps every level above the 0.25 x box height that measured as a smear', () => {
    for (const s of BLUR_STRENGTHS) expect(blurFactor(s)).toBeGreaterThan(0.25);
  });

  it('rejects unknown values and resolves them to the default', () => {
    expect(isBlurStrength('light')).toBe(true);
    expect(isBlurStrength('toString')).toBe(false);
    expect(isBlurStrength(0.5)).toBe(false);
    expect(resolveBlurStrength('bogus')).toBe('medium');
    expect(resolveBlurStrength('medium')).toBe('medium');
  });

  describe('blurFraction: radius = factor x max(box height, 24pt)', () => {
    it('is the plain factor once the box is well above the 24pt floor', () => {
      expect(blurFraction('light', 100)).toBeCloseTo(0.3);
      expect(blurFraction('medium', 100)).toBeCloseTo(0.4);
      expect(blurFraction('strong', 100)).toBeCloseTo(0.5);
    });

    it('grows above the plain factor once the box drops under the 24pt floor', () => {
      // A 12pt-high box: factor x max(12, 24) / 12 = factor x 2.
      expect(blurFraction('medium', 12)).toBeCloseTo(0.8);
      expect(blurFraction('light', 12)).toBeCloseTo(0.6);
    });

    it('is exactly the factor at the floor itself', () => {
      expect(blurFraction('medium', 24)).toBeCloseTo(0.4);
    });

    it('falls back to the plain factor when the box height is not known', () => {
      expect(blurFraction('medium', 0)).toBe(blurFactor('medium'));
      expect(blurFraction('medium', -5)).toBe(blurFactor('medium'));
      expect(blurFraction('medium', NaN)).toBe(blurFactor('medium'));
      expect(blurFraction('medium', Infinity)).toBe(blurFactor('medium'));
    });
  });

  describe('blurRadiusPx: factor x max(box height, 24pt), in the box\'s own pixels', () => {
    it('gives medium the exact pre-SITE-41 fixed blur on a 14pt-high box at the export\'s 2.5x scale', () => {
      // 14pt x 2.5 = 35px. floor: 0.4 x max(14, 24) / 14 = 0.4 x 24 / 14.
      // radius = that fraction x 35px = 24px, the old fixed export blur.
      expect(blurRadiusPx('medium', 14 * 2.5, 2.5)).toBeCloseTo(24);
    });

    it('scales with the box once it is above the floor: a 40pt box gets 16pt (40px at 2.5x)', () => {
      expect(blurRadiusPx('medium', 40 * 2.5, 2.5)).toBeCloseTo(40);
    });

    it('scales the radius with the box height once above the floor, so big text gets more blur', () => {
      expect(blurRadiusPx('light', 100, 1)).toBeCloseTo(30);
      expect(blurRadiusPx('light', 200, 1)).toBeCloseTo(60);
      expect(blurRadiusPx('strong', 50, 1)).toBeCloseTo(25);
    });

    it('never returns less than a 1px blur for a sliver of a box', () => {
      expect(blurRadiusPx('light', 0, 1)).toBe(1);
    });

    it('agrees with the on-screen fraction for the same box: radius / boxHeightPx equals blurFraction', () => {
      const boxHeightPx = 35; // 14pt at 2.5x
      const pxPerPt = 2.5;
      const radius = blurRadiusPx('medium', boxHeightPx, pxPerPt);
      expect(radius / boxHeightPx).toBeCloseTo(blurFraction('medium', boxHeightPx / pxPerPt));
    });
  });
});
