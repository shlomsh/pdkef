import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import type { Pins } from '../edges/follow.ts';
import { brokenPhoto } from '../../../../test/support/scanTool.browser.tsx';
import type { PageJob, PageReply } from './protocol.ts';
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
});

afterEach(() => {
  worker.terminate();
});

describe('page worker', () => {
  it('hands a job it cannot do back as an error, for the main thread to run', async () => {
    const reply = await ask({ kind: 'inspect', photo: brokenPhoto('x.jpg') });
    expect(reply).toMatchObject({ ok: false });
    const { error } = reply as { error: unknown };
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: 'InvalidStateError' });
  });

  it('answers a trace job with what traceWith returns', async () => {
    const image = await bowedPage();
    const pins: Pins = [[{ k: 7, at: { x: 0.5, y: 0.16 } }], [], [], []];
    const plain = await ask({ kind: 'trace', image, quad: INNER, pins: null });
    const pinned = await ask({ kind: 'trace', image, quad: INNER, pins });
    expect(plain).toEqual({ id: expect.any(Number), ok: true, value: await traceWith(pageKit, image, INNER) });
    expect(pinned).toEqual({ id: expect.any(Number), ok: true, value: await traceWith(pageKit, image, INNER, pins) });
    expect((pinned as { value: unknown }).value).not.toEqual((plain as { value: unknown }).value);
  });

  it('runs a process job with the page\'s pins, so the flattening reads the border they shaped', async () => {
    const photo = await bowedPage();
    const pins: Pins = [[{ k: 7, at: { x: 0.5, y: 0.16 } }], [], [], []];
    const run = async (withPins: Pins | null) => {
      const reply = await ask({ kind: 'process', photo, quad: INNER, filter: 'document', paperEdges: true, pins: withPins, fine: true });
      return (reply as { value: ProcessedWithReport }).value;
    };
    const plain = await run(null);
    const pinned = await run(pins);
    const here = await processWith(pageKit, photo, INNER, 'document', true, pins, true);
    expect(pinned.measureError).toBeNull();
    expect(pinned.page.bentPx).toBe(here.page.bentPx);
    expect([pinned.page.width, pinned.page.height]).toEqual([here.page.width, here.page.height]);
    expect(pinned.page.blob.size).toBe(here.page.blob.size);
    expect(pinned.page.bentPx).not.toBe(plain.page.bentPx);
    const reply = await ask({ kind: 'process', photo, quad: INNER, filter: 'grayscale', paperEdges: false, pins, fine: false });
    const sheet = (reply as { value: ProcessedWithReport }).value;
    const sheetHere = await processWith(pageKit, photo, INNER, 'grayscale', false, pins, false);
    expect([sheet.page.width, sheet.page.height, sheet.page.bentPx, sheet.page.blob.size]).toEqual([sheetHere.page.width, sheetHere.page.height, sheetHere.page.bentPx, sheetHere.page.blob.size]);
  });
});
