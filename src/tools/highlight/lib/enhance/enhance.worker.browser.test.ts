// oxlint-disable landmines/colocated-tests -- the subject is enhance.worker.ts, started as a real module Worker
import { afterEach, describe, expect, it } from 'vitest';
import { gray, leaning } from '#lib/pageEnhance/leaning.test-helper.ts';

const started: Worker[] = [];

afterEach(() => {
  for (const worker of started.splice(0)) worker.terminate();
});

function reply(message: unknown) {
  const worker = new Worker(new URL('./enhance.worker.ts', import.meta.url), { type: 'module' });
  started.push(worker);
  return new Promise<unknown>((resolve) => {
    worker.onmessage = (e: MessageEvent) => resolve(e.data);
    worker.postMessage(message);
  });
}

describe('enhance.worker', () => {
  it('answers a sheet with its assessment', async () => {
    expect(await reply({ id: 7, gray: gray(leaning(200, 120, 0)) })).toEqual({ id: 7, ok: true, value: expect.objectContaining({ crooked: false }) });
  });

  it('answers a sheet it cannot read with the error', async () => {
    expect(await reply({ id: 8, gray: null })).toEqual({ id: 8, ok: false, error: expect.any(String) });
  });
});
