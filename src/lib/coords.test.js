import { describe, expect, it } from 'vitest';
import {
  pxToPercent,
  pxDeltaToPercent,
  percentToPx,
  percentToPoints,
  pointsToPercent,
  pointsToPx,
  pxToPoints,
  scaleFactorFromPx,
  widthPercentToHeightPercent
} from './coords.js';

describe('coords.js', () => {
  it('pxToPercent converts an absolute pixel offset to a percentage of the parent', () => {
    expect(pxToPercent(50, 200)).toBe(25);
    expect(pxToPercent(0, 200)).toBe(0);
  });

  it('pxDeltaToPercent converts a pixel delta to a percentage of the parent', () => {
    expect(pxDeltaToPercent(20, 400)).toBe(5);
    expect(pxDeltaToPercent(-20, 400)).toBe(-5);
  });

  it('percentToPx is the inverse of pxToPercent', () => {
    expect(percentToPx(25, 200)).toBe(50);
    expect(percentToPx(pxToPercent(73, 500), 500)).toBeCloseTo(73);
  });

  it('percentToPoints maps a page-relative percentage to PDF points', () => {
    expect(percentToPoints(50, 612)).toBe(306);
    expect(percentToPoints(0, 612)).toBe(0);
    expect(percentToPoints(100, 612)).toBe(612);
  });

  it('pointsToPercent is the inverse of percentToPoints', () => {
    expect(pointsToPercent(306, 612)).toBe(50);
    expect(pointsToPercent(percentToPoints(37, 792), 792)).toBeCloseTo(37);
  });

  it('pointsToPx scales PDF points by a screen scale factor', () => {
    expect(pointsToPx(100, 1.5)).toBe(150);
    expect(pointsToPx(100, 1)).toBe(100);
  });

  it('pxToPoints is the inverse of pointsToPx', () => {
    expect(pxToPoints(150, 1.5)).toBe(100);
    expect(pxToPoints(pointsToPx(42, 0.8), 0.8)).toBeCloseTo(42);
  });

  it('scaleFactorFromPx derives screen-px-per-point from a measured wrapper width', () => {
    expect(scaleFactorFromPx(612, 612)).toBe(1);
    expect(scaleFactorFromPx(1224, 612)).toBe(2);
    expect(scaleFactorFromPx(306, 612)).toBe(0.5);
  });

  it('widthPercentToHeightPercent preserves aspect ratio across differently-scaled dimensions', () => {
    // Square parent, square-ish aspect ratio: width% -> same height%.
    expect(widthPercentToHeightPercent(20, 1, 600, 600)).toBe(20);
    // Wider parent than tall: same aspectRatio needs a larger height% to look
    // the same in real pixels, since 1% of width is more px than 1% of height.
    expect(widthPercentToHeightPercent(20, 1, 800, 400)).toBe(40);
    // Taller parent than wide: needs a smaller height%.
    expect(widthPercentToHeightPercent(20, 1, 400, 800)).toBe(10);
    // A non-1 aspect ratio (e.g. a 0.4 signature) scales linearly.
    expect(widthPercentToHeightPercent(20, 0.4, 600, 600)).toBeCloseTo(8);
  });
});
