// The watchdog's decisions, apart from its thread and timers (QUAL-52, LAND-02): the thread calls tick() once per poll,
// and a test calls it directly, so no test waits on a real clock.

const FIVE_MINUTES = 300_000;

/** Far above any real synchronous stretch in the suite, and off while a debugger may hold the thread at a breakpoint. */
export function stallLimit(execArgv, env) {
  if (execArgv.some((arg) => arg.startsWith('--inspect'))) return Infinity;
  return Number(env.VITEST_WATCHDOG_STALL_MS ?? FIVE_MINUTES);
}

/**
 * Counts missed polls, not a clock: a clock jumps across a laptop's sleep, and a poll that never ran is not missed.
 * `stop()` with no message ends a worker whose parent is gone; with a message, one that stopped yielding.
 */
export function createStallWatch({ pollMs, stallMs, parent, readBeat, readPpid, stop }) {
  let lastBeat = readBeat();
  let missed = 0;
  return {
    tick() {
      if (readPpid() !== parent) return stop();
      const beat = readBeat();
      missed = beat === lastBeat ? missed + 1 : 0;
      lastBeat = beat;
      if (missed * pollMs >= stallMs) {
        stop(`Vitest worker ${process.pid} stopped: its test never returned to the event loop for ${stallMs} ms.`);
      }
    },
  };
}
