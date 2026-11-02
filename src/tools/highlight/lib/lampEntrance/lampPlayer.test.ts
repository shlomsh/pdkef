import { describe, expect, it, vi } from 'vitest';
import { playPlan } from './lampPlayer.ts';
import type { Plan } from './timeline.ts';

/** A stand-in for Element.animate whose animations finish when the test says so. */
function fakeElement() {
  const animations: { cancel: ReturnType<typeof vi.fn>; finish(): void; cancelled: boolean }[] = [];
  const el = {
    animate: vi.fn((frames: Keyframe[], options: KeyframeAnimationOptions) => {
      let resolve!: () => void;
      let reject!: (e: unknown) => void;
      const finished = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
      const a = {
        frames, options, finished, cancelled: false,
        cancel: vi.fn(() => { a.cancelled = true; reject(new Error('AbortError')); }),
        finish: () => resolve(),
      };
      animations.push(a);
      return a;
    }),
  };
  return { el: el as unknown as Element, animations, animate: el.animate };
}

const plan: Plan = { duration: 100, tracks: [{ part: 'capsule', keys: [{ t: 0, opacity: 0 }, { t: 100, opacity: 1 }] }, { part: 'site', keys: [{ t: 0, opacity: 0 }, { t: 100, opacity: 1 }] }] };

describe('playPlan', () => {
  it('animates every element of every part with fill both, and resolves when all finish, handing the final state back', async () => {
    const one = fakeElement();
    const two = fakeElement();
    const three = fakeElement();
    const run = playPlan(plan, (part) => (part === 'capsule' ? [one.el] : [two.el, three.el]))!;
    expect(one.animate.mock.calls[0][1]).toMatchObject({ duration: 100, fill: 'both' });
    expect(two.animations).toHaveLength(1);
    expect(three.animations).toHaveLength(1);
    [one, two, three].forEach((x) => x.animations[0].finish());
    await run.finished;
    [one, two, three].forEach((x) => expect(x.animations[0].cancel, 'cancel drops the fill so the natural state shows').toHaveBeenCalled());
  });

  it('cancelling lands on the natural state at once and settles finished', async () => {
    const one = fakeElement();
    const run = playPlan(plan, () => [one.el])!;
    run.cancel();
    await run.finished;
    expect(one.animations.every((a) => a.cancelled)).toBe(true);
  });

  it('skips parts with no element and elements without the Web Animations API, and plays nothing when none is left', () => {
    expect(playPlan(plan, (part) => (part === 'capsule' ? [] : [{} as Element]))).toBeNull();
  });

  it('a failsafe timer cancels animations that never finish', async () => {
    vi.useFakeTimers();
    try {
      const one = fakeElement();
      const run = playPlan(plan, () => [one.el])!;
      vi.advanceTimersByTime(100 + 500);
      await run.finished;
      expect(one.animations.every((a) => a.cancelled)).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});
