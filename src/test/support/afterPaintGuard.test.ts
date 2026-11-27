// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAfterPaintGuard } from './afterPaintGuard.ts';

/** Resolves on the next flush a fresh guard runs, so a test can wait past any flush scheduled before it. */
const nextFlush = () => new Promise<void>((resolve) => { createAfterPaintGuard().schedule(resolve); });

describe('createAfterPaintGuard (QUAL-58)', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('runs a scheduled after-paint flush', async () => {
    const guard = createAfterPaintGuard();
    await new Promise<void>((resolve) => { guard.schedule(resolve); });
  });

  it('cancels a flush still pending when the file ends, so it never runs', async () => {
    const guard = createAfterPaintGuard();
    let calls = 0;
    guard.schedule(() => { calls += 1; });
    guard.finish();
    await nextFlush();
    expect(calls).toBe(0);
  });

  it('drops a flush scheduled after the file ended', async () => {
    const guard = createAfterPaintGuard();
    guard.finish();
    let calls = 0;
    guard.schedule(() => { calls += 1; });
    await nextFlush();
    expect(calls).toBe(0);
  });

  it('keeps to the clock the test runs on: under fake timers the flush waits for them', () => {
    vi.useFakeTimers();
    const guard = createAfterPaintGuard();
    let calls = 0;
    guard.schedule(() => { calls += 1; });
    vi.advanceTimersByTime(0);
    expect(calls).toBe(0);
    vi.runAllTimers();
    expect(calls).toBe(1);
  });
});
