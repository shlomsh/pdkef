import { afterEach, describe, expect, it, vi } from 'vitest';
import { leaning, gray } from '#lib/pageEnhance/leaning.test-helper.ts';
import { openAssessor, WorkerLostError } from './assessor.ts';

const SHEET = gray(leaning(200, 120, 0));

class FakeWorker {
  static last: FakeWorker;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { preventDefault(): void }) => void) | null = null;
  terminate() {}
  sent: Array<{ id: number }> = [];
  constructor() { FakeWorker.last = this; }
  postMessage(message: { id: number }) { this.sent.push(message); }
}

afterEach(() => vi.unstubAllGlobals());

describe('openAssessor', () => {
  it('reads on the main thread where there is no worker', async () => {
    const a = await openAssessor().assess(SHEET);
    expect(a.crooked).toBe(false);
  });

  it('says the worker was lost when it dies holding a sheet, and reads on the main thread after', async () => {
    // forced: a worker that dies holding a sheet
    vi.stubGlobal('Worker', FakeWorker);
    const assessor = openAssessor();
    const asked = assessor.assess({ ...SHEET, data: new Uint8ClampedArray(SHEET.data) });
    FakeWorker.last.onerror?.({ preventDefault() {} });
    await expect(asked).rejects.toBeInstanceOf(WorkerLostError);
    expect((await assessor.assess(SHEET)).crooked).toBe(false);
  });

  it('passes on a failure the worker reports', async () => {
    // forced: a worker that reports a failure
    vi.stubGlobal('Worker', FakeWorker);
    const asked = openAssessor().assess({ ...SHEET, data: new Uint8ClampedArray(SHEET.data) });
    const worker = FakeWorker.last;
    worker.onmessage?.({ data: { id: worker.sent[0].id, ok: false, error: 'boom' } });
    await expect(asked).rejects.toThrow('boom');
  });
});
