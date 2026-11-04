import { afterEach, describe, expect, it, vi } from 'vitest';
import { leaning, gray } from '#lib/pageEnhance/leaning.test-helper.ts';
import { openAssessor, WorkerLost } from './assessor.ts';

const SHEET = gray(leaning(200, 120, 0));

class FakeWorker {
  static last: FakeWorker;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { preventDefault(): void }) => void) | null = null;
  terminate = vi.fn();
  sent: Array<{ id: number }> = [];
  constructor() { FakeWorker.last = this; }
  postMessage(message: { id: number }, transfer: ArrayBuffer[]) { this.sent.push(message); this.transfer = transfer; }
  transfer: ArrayBuffer[] = [];
}

afterEach(() => vi.unstubAllGlobals());

describe('openAssessor', () => {
  it('reads on the main thread where there is no worker', async () => {
    const a = await openAssessor().assess(SHEET);
    expect(a.crooked).toBe(false);
  });

  it('hands the pixels to the worker and takes its answer', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const assessor = openAssessor();
    const asked = assessor.assess({ ...SHEET, data: new Uint8ClampedArray(SHEET.data) });
    const worker = FakeWorker.last;
    expect(worker.transfer).toHaveLength(1);
    const answer = { turn: 0, turnConfidence: 0, spine: null, leans: [0], bentPx: 0, crooked: false };
    worker.onmessage?.({ data: { id: worker.sent[0].id, ok: true, value: answer } });
    expect(await asked).toEqual(answer);
    assessor.close();
    expect(worker.terminate).toHaveBeenCalled();
  });

  it('says the worker was lost when it dies holding a sheet, and reads on the main thread after', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const assessor = openAssessor();
    const asked = assessor.assess({ ...SHEET, data: new Uint8ClampedArray(SHEET.data) });
    FakeWorker.last.onerror?.({ preventDefault() {} });
    await expect(asked).rejects.toBeInstanceOf(WorkerLost);
    expect((await assessor.assess(SHEET)).crooked).toBe(false);
  });

  it('passes on a failure the worker reports', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const asked = openAssessor().assess({ ...SHEET, data: new Uint8ClampedArray(SHEET.data) });
    const worker = FakeWorker.last;
    worker.onmessage?.({ data: { id: worker.sent[0].id, ok: false, error: 'boom' } });
    await expect(asked).rejects.toThrow('boom');
  });
});
