// Preloaded into every Vitest worker by `execArgv` in vitest.config.js (QUAL-52). A test stuck in a loop that never
// yields, such as an endless render inside act(), cannot reach a test timeout or see its parent die, so the worker
// spins for good, parented to PID 1. A thread of its own can still run, so it watches for both from there.
import { writeSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { createStallWatch, stallLimit } from './vitest-worker-watchdog-core.mjs';

/** Set on the worker's global once its watcher thread is polling, for a test that must not act before then. */
const WATCHING = Symbol.for('vitest-worker-watchdog.watching');

const pollMs = Number(process.env.VITEST_WATCHDOG_POLL_MS ?? 2000);

function stop(message) {
  // A thread's process.stderr goes through the main thread, which is the one that is stuck.
  if (message) writeSync(2, `${message}\n`);
  process.kill(process.pid, 'SIGKILL');
}

if (isMainThread) {
  const beats = new Int32Array(new SharedArrayBuffer(4));
  const stallMs = stallLimit(process.execArgv, process.env);
  // Node hands this file's --import to new threads too, so `execArgv: []` keeps the thread from loading itself twice.
  const watcher = new Worker(fileURLToPath(import.meta.url), { workerData: { beats, parent: process.ppid, stallMs }, execArgv: [] });
  watcher.once('message', () => { globalThis[WATCHING] = true; });
  watcher.unref();
  setInterval(() => Atomics.add(beats, 0, 1), pollMs).unref();
} else if (workerData?.beats) {
  const { beats, parent, stallMs } = workerData;
  const watch = createStallWatch({ pollMs, stallMs, parent, readBeat: () => Atomics.load(beats, 0), readPpid: () => process.ppid, stop });
  setInterval(watch.tick, pollMs);
  parentPort.postMessage('watching');
}
