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
});
