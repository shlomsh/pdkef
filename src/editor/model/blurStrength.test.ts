import { describe, expect, it } from 'vitest';
import {
  BLUR_MAX, BLUR_MIN, DEFAULT_BLUR_STRENGTH, blurFactor, blurFraction, blurRadiusPx, isBlurStrengthValue,
  resolveBlurStrength, snapBlurStrength,
} from './blurStrength.ts';

describe('blurStrength', () => {
  it('a missing or unknown strength reads as the default 0.4', () => {
    expect(DEFAULT_BLUR_STRENGTH).toBe(0.4);
    expect(resolveBlurStrength(undefined)).toBe(0.4);
    expect(resolveBlurStrength('bogus')).toBe(0.4);
    expect(resolveBlurStrength('toString')).toBe(0.4);
    expect(resolveBlurStrength(NaN)).toBe(0.4);
    expect(blurFactor(undefined)).toBe(0.4);
  });

  it('legacy names migrate: light 0.3, medium 0.4, strong 0.5', () => {
    expect(resolveBlurStrength('light')).toBe(0.3);
    expect(resolveBlurStrength('medium')).toBe(0.4);
    expect(resolveBlurStrength('strong')).toBe(0.5);
    expect(isBlurStrengthValue('strong')).toBe(true);
    expect(isBlurStrengthValue('bogus')).toBe(false);
    expect(isBlurStrengthValue(Infinity)).toBe(false);
  });

  it('a number is clamped to [0.1, 0.7]', () => {
    expect(resolveBlurStrength(0.55)).toBe(0.55);
    expect(resolveBlurStrength(0)).toBe(BLUR_MIN);
    expect(resolveBlurStrength(9)).toBe(BLUR_MAX);
  });

  it('snapBlurStrength: within 0.02 of 0.4 snaps to it, else hundredths, clamped', () => {
    expect(snapBlurStrength(0.41)).toBe(0.4);
    expect(snapBlurStrength(0.38)).toBe(0.4);
    expect(snapBlurStrength(0.43)).toBe(0.43);
    expect(snapBlurStrength(0.2549)).toBe(0.25);
    expect(snapBlurStrength(0.01)).toBe(BLUR_MIN);
    expect(snapBlurStrength(3)).toBe(BLUR_MAX);
    expect(snapBlurStrength(NaN)).toBe(0.4);
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
      expect(blurFraction('medium', 0)).toBe(blurFactor(0.4));
      expect(blurFraction('medium', -5)).toBe(blurFactor(0.4));
      expect(blurFraction('medium', NaN)).toBe(blurFactor(0.4));
      expect(blurFraction('medium', Infinity)).toBe(blurFactor(0.4));
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

describe('blurRadiusPx at the slider ends (RED-30)', () => {
  it('0.1 gives 0.1 x max(h, 24pt) and 0.7 gives 0.7 x max(h, 24pt)', () => {
    expect(blurRadiusPx(0.1, 200, 1)).toBeCloseTo(20);
    expect(blurRadiusPx(0.7, 200, 1)).toBeCloseTo(140);
    // Under the 24pt floor: absolute radius from the floor.
    expect(blurRadiusPx(0.1, 10, 1)).toBeCloseTo(2.4);
    expect(blurRadiusPx(0.7, 10, 1)).toBeCloseTo(16.8);
  });

  it('a legacy name and its number give the same radius', () => {
    expect(blurRadiusPx('strong', 100, 1)).toBe(blurRadiusPx(0.5, 100, 1));
  });
});
