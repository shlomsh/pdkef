import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import type { Pins } from '../edges/follow.ts';
import { brokenPhoto, photoOfNothing } from '../../../../test/support/scanTool.browser.tsx';
import { answerNetwork, worker as network } from '../../../../test/support/network.browser.ts';
import { NO_WORKER, offThread, resetPageWorker } from './offThread.ts';
import type { PageJob, PageReply, PageRequest } from './protocol.ts';
import { processWith, traceWith, type CanvasKit, type ProcessedWithReport } from './steps.ts';

const pageKit: CanvasKit = {
  surface(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    return {
      canvas,
      ctx,
      toBlob: (type, quality) => new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no blob'))), type, quality)),
      free: () => {
        canvas.width = 0;
        canvas.height = 0;
      },
    };
  },
  async decode(blob) {
    const bitmap = await createImageBitmap(blob);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  },
};

const INNER: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];

const bowedPage = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 800;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#2b2118';
  ctx.fillRect(0, 0, 600, 800);
  ctx.fillStyle = '#f2efe6';
  ctx.beginPath();
  ctx.moveTo(60, 80);
  ctx.quadraticCurveTo(300, 20, 540, 80);
  ctx.lineTo(540, 720);
  ctx.quadraticCurveTo(300, 780, 60, 720);
  ctx.closePath();
  ctx.fill();
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no blob'))), 'image/png'));
};

answerNetwork();

let worker: Worker;
let nextId = 0;

const ask = (job: PageJob) => {
  nextId += 1;
  const id = nextId;
  return new Promise<PageReply>((resolve) => {
    const onMessage = (e: MessageEvent<PageReply>) => {
      if (e.data.id !== id) return;
      worker.removeEventListener('message', onMessage);
      resolve(e.data);
    };
    worker.addEventListener('message', onMessage);
    worker.postMessage({ id, job });
  });
};

beforeEach(() => {
  worker = new Worker(new URL('./page.worker.ts', import.meta.url), { type: 'module' });
  resetPageWorker();
});

afterEach(() => {
  worker.terminate();
  vi.restoreAllMocks();
  resetPageWorker();
});

describe('page worker', () => {
  it('hands a job it cannot do back as an error, answers a trace job with what traceWith returns, runs a process job with the page\'s pins, and offThread hands back a failed job with its error while the worker carries on', async () => {
    const failed = await ask({ kind: 'inspect', photo: brokenPhoto('x.jpg') });
    expect(failed, 'job it cannot do').toMatchObject({ ok: false });
    const { error } = failed as { error: unknown };
    expect(error, 'error').toBeInstanceOf(Error);
    expect(error, 'error name').toMatchObject({ name: 'InvalidStateError' });

    const image = await bowedPage();
    const pins: Pins = [[{ k: 7, at: { x: 0.5, y: 0.16 } }], [], [], []];
    const plain = await ask({ kind: 'trace', image, quad: INNER, pins: null });
    const pinned = await ask({ kind: 'trace', image, quad: INNER, pins });
    expect(plain, 'trace').toEqual({ id: expect.any(Number), ok: true, value: await traceWith(pageKit, image, INNER) });
    expect(pinned, 'trace with pins').toEqual({ id: expect.any(Number), ok: true, value: await traceWith(pageKit, image, INNER, pins) });
    expect((pinned as { value: unknown }).value).not.toEqual((plain as { value: unknown }).value);

    const photo = image;
    const run = async (withPins: Pins | null) => {
      const reply = await ask({ kind: 'process', photo, quad: INNER, filter: 'document', paperEdges: true, pins: withPins, fine: true });
      return (reply as { value: ProcessedWithReport }).value;
    };
    const plainPage = await run(null);
    const pinnedPage = await run(pins);
    const here = await processWith(pageKit, photo, INNER, 'document', true, pins, true);
    expect(pinnedPage.measureError).toBeNull();
    expect(pinnedPage.page.bentPx).toBe(here.page.bentPx);
    expect([pinnedPage.page.width, pinnedPage.page.height]).toEqual([here.page.width, here.page.height]);
    expect(pinnedPage.page.blob.size).toBe(here.page.blob.size);
    expect(pinnedPage.page.bentPx).not.toBe(plainPage.page.bentPx);
    const reply = await ask({ kind: 'process', photo, quad: INNER, filter: 'grayscale', paperEdges: false, pins, fine: false });
    const sheet = (reply as { value: ProcessedWithReport }).value;
    const sheetHere = await processWith(pageKit, photo, INNER, 'grayscale', false, pins, false);
    expect([sheet.page.width, sheet.page.height, sheet.page.bentPx, sheet.page.blob.size]).toEqual([sheetHere.page.width, sheetHere.page.height, sheetHere.page.bentPx, sheetHere.page.blob.size]);

    await expect(offThread({ kind: 'inspect', photo: brokenPhoto('b.jpg') }), 'offThread failed job').rejects.toMatchObject({ name: 'InvalidStateError' });
    // The worker itself carries on.
    expect(await offThread({ kind: 'inspect', photo: await photoOfNothing('p.jpg') })).toMatchObject(INSPECTED);
  });
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
