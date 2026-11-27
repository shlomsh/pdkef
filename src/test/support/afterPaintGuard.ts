// QUAL-58: Preact runs a component's effects after the next paint, through a 35 ms timer raced against
// requestAnimationFrame. A test file that ends before that flush leaves it pending; when it fires after
// jsdom is gone it throws `cancelAnimationFrame is not defined`, failing the run with no test to blame.
// Fast synchronous tests leave one at the end of many files (15 of 350 on 2026-11-27), so the jsdom
// setup schedules Preact's flush through this guard (`options.requestAnimationFrame`; `act` swaps its
// own in and back) and cancels whatever is still pending when the file ends.

const RAF_TIMEOUT = 35;

/** Preact's `afterNextFrame`, each step reading the timers when it runs as Preact does, so fake timers still apply. */
export function createAfterPaintGuard() {
  const pending = new Set<() => void>();
  let ended = false;

  function schedule(flush: () => void): void {
    if (ended) return;
    const hasRaf = typeof globalThis.requestAnimationFrame === 'function';
    // Each step reads the timers when it runs, as Preact does; a handle is cleared by the clock that made it.
    const clearRace = { timeout: globalThis.clearTimeout, frame: hasRaf ? globalThis.cancelAnimationFrame : () => {} };
    let frame = 0;
    let clearAfter = () => {};
    const done = () => {
      clearRace.timeout(timeout);
      clearRace.frame(frame);
      const clear = globalThis.clearTimeout;
      const after = globalThis.setTimeout(() => {
        pending.delete(cancel);
        flush();
      });
      clearAfter = () => clear(after);
    };
    const cancel = () => { clearRace.timeout(timeout); clearRace.frame(frame); clearAfter(); };
    const timeout = globalThis.setTimeout(done, RAF_TIMEOUT);
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
