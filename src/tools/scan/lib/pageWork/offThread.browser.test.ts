import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { NO_WORKER, offThread, resetPageWorker } from './offThread.ts';
import type { PageRequest } from './protocol.ts';
import { brokenPhoto, photoOfNothing } from '../../../../test/support/scanTool.browser.tsx';
import { answerNetwork, worker as network } from '../../../../test/support/network.browser.ts';

answerNetwork();

beforeEach(() => {
  resetPageWorker();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetPageWorker();
});

const INSPECTED = { quad: null, width: 400, height: 300, turns: 0 };

describe('offThread', () => {
  it('starts one module worker, probes it once, then sends it every job', async () => {
    const posted = vi.spyOn(Worker.prototype, 'postMessage');
    const photo = await photoOfNothing('p.jpg');
    const first = await offThread({ kind: 'inspect', photo });
    const second = await offThread({ kind: 'inspect', photo });
    expect(first).toMatchObject(INSPECTED);
    expect(second).toMatchObject(INSPECTED);
    expect(new Set(posted.mock.contexts).size).toBe(1);
    expect(posted.mock.calls.map(([request]) => (request as PageRequest).job.kind)).toEqual(['probe', 'inspect', 'inspect']);
  });

  it('hands back a job the worker failed, with its error', async () => {
    await expect(offThread({ kind: 'inspect', photo: brokenPhoto('b.jpg') })).rejects.toMatchObject({ name: 'InvalidStateError' });
    // The worker itself carries on.
    expect(await offThread({ kind: 'inspect', photo: await photoOfNothing('p.jpg') })).toMatchObject(INSPECTED);
  });

  it('runs on the main thread when the worker cannot load', async () => {
    const posted = vi.spyOn(Worker.prototype, 'postMessage');
    const terminated = vi.spyOn(Worker.prototype, 'terminate');
    network.use(http.get(/page\.worker\.ts/, () => new HttpResponse(null, { status: 500 })));
    expect(await offThread({ kind: 'inspect', photo: await photoOfNothing('p.jpg') })).toBe(NO_WORKER);
    expect(posted.mock.calls.map(([request]) => (request as PageRequest).job.kind)).toEqual(['probe']);
    expect(new Set(terminated.mock.contexts)).toEqual(new Set(posted.mock.contexts));
    expect(terminated.mock.contexts[0]).toBe(posted.mock.contexts[0]);
  });
});
