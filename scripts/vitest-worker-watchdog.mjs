// Preloaded into every Vitest worker by `execArgv` in vitest.config.js (QUAL-52). A test stuck in a loop that never
// yields, such as an endless render inside act(), cannot reach a test timeout or see its parent die, so the worker
// spins for good, parented to PID 1. A thread of its own can still run, so it watches for both from there.
import { writeSync } from 'node:fs';
import { Worker, isMainThread, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const pollMs = Number(process.env.VITEST_WATCHDOG_POLL_MS ?? 2000);

function stop(message) {
  // A thread's process.stderr goes through the main thread, which is the one that is stuck.
  if (message) writeSync(2, `${message}\n`);
  process.kill(process.pid, 'SIGKILL');
}

if (isMainThread) {
  const beats = new Int32Array(new SharedArrayBuffer(4));
  // Far above any real synchronous stretch in the suite, and off while a debugger may hold the thread at a breakpoint.
  const stallMs = process.execArgv.some((arg) => arg.startsWith('--inspect'))
    ? Infinity
    : Number(process.env.VITEST_WATCHDOG_STALL_MS ?? 300_000);
  // Node hands this file's --import to new threads too, so `execArgv: []` keeps the thread from loading itself twice.
  const watcher = new Worker(fileURLToPath(import.meta.url), { workerData: { beats, parent: process.ppid, stallMs }, execArgv: [] });
  watcher.unref();
  setInterval(() => Atomics.add(beats, 0, 1), pollMs).unref();
} else if (workerData?.beats) {
  const { beats, parent, stallMs } = workerData;
  let lastBeat = Atomics.load(beats, 0);
  // Missed polls, not a clock: a clock jumps across a laptop's sleep, and this interval does not catch up after one.
  let missed = 0;
  setInterval(() => {
    if (process.ppid !== parent) stop();
    const beat = Atomics.load(beats, 0);
    missed = beat === lastBeat ? missed + 1 : 0;
    lastBeat = beat;
    if (missed * pollMs >= stallMs) {
      stop(`Vitest worker ${process.pid} stopped: its test never returned to the event loop for ${stallMs} ms.`);
    }
  }, pollMs);
}
