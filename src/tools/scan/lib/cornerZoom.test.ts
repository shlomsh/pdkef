import { describe, expect, it } from 'vitest';
import { clampZoom, steppedZoom, ZOOM_MAX, ZOOM_STEP } from './cornerZoom.ts';

describe('clampZoom', () => {
  it('never goes below Fit, so the photo cannot shrink inside its box', () => {
    expect(clampZoom(0.4)).toBe(1);
  });
  it('never goes above the maximum, so a runaway pinch stops', () => {
    expect(clampZoom(20)).toBe(ZOOM_MAX);
  });
  it('snaps a value within 0.01 of Fit to exactly Fit, so a pinch back to the start lands on Fit', () => {
    expect(clampZoom(1.004)).toBe(1);
    expect(clampZoom(0.996)).toBe(1);
    expect(clampZoom(1.02)).toBe(1.02);
  });
  it('turns a non-number into Fit, so a bad event never poisons the zoom', () => {
    expect(clampZoom(Number.NaN)).toBe(1);
  });
});

describe('steppedZoom', () => {
  it('multiplies by the step going in, so each press looks the same', () => {
    expect(steppedZoom(1, 1)).toBe(ZOOM_STEP);
    expect(steppedZoom(1.5, 1)).toBeCloseTo(2.25);
  });
  it('divides by the step going out and lands on Fit, not just above it', () => {
    expect(steppedZoom(1.5, -1)).toBe(1);
    expect(steppedZoom(2.25, -1)).toBe(1.5);
  });
  it('stops at both limits, so the buttons can disable there', () => {
    expect(steppedZoom(5, 1)).toBe(ZOOM_MAX);
    expect(steppedZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(steppedZoom(1, -1)).toBe(1);
  });
});
