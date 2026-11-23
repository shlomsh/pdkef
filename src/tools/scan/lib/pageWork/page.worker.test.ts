import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

/** The worker module loaded against a stand-in `self`; its replies land in `postMessage`. */
async function loadWorker() {
  const postMessage = vi.fn();
  const scope: { postMessage: typeof postMessage; onmessage?: (e: unknown) => Promise<void> } = { postMessage };
  // forced: a worker's own scope, which a page cannot give: the module reads `self.onmessage` and answers by `self.postMessage`
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
});
