import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_WORKER, offThread, resetPageWorker } from './offThread.ts';
import type { PageRequest } from './protocol.ts';

// offThread.ts's own wiring of workerSupervisor (the probe's answer, the OffscreenCanvas check, the probe
// timer). What each event means for the worker is workerSupervisor.test.ts; the real worker and its crash
// path run in page.worker.browser.test.ts and scanPipeline.browser.test.ts.
// Forced: node has no module Worker and no OffscreenCanvas, and no real browser worker answers its probe no
// or never answers it. This fake answers each request with `answer`, async, as a worker would.
type Answer = (request: PageRequest) => { ok: true; value: unknown } | { ok: false; error: unknown } | null;
let answer: Answer;
let workers: FakeWorker[] = [];

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
  answer = (request) => ({ ok: true, value: request.job.kind === 'probe' ? true : inspected });
  // oxlint-disable-next-line landmines/no-test-doubles -- Forced: node has no module Worker, and no real browser worker answers its probe no or never answers it
  vi.stubGlobal('Worker', FakeWorker);
  // oxlint-disable-next-line landmines/no-test-doubles -- Forced: node lacks OffscreenCanvas, and the tests need a browser that has it
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
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: a browser that has a Worker but lacks OffscreenCanvas
    vi.stubGlobal('OffscreenCanvas', undefined);
    expect(await offThread({ kind: 'inspect', photo })).toBe(NO_WORKER);
    expect(workers).toHaveLength(0);
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
