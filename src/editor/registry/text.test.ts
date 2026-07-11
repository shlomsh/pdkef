import { describe, expect, it } from 'vitest';
import { applyTextPosition, applyTextResize } from './text.ts';

describe('applyTextResize', () => {
  it('scales by the measured box diagonal and clamps the font size', () => {
    expect(applyTextResize({ startFontSize: 12, delta: { x: 50, y: 0 }, startRect: { width: 100, height: 50 }, fallbackDeltaPoints: 0 }))
      .toEqual({ fontSize: 17 });
    expect(applyTextResize({ startFontSize: 12, delta: { x: -10_000, y: 0 }, startRect: { width: 100, height: 50 }, fallbackDeltaPoints: 0 }))
      .toEqual({ fontSize: 6 });
  });

  it('uses the point-based fallback when no measured box is available', () => {
    expect(applyTextResize({ startFontSize: 12, delta: { x: 0, y: 0 }, startRect: null, fallbackDeltaPoints: 20 }))
      .toEqual({ fontSize: 16 });
  });

  it('preserves the appropriate text anchor for LTR and RTL resizing', () => {
    expect(applyTextPosition({ start: { left: 20, top: 30 }, startSize: { width: 10, height: 5 }, nextSize: { width: 15, height: 8 }, isLeftHandle: true, isTopHandle: true, isRtl: false }))
      .toEqual({ left: 15, top: 27 });
    expect(applyTextPosition({ start: { left: 20, top: 30 }, startSize: { width: 10, height: 5 }, nextSize: { width: 15, height: 8 }, isLeftHandle: false, isTopHandle: false, isRtl: true }))
      .toEqual({ left: 25, top: 30 });
  });
});
