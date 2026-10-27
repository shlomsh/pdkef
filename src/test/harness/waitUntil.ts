import { act } from 'preact/test-utils';
import { vi } from 'vitest';

// Captured at import, before any test installs fake timers: the wait runs on the real event loop
// and never moves a fake clock, so a test's own timing windows stay where it put them.
const realSetTimeout = globalThis.setTimeout;
const realNow = Date.now;

/**
 * Waits until `check` holds: it returns anything but `false` and does not throw (an `expect` works).
 * Use it after an action whose result comes from real work (IndexedDB, pdf-lib, a lazy chunk) instead
 * of a fixed sleep, which is too short on a loaded CI runner. A fixed window stays right for proving
 * that something does NOT happen. On timeout it rethrows the check's last error.
 * `dueFakeTimers`: under fake timers, also run the timers already due (a 0 ms yield, as pdf-lib makes)
 * on each tick; the clock still does not move, so later timers keep their windows.
 */
export async function waitUntil(
  check: () => unknown,
  { timeout = 5000, dueFakeTimers = false }: { timeout?: number; dueFakeTimers?: boolean } = {},
): Promise<void> {
  const until = realNow() + timeout;
  for (;;) {
    let failure: unknown = null;
    try {
      if (check() !== false) return;
    } catch (error) {
      failure = error;
    }
    if (realNow() >= until) throw failure ?? new Error(`waitUntil: condition still false after ${timeout} ms`);
    await act(async () => {
      await new Promise((resolve) => { realSetTimeout(resolve, 5); });
      if (dueFakeTimers && vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0);
    });
  }
}
