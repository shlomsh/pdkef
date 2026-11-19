import { describe, expect, it, vi } from 'vitest';
import { createStallWatch, stallLimit } from './vitest-worker-watchdog-core.mjs';

// The watch's only clock is its tick: each test calls tick() where the real thread's interval would fire.
function watch({ pollMs = 50, stallMs = 600, parent = 1 } = {}) {
  const state = { beat: 0, ppid: parent };
  const stop = vi.fn();
  const { tick } = createStallWatch({ pollMs, stallMs, parent, readBeat: () => state.beat, readPpid: () => state.ppid, stop });
  return { state, stop, tick };
}

describe('watchdog stall watch', () => {
  it('stops a worker whose beat stops, once the missed polls reach the stall limit, and says why', () => {
    const { stop, tick } = watch({ pollMs: 50, stallMs: 600 });
    for (let i = 0; i < 11; i += 1) tick();
    expect(stop).not.toHaveBeenCalled();
    tick();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(stop.mock.calls[0][0]).toContain('never returned to the event loop for 600 ms');
  });

  it('leaves a slow worker alone while it keeps yielding, past the stall limit', () => {
    const { state, stop, tick } = watch({ pollMs: 50, stallMs: 600 });
    for (let i = 0; i < 100; i += 1) {
      state.beat += 1;
      tick();
    }
    expect(stop).not.toHaveBeenCalled();
  });

  it('starts counting again after any beat', () => {
    const { state, stop, tick } = watch({ pollMs: 50, stallMs: 600 });
    for (let i = 0; i < 11; i += 1) tick();
    state.beat += 1;
    tick();
    for (let i = 0; i < 11; i += 1) tick();
    expect(stop).not.toHaveBeenCalled();
  });

  it('ends the worker without a message as soon as its parent is gone', () => {
    const { state, stop, tick } = watch({ parent: 42 });
    state.beat += 1;
    tick();
    expect(stop).not.toHaveBeenCalled();
    state.ppid = 1;
    tick();
    expect(stop).toHaveBeenCalledWith();
  });
});

describe('watchdog stall limit', () => {
  it('is off under a debugger, which may be holding the thread at a breakpoint', () => {
    expect(stallLimit(['--inspect=0'], {})).toBe(Infinity);
    expect(stallLimit(['--inspect-brk'], { VITEST_WATCHDOG_STALL_MS: '600' })).toBe(Infinity);
  });

  it('is five minutes by default, or what the environment says', () => {
    expect(stallLimit([], {})).toBe(300_000);
    expect(stallLimit(['--import', 'x'], { VITEST_WATCHDOG_STALL_MS: '600' })).toBe(600);
  });
});
