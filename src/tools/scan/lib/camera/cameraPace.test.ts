import { describe, expect, it } from 'vitest';
import { CAMERA_SIZES, INITIAL_PACE, stepPace, stopJudging } from './cameraPace.ts';

/** `count` checks `gap` ms apart from `from`, returning the last state and every verdict that was not 'keep'. */
function run(state: typeof INITIAL_PACE, from: number, gap: number, count: number) {
  const verdicts: string[] = [];
  let current = state;
  for (let i = 0; i < count; i += 1) {
    const step = stepPace(current, from + i * gap);
    current = step.state;
    if (step.verdict !== 'keep') verdicts.push(step.verdict);
  }
  return { state: current, verdicts };
}

describe('stepPace', () => {
  it('leaves a phone that keeps up at the full size, and stops judging it', () => {
    const { state, verdicts } = run(INITIAL_PACE, 0, 80, 40);
    expect(verdicts).toEqual([]);
    expect(state.size).toBe(0);
    expect(state.judged).toBe(true);
  });

  it('steps a slow phone down one size and judges it again', () => {
    const { state, verdicts } = run(INITIAL_PACE, 0, 500, 5);
    expect(verdicts).toEqual(['stepDown']);
    expect(state.size).toBe(1);
    expect(state.judged).toBe(false);
  });

  it('settles at the smaller size when that keeps up', () => {
    const slow = run(INITIAL_PACE, 0, 500, 5);
    const { state, verdicts } = run(slow.state, 3000, 80, 40);
    expect(verdicts).toEqual([]);
    expect(state.size).toBe(1);
    expect(state.judged).toBe(true);
  });

  it('gives up once the smallest size is too slow too', () => {
    const { state, verdicts } = run(INITIAL_PACE, 0, 500, 12);
    expect(verdicts).toEqual(['stepDown', 'tooSlow']);
    expect(state.judged).toBe(true);
  });

  it('passes no verdict before a whole window has run', () => {
    expect(run(INITIAL_PACE, 0, 500, 3).verdicts).toEqual([]);
  });

  // A taken photo is decoded and flattened on the main thread: that stall says nothing about the camera.
  it('stays out of it once a photo has been taken', () => {
    const { state, verdicts } = run(stopJudging(INITIAL_PACE), 0, 900, 10);
    expect(verdicts).toEqual([]);
    expect(state.size).toBe(0);
  });
});

describe('CAMERA_SIZES', () => {
  it('starts at the size SCAN-04 measured and only gets smaller', () => {
    expect(CAMERA_SIZES[0]).toEqual({ width: { ideal: 4096 }, height: { ideal: 3072 } });
    expect(CAMERA_SIZES[1].width.ideal).toBeLessThan(CAMERA_SIZES[0].width.ideal);
  });
});
