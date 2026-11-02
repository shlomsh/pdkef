import { describe, expect, it } from 'vitest';
import { beadStart, boxStyle, circleBox, circleOf, coneBox, flipTransform } from './geometry.ts';

describe('lamp geometry', () => {
  it('a circle is the square box around it, and a rect reads back as the circle of its smaller side', () => {
    expect(circleBox({ cx: 100, cy: 50, r: 10 })).toEqual({ left: 90, top: 40, width: 20, height: 20 });
    expect(circleOf({ left: 90, top: 40, width: 20, height: 20 })).toEqual({ cx: 100, cy: 50, r: 10 });
    expect(circleOf({ left: 0, top: 0, width: 44, height: 20 }).r).toBe(10);
  });

  it('a box is written in pixels for the keyframes', () => {
    expect(boxStyle({ left: 1.5, top: 2, width: 3, height: 4 })).toEqual({ left: '1.5px', top: '2px', width: '3px', height: '4px' });
  });

  it('a FLIP transform maps the last box onto the first from the top-left corner', () => {
    const first = { left: 100, top: 300, width: 200, height: 280 };
    const last = { left: 40, top: 80, width: 400, height: 560 };
    expect(flipTransform(first, last)).toBe('translate(60px, 220px) scale(0.5)');
    expect(flipTransform(last, last)).toBe('translate(0px, 0px) scale(1)');
  });

  it('the bead starts where it was pressed when the window kept its size', () => {
    const bead = { cx: 720, cy: 272, r: 10 };
    expect(beadStart({ bead, before: { width: 1440, height: 900 }, viewport: { width: 1440, height: 900 }, capsuleCx: 720 })).toEqual(bead);
  });

  it('after real fullscreen resized the window the bead starts at the capsule\'s column, kept inside the new height', () => {
    const bead = { cx: 600, cy: 700, r: 10 };
    expect(beadStart({ bead, before: { width: 1200, height: 800 }, viewport: { width: 1440, height: 600 }, capsuleCx: 720 })).toEqual({ cx: 720, cy: 590, r: 10 });
  });

  it('the cone falls from the capsule\'s centre to below the viewport, wider on a desktop than on a phone', () => {
    expect(coneBox({ cx: 720, cy: 48 }, { width: 1440, height: 900 })).toEqual({ left: -130, top: 38, width: 1700, height: 892 });
    expect(coneBox({ cx: 201, cy: 52 }, { width: 402, height: 874 })).toEqual({ left: -179, top: 42, width: 760, height: 862 });
  });
});
