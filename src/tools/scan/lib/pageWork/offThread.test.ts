import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_WORKER, offThread, resetPageWorker } from './offThread.ts';
import type { PageRequest } from './protocol.ts';

// EDGE: node has no Worker or OffscreenCanvas. This fake answers each request with `answer`, async, as
// a worker would.
type Answer = (request: PageRequest) => { ok: true; value: unknown } | { ok: false; error: unknown } | null;
let answer: Answer;
let workers: FakeWorker[] = [];
let jobPosted = Promise.withResolvers<void>();

class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { preventDefault(): void; error?: unknown; message?: string }) => void) | null = null;
  terminated = false;
  constructor(public url: URL, public options: WorkerOptions) { workers.push(this); }
  postMessage(request: PageRequest) {
    setTimeout(() => {
      if (this.terminated) return;
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
  jobPosted = Promise.withResolvers<void>();
  answer = (request) => ({ ok: true, value: request.job.kind === 'probe' ? true : inspected });
  // forced: no module worker in this environment, and a page worker that answers as each test says
  vi.stubGlobal('Worker', FakeWorker);
  // forced: a browser with OffscreenCanvas, which this environment lacks
  vi.stubGlobal('OffscreenCanvas', class {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('offThread', () => {
  it('gives up on a worker whose probe says no, for good', async () => {
    answer = (request) => ({ ok: true, value: request.job.kind === 'probe' ? false : inspected });
    expect(await offThread({ kind: 'inspect', photo })).toBe(NO_WORKER);
    expect(await offThread({ kind: 'inspect', photo })).toBe(NO_WORKER);
    expect(workers).toHaveLength(1);
    expect(workers[0].terminated).toBe(true);
  });

  it('needs no worker where the browser has no OffscreenCanvas', async () => {
    // forced: a browser with no OffscreenCanvas
    vi.stubGlobal('OffscreenCanvas', undefined);
    expect(await offThread({ kind: 'inspect', photo })).toBe(NO_WORKER);
    expect(workers).toHaveLength(0);
  });

  it('hands back the jobs waiting on a worker that dies', async () => {
    // The worker answers its probe, then never the job.
    answer = (request) => {
      if (request.job.kind === 'probe') return { ok: true, value: true };
      jobPosted.resolve();
      return null;
    };
    const job = offThread({ kind: 'inspect', photo });
    await jobPosted.promise;
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
