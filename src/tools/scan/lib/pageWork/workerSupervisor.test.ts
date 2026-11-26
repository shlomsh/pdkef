import { describe, expect, it } from 'vitest';
import { PROBE_MS, canStartWorker, supervise, type Phase, type Signal } from './workerSupervisor.ts';

/** Feeds the signals in order, as the main thread meets them; what each one made the thread do. */
function run(signals: Signal[]) {
  let phase: Phase = 'probing';
  const retires: boolean[] = [];
  for (const signal of signals) {
    const next = supervise(phase, signal);
    phase = next.phase;
    retires.push(next.retire);
  }
  return { phase, retired: retires.filter(Boolean).length };
}

describe('offThread', () => {
  it('gives up on a worker whose probe says no, for good', () => {
    expect(run([{ kind: 'probe-answered', ok: false }])).toEqual({ phase: 'retired', retired: 1 });
    // Later jobs and signals find no worker, and it is not terminated again.
    expect(run([{ kind: 'probe-answered', ok: false }, { kind: 'probe-answered', ok: true }, { kind: 'crashed' }])).toEqual({ phase: 'retired', retired: 1 });
  });

  it('needs no worker where the browser has no OffscreenCanvas', () => {
    expect(canStartWorker({ worker: true, offscreenCanvas: false })).toBe(false);
    expect(canStartWorker({ worker: false, offscreenCanvas: true })).toBe(false);
    expect(canStartWorker({ worker: true, offscreenCanvas: true })).toBe(true);
  });

  it('hands back the jobs waiting on a worker that dies', () => {
    // The worker answers its probe, then dies with a job waiting.
    expect(run([{ kind: 'probe-answered', ok: true }])).toEqual({ phase: 'ready', retired: 0 });
    expect(run([{ kind: 'probe-answered', ok: true }, { kind: 'crashed' }])).toEqual({ phase: 'retired', retired: 1 });
    expect(supervise('ready', { kind: 'crashed' })).toEqual({ phase: 'retired', retire: true });
    expect(supervise('retired', { kind: 'probe-answered', ok: true })).toEqual({ phase: 'retired', retire: false });
  });

  it('stops waiting for a worker that never answers its probe', () => {
    expect(PROBE_MS).toBe(15_000);
    expect(run([{ kind: 'probe-timeout' }])).toEqual({ phase: 'retired', retired: 1 });
    expect(run([{ kind: 'probe-failed' }])).toEqual({ phase: 'retired', retired: 1 });
    // A timeout after the probe answered (its timer is cleared by then) ends nothing.
    expect(run([{ kind: 'probe-answered', ok: true }, { kind: 'probe-timeout' }])).toEqual({ phase: 'ready', retired: 0 });
  });
});
