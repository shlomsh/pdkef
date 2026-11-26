import { describe, expect, it } from 'vitest';
import { NO_WORKER, offThread, resetPageWorker } from './offThread.ts';

const photo = new Blob(['p'], { type: 'image/jpeg' });

// EDGE: node has no Worker or OffscreenCanvas, so the real offThread finds none and starts nothing. The real
// worker's wiring runs in page.worker.browser.test.ts and scanPipeline.browser.test.ts; what each event means for it
// is workerSupervisor.test.ts.
describe('offThread', () => {
  it('needs no worker where the browser has no OffscreenCanvas', async () => {
    resetPageWorker();
    expect(await offThread({ kind: 'inspect', photo })).toBe(NO_WORKER);
  });
});
