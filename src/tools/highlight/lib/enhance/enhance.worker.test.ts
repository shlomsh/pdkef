import { afterEach, describe, expect, it, vi } from 'vitest';
import { gray, leaning } from '#lib/pageEnhance/leaning.test-helper.ts';

afterEach(() => vi.unstubAllGlobals());

describe('enhance.worker', () => {
  it('answers a sheet with its assessment', async () => {
    const posted: unknown[] = [];
    const scope: { onmessage?: (e: { data: unknown }) => void; postMessage(m: unknown): void } = { postMessage: (m) => posted.push(m) };
    vi.stubGlobal('self', scope);
    await import('./enhance.worker.ts');
    scope.onmessage?.({ data: { id: 7, gray: gray(leaning(200, 120, 0)) } });
    expect(posted).toEqual([{ id: 7, ok: true, value: expect.objectContaining({ crooked: false }) }]);
  });

  it('answers a sheet it cannot read with the error', async () => {
    vi.resetModules();
    const posted: unknown[] = [];
    const scope: { onmessage?: (e: { data: unknown }) => void; postMessage(m: unknown): void } = { postMessage: (m) => posted.push(m) };
    vi.stubGlobal('self', scope);
    await import('./enhance.worker.ts');
    scope.onmessage?.({ data: { id: 8, gray: null } });
    expect(posted).toEqual([{ id: 8, ok: false, error: expect.any(String) }]);
  });
});
