import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { isUpdateHeld } from '#lib/appUpdate/updateHolds.ts';
import { compressImageToTarget } from '../lib/compressImage.js';
import { waitUntil } from '../../../test/support/waitUntil.ts';
import { drainPromises } from '../../../test/support/drainPromises.ts';
import { useImageBatch } from './useImageBatch.ts';

vi.mock('../lib/compressImage.js', { spy: true });

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

// The mocked compressor is promises only: one drained turn runs everything queued.
const flush = () => act(async () => { await drainPromises(); });

describe('useImageBatch', () => {
  let root: HTMLElement;
  let api: { current: Api | null };
  let createUrl: MockInstance<typeof URL.createObjectURL>;
  let revokeUrl: MockInstance<typeof URL.revokeObjectURL>;
  const urls = () => createUrl.mock.results.map((r) => r.value as string);
  beforeEach(() => {
    root = document.createElement('div');
    api = { current: null };
    // Spy-through: Node's real object URLs, only watched.
    createUrl = vi.spyOn(URL, 'createObjectURL');
    revokeUrl = vi.spyOn(URL, 'revokeObjectURL');
    // Forced: the real compressor decodes the photo with createImageBitmap or a blob: Image, which jsdom lacks.
    vi.mocked(compressImageToTarget).mockReset().mockImplementation(() => Promise.resolve(result()));
    act(() => render(<Harness apiRef={api} />, root));
  });
  afterEach(() => {
    act(() => render(null, root));
    createUrl.mockRestore();
    revokeUrl.mockRestore();
  });

  it('two photos make one call per file, in order, at the chosen target, every row met', async () => {
    const a = photo('a.jpg');
    const b = photo('b.jpg');
    act(() => api.current!.choose([a, b], 100));
    await waitUntil(() => expect(api.current!.summary.allFinished).toBe(true));
    const calls = vi.mocked(compressImageToTarget).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe(a);
    expect(calls[1][0]).toBe(b);
    expect(calls[0][1]).toEqual(expect.objectContaining({ targetKB: 100 }));
    expect(calls[1][1]).toEqual(expect.objectContaining({ targetKB: 100 }));
    expect(api.current!.state.rows.map((row) => row.metTarget)).toEqual([true, true]);
    expect(api.current!.phase).toBe('done');
  });

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
    // Forced: the first photo's compress is held until the test lets it finish, and the real decode cannot run here.
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

  it('keeps a result URL while its result is shown, and revokes it once a new target replaces the result', async () => {
    act(() => api.current!.choose([photo('a.jpg')], 50));
    await waitUntil(() => expect(api.current!.prepared.parts).not.toBeNull());
    const part = api.current!.prepared.parts![0];
    expect(part.url).toBe(urls()[0]);
    await flush();
    expect(revokeUrl).not.toHaveBeenCalled();
    act(() => api.current!.setTarget(20, { immediate: true }));
    await waitUntil(() => expect(api.current!.prepared.parts).not.toBeNull());
    expect(revokeUrl).toHaveBeenCalledWith(urls()[0]);
    expect(api.current!.prepared.parts![0].url).toBe(urls()[1]);
  });
});
