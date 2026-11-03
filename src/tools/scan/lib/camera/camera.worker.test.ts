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
    const patchBuffer = new Uint8ClampedArray(16 * 16).fill(90).buffer;
    scope.onmessage!({ data: { t: 123, width, height, buffer, patch: { width: 16, height: 16, buffer: patchBuffer } } });

    expect(postMessage).toHaveBeenCalledTimes(1);
    const obs = postMessage.mock.calls[0][0];
    expect(obs.t).toBe(123);
    expect(obs.quad).toBeNull();
    expect(obs.confidence).toBe(0);
    expect(obs.focus).toBe(0);
    expect(obs.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('carries focus 0 when the message has no patch', async () => {
    const postMessage = vi.fn();
    const scope: { postMessage: typeof postMessage; onmessage?: (e: unknown) => void } = { postMessage };
    vi.stubGlobal('self', scope);
    vi.resetModules();
    await import('./camera.worker.ts');
    const buffer = new Uint8ClampedArray(32 * 24).fill(128).buffer;
    scope.onmessage!({ data: { t: 1, width: 32, height: 24, buffer, patch: null } });
    expect(postMessage.mock.calls[0][0].focus).toBe(0);
  });
});
