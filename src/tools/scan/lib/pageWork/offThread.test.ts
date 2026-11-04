import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_WORKER, offThread, resetPageWorker } from './offThread.ts';
import type { PageRequest } from './protocol.ts';

// EDGE: node has no Worker or OffscreenCanvas. This fake answers each request with `answer`, async, as
// a worker would; `fail` makes it fire an error event instead (a chunk that did not load).
type Answer = (request: PageRequest) => { ok: true; value: unknown } | { ok: false; error: unknown } | null;
let answer: Answer;
let workers: FakeWorker[] = [];

class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { preventDefault(): void; error?: unknown; message?: string }) => void) | null = null;
  terminated = false;
  fail = false;
  constructor(public url: URL, public options: WorkerOptions) { workers.push(this); }
  postMessage(request: PageRequest) {
    setTimeout(() => {
      if (this.terminated) return;
      if (this.fail) { this.onerror?.({ preventDefault: () => {}, message: 'load failed' }); return; }
      const reply = answer(request);
      if (reply) this.onmessage?.({ data: { id: request.id, ...reply } });
    });
  }
  terminate() { this.terminated = true; }
}

const photo = new Blob(['p'], { type: 'image/jpeg' });
const inspected = { quad: null, width: 4, height: 3, preview: photo };

beforeEach(() => {
  resetPageWorker();
  workers = [];
  answer = (request) => ({ ok: true, value: request.job.kind === 'probe' ? true : inspected });
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('OffscreenCanvas', class {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('offThread', () => {
  it('starts one module worker, probes it once, then sends it every job', async () => {
    const seen: string[] = [];
    const inner = answer;
    answer = (request) => { seen.push(request.job.kind); return inner(request); };
    expect(await offThread({ kind: 'inspect', photo })).toEqual(inspected);
    expect(await offThread({ kind: 'inspect', photo })).toEqual(inspected);
    expect(workers).toHaveLength(1);
    expect(workers[0].options).toEqual({ type: 'module' });
    expect(workers[0].url.pathname).toMatch(/page\.worker\.ts$/);
    expect(seen).toEqual(['probe', 'inspect', 'inspect']);
  });

  it('gives up on a worker whose probe says no, for good', async () => {
    answer = (request) => ({ ok: true, value: request.job.kind === 'probe' ? false : inspected });
    expect(await offThread({ kind: 'inspect', photo })).toBe(NO_WORKER);
    expect(await offThread({ kind: 'inspect', photo })).toBe(NO_WORKER);
    expect(workers).toHaveLength(1);
    expect(workers[0].terminated).toBe(true);
  });

  it('needs no worker where the browser has no OffscreenCanvas', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    expect(await offThread({ kind: 'inspect', photo })).toBe(NO_WORKER);
    expect(workers).toHaveLength(0);
  });

  it('hands back a job the worker failed, with its error', async () => {
    const error = new Error('decode failed');
    answer = (request) => (request.job.kind === 'probe' ? { ok: true, value: true } : { ok: false, error });
    await expect(offThread({ kind: 'inspect', photo })).rejects.toBe(error);
    // The worker itself carries on.
    answer = (request) => ({ ok: true, value: request.job.kind === 'probe' ? true : inspected });
    expect(await offThread({ kind: 'inspect', photo })).toEqual(inspected);
  });

  it('runs on the main thread when the worker cannot load', async () => {
    vi.stubGlobal('Worker', class extends FakeWorker { fail = true; });
    expect(await offThread({ kind: 'inspect', photo })).toBe(NO_WORKER);
    expect(workers[0].terminated).toBe(true);
  });

  it('hands back the jobs waiting on a worker that dies', async () => {
    // The worker answers its probe, then never the job.
    answer = (request) => (request.job.kind === 'probe' ? { ok: true, value: true } : null);
    const job = offThread({ kind: 'inspect', photo });
    await new Promise((r) => setTimeout(r, 5));
    workers[0].onerror?.({ preventDefault: () => {}, message: 'crashed' });
    await expect(job).rejects.toThrow('stopped');
    expect(await offThread({ kind: 'inspect', photo })).toBe(NO_WORKER);
  });

  it('stops waiting for a worker that never answers its probe', async () => {
    vi.useFakeTimers();
    answer = () => null;
    const job = offThread({ kind: 'inspect', photo });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await job).toBe(NO_WORKER);
    expect(workers[0].terminated).toBe(true);
  });
});
