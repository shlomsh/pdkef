import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

/** The worker module loaded against a stand-in `self`; its replies land in `postMessage`. */
async function loadWorker() {
  const postMessage = vi.fn();
  const scope: { postMessage: typeof postMessage; onmessage?: (e: unknown) => Promise<void> } = { postMessage };
  vi.stubGlobal('self', scope);
  vi.resetModules();
  await import('./page.worker.ts');
  return { scope, postMessage };
}

// EDGE: node has no OffscreenCanvas or createImageBitmap, so only the worker's refusals run here; the
// pixel work it hands to steps.ts runs in scanPipeline.test.ts, and in Chromium in the scan e2e specs.
describe('page worker', () => {
  it('answers its probe no where it cannot draw off screen', async () => {
    const { scope, postMessage } = await loadWorker();
    await scope.onmessage!({ data: { id: 1, job: { kind: 'probe' } } });
    expect(postMessage).toHaveBeenCalledWith({ id: 1, ok: true, value: false });
  });

  it('hands a job it cannot do back as an error, for the main thread to run', async () => {
    const { scope, postMessage } = await loadWorker();
    await scope.onmessage!({ data: { id: 2, job: { kind: 'inspect', photo: new Blob(['x']) } } });
    const reply = postMessage.mock.calls[0][0];
    expect(reply).toMatchObject({ id: 2, ok: false });
    expect(reply.error).toBeInstanceOf(Error);
  });

  it('answers a trace job with what traceWith returns', async () => {
    const sides = [[{ x: 0, y: 0 }], [], [], []];
    const traceWith = vi.fn(async () => sides);
    vi.doMock('./steps.ts', async (importOriginal) => ({ ...(await importOriginal<typeof import('./steps.ts')>()), traceWith }));
    const { scope, postMessage } = await loadWorker();
    const image = new Blob(['x']);
    const quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    const pins = [[{ k: 0.5, at: { x: 0.2, y: 0.3 } }], [], [], []];
    await scope.onmessage!({ data: { id: 3, job: { kind: 'trace', image, quad, pins } } });
    expect(traceWith).toHaveBeenCalledWith(expect.anything(), image, quad, pins);
    expect(postMessage).toHaveBeenCalledWith({ id: 3, ok: true, value: sides });
    vi.doUnmock('./steps.ts');
  });

  it('runs a process job with the page\'s pins, so the flattening reads the border they shaped', async () => {
    const done = { page: {}, measureError: null };
    const processWith = vi.fn(async () => done);
    vi.doMock('./steps.ts', async (importOriginal) => ({ ...(await importOriginal<typeof import('./steps.ts')>()), processWith }));
    const { scope, postMessage } = await loadWorker();
    const photo = new Blob(['x']);
    const quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
    const pins = [[{ k: 0.5, at: { x: 0.5, y: 0.12 } }], [], [], []];
    await scope.onmessage!({ data: { id: 4, job: { kind: 'process', photo, quad, filter: 'document', paperEdges: true, pins, fine: false } } });
    expect(processWith).toHaveBeenCalledWith(expect.anything(), photo, quad, 'document', true, pins, false);
    expect(postMessage).toHaveBeenCalledWith({ id: 4, ok: true, value: done });
    vi.doUnmock('./steps.ts');
  });
});
