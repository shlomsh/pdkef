import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { isUpdateHeld } from '#lib/appUpdate/updateHolds.ts';
import { compressImageToTarget } from '../lib/compressImage.js';
import { waitUntil } from '../../../test/harness/waitUntil.ts';
import { useImageBatch } from './useImageBatch.ts';

vi.mock('../lib/compressImage.js', () => ({ compressImageToTarget: vi.fn() }));
vi.mock('#lib/telemetry/errorReport.ts', () => ({ reportError: vi.fn() }));

const photo = (name: string) => new File(['x'.repeat(1000)], name, { type: 'image/jpeg' });
const result = () => ({ blob: new Blob(['out'], { type: 'image/jpeg' }), metTarget: true, width: 10, height: 10, originalWidth: 20, originalHeight: 20 });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

type Api = ReturnType<typeof useImageBatch>;

function Harness({ apiRef }: { apiRef: { current: Api | null } }) {
  apiRef.current = useImageBatch();
  return null;
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe('useImageBatch', () => {
  let root: HTMLElement;
  let api: { current: Api | null };
  let urls: string[];
  beforeEach(() => {
    root = document.createElement('div');
    api = { current: null };
    urls = [];
    URL.createObjectURL = vi.fn(() => { const u = `blob:u${urls.length}`; urls.push(u); return u; });
    URL.revokeObjectURL = vi.fn();
    vi.mocked(compressImageToTarget).mockReset().mockImplementation(() => Promise.resolve(result()));
    act(() => render(<Harness apiRef={api} />, root));
  });
  afterEach(() => act(() => render(null, root)));

  it('holds an app update while a set is open, and lets go when it closes', async () => {
    expect(isUpdateHeld()).toBe(false);
    act(() => api.current!.choose([photo('a.jpg'), photo('b.jpg')], 50));
    await waitUntil(() => expect(api.current!.summary.allFinished).toBe(true));
    expect(isUpdateHeld()).toBe(true);
    act(() => api.current!.clear());
    await flush();
    expect(isUpdateHeld()).toBe(false);
  });

  it('lands nothing and starts nothing once the island is gone', async () => {
    const first = deferred<ReturnType<typeof result>>();
    vi.mocked(compressImageToTarget).mockImplementationOnce(() => first.promise);
    act(() => api.current!.choose([photo('a.jpg'), photo('b.jpg')], 50));
    await flush();
    expect(compressImageToTarget).toHaveBeenCalledTimes(1);
    act(() => render(null, root));
    await act(async () => { first.resolve(result()); });
    await flush();
    expect(compressImageToTarget).toHaveBeenCalledTimes(1);
    expect(isUpdateHeld()).toBe(false);
  });

  it('revokes a result URL once a new target replaces the result', async () => {
    act(() => api.current!.choose([photo('a.jpg')], 50));
    await waitUntil(() => expect(api.current!.prepared.parts).not.toBeNull());
    const part = api.current!.prepared.parts![0];
    expect(part.url).toBe('blob:u0');
    act(() => api.current!.setTarget(20, { immediate: true }));
    await waitUntil(() => expect(api.current!.prepared.parts).not.toBeNull());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:u0');
    expect(api.current!.prepared.parts![0].url).toBe('blob:u1');
  });
});
