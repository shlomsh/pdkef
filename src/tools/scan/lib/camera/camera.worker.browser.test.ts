import { afterEach, describe, expect, it } from 'vitest';

const workers: Worker[] = [];

afterEach(() => {
  for (const worker of workers.splice(0)) worker.terminate();
});

function observe(message: unknown, transfer: ArrayBuffer[]) {
  const worker = new Worker(new URL('./camera.worker.ts', import.meta.url), { type: 'module' });
  workers.push(worker);
  const answer = new Promise<Record<string, unknown>>((resolve, reject) => {
    worker.onmessage = (e) => resolve(e.data);
    worker.onerror = (e) => reject(new Error(e.message));
  });
  worker.postMessage(message, transfer);
  return answer;
}

describe('camera worker', () => {
  it('answers a gray frame with its observation, and carries focus 0 when the message has no patch', async () => {
    const width = 32;
    const height = 24;
    const buffer = new Uint8ClampedArray(width * height).fill(128).buffer;
    const patchBuffer = new Uint8ClampedArray(16 * 16).fill(90).buffer;
    const obs = await observe({ t: 123, width, height, buffer, patch: { width: 16, height: 16, buffer: patchBuffer } }, [buffer, patchBuffer]);
    expect(obs.t).toBe(123);
    expect(obs.quad).toBeNull();
    expect(obs.confidence).toBe(0);
    expect(obs.focus).toBe(0);
    expect(obs.hash).toMatch(/^[0-9a-f]{16}$/);
    const bare = new Uint8ClampedArray(32 * 24).fill(128).buffer;
    const without = await observe({ t: 1, width: 32, height: 24, buffer: bare, patch: null }, [bare]);
    expect(without.focus, 'focus with no patch').toBe(0);
  });
});
