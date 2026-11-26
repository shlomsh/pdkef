import { describe, expect, it } from 'vitest';
import { answer } from './pageAnswer.ts';

// EDGE: node has no OffscreenCanvas or createImageBitmap, so only the worker's refusals run here; the
// pixel work it hands to steps.ts runs in scanPipeline.test.ts, and in Chromium in the scan e2e specs.
describe('page worker', () => {
  it('answers its probe no where it cannot draw off screen', async () => {
    expect(await answer({ id: 1, job: { kind: 'probe' } })).toEqual({ id: 1, ok: true, value: false });
  });

  it('answers a job it cannot do with the error, for the main thread to run it itself', async () => {
    const reply = await answer({ id: 2, job: { kind: 'inspect', photo: new Blob(['x']) } });
    expect(reply).toMatchObject({ id: 2, ok: false });
    expect((reply as { error: unknown }).error).toBeInstanceOf(Error);
  });
});
