import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('camera worker', () => {
  it('answers a gray frame with its observation', async () => {
    const postMessage = vi.fn();
    const scope: { postMessage: typeof postMessage; onmessage?: (e: unknown) => void } = { postMessage };
    vi.stubGlobal('self', scope);
    vi.resetModules();
    await import('./camera.worker.ts');
    expect(typeof scope.onmessage).toBe('function');

    const width = 32;
    const height = 24;
    const buffer = new Uint8ClampedArray(width * height).fill(128).buffer;
    scope.onmessage!({ data: { t: 123, width, height, buffer } });

    expect(postMessage).toHaveBeenCalledTimes(1);
    const obs = postMessage.mock.calls[0][0];
    expect(obs.t).toBe(123);
    expect(obs.quad).toBeNull();
    expect(obs.confidence).toBe(0);
    expect(obs.hash).toMatch(/^[0-9a-f]{16}$/);
  });
});
