// QUAL-58: Preact runs a component's effects after the next paint, through a 35 ms timer raced against
// requestAnimationFrame. A test file that ends before that flush leaves it pending; when it fires after
// jsdom is gone it throws `cancelAnimationFrame is not defined`, failing the run with no test to blame.
// Fast synchronous tests leave one at the end of many files (15 of 350 on 2026-11-27), so the jsdom
// setup schedules Preact's flush through this guard (`options.requestAnimationFrame`; `act` swaps its
// own in and back) and cancels whatever is still pending when the file ends.

const RAF_TIMEOUT = 35;

/** Preact's `afterNextFrame`, reading the timers at call time as Preact does, so fake timers still apply. */
export function createAfterPaintGuard() {
  const pending = new Set<() => void>();
  let ended = false;

  function schedule(flush: () => void): void {
    if (ended) return;
    const { setTimeout: setTimer, clearTimeout: clearTimer } = globalThis;
    const hasRaf = typeof globalThis.requestAnimationFrame === 'function';
    const caf = hasRaf ? globalThis.cancelAnimationFrame : () => {};
    let frame = 0;
    let after: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => { clearTimer(timeout); caf(frame); clearTimer(after); };
    const done = () => {
      clearTimer(timeout);
      caf(frame);
      after = setTimer(() => {
        pending.delete(cancel);
        flush();
      });
    };
    const timeout = setTimer(done, RAF_TIMEOUT);
    if (hasRaf) frame = globalThis.requestAnimationFrame(done);
    pending.add(cancel);
  }

  /** The file is ending: nothing pending runs, and nothing scheduled from here on does either. */
  function finish(): void {
    ended = true;
    for (const cancel of pending) cancel();
    pending.clear();
  }

  return { schedule, finish };
}
