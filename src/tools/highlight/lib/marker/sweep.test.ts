import { describe, expect, it } from 'vitest';
import { planSweep } from './sweep.ts';

const plan = (widths: number[], rtl = false, reducedMotion = false) => planSweep({ widths, rtl, reducedMotion });

describe('planSweep (R13)', () => {
  it('a short line takes 110 ms, a long one 320 ms, a middling one in between by its length', () => {
    expect(plan([0])!.steps[0].duration).toBe(110);
    expect(plan([300])!.steps[0].duration).toBe(200);
    expect(plan([5000])!.steps[0].duration).toBe(320);
  });

  it('every line sits inside 110 to 320 ms', () => {
    for (const step of plan([10, 90, 400, 700, 2000])!.steps) {
      expect(step.duration).toBeGreaterThanOrEqual(110);
      expect(step.duration).toBeLessThanOrEqual(320);
    }
  });

  it('starts the first line at once and each next line as the one before is nearly drawn', () => {
    const { steps } = plan([300, 300, 1000])!;
    expect(steps.map((s) => s.delay)).toEqual([0, 160, 320]);
    expect(steps[2].duration).toBe(320);
  });

  it('reveals from the first letter: from the left in left to right text, from the right in Hebrew', () => {
    expect(plan([100])!.frames).toEqual([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0)' }]);
    expect(plan([100], true)!.frames).toEqual([{ clipPath: 'inset(0 0 0 100%)' }, { clipPath: 'inset(0)' }]);
  });

  it('has an easing for the animation', () => {
    expect(plan([100])!.easing).toBe('cubic-bezier(.3, .7, .3, 1)');
  });

  it('is nothing under reduced motion, and nothing without a line', () => {
    expect(plan([100, 200], false, true)).toBeNull();
    expect(plan([])).toBeNull();
  });
});
