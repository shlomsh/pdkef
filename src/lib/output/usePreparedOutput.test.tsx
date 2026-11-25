import { Blob as NodeBlob } from 'node:buffer';
import { URL as NodeURL } from 'node:url';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { usePreparedOutput, type PreparedOutput } from './usePreparedOutput.ts';

type Input = Parameters<typeof usePreparedOutput>[0];
type Api = { current: PreparedOutput | null };

// The quiet wait is the product's timer (FAST: 1 ms), so it runs on fake timers and settle() moves the
// clock past it; the awaited builds are plain promises, which advanceTimersByTimeAsync flushes.
const FAST = { baseMs: 1, stepMs: 0, maxMs: 1, burstWindowMs: 1 };
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(FAST.maxMs + 1); });

function Harness({ apiRef, input }: { apiRef: Api; input: Input }) {
  apiRef.current = usePreparedOutput(input);
  return null;
}

describe('usePreparedOutput', () => {
  // Node's own blob URLs: jsdom has no URL.createObjectURL, and Node's takes a node:buffer Blob.
  let create: ReturnType<typeof vi.spyOn>;
  let revoke: ReturnType<typeof vi.spyOn>;
  let root: HTMLDivElement;
  let api: Api;
  const out = (): PreparedOutput => {
    if (!api.current) throw new Error('the harness has not rendered');
    return api.current;
  };
  beforeEach(() => {
    vi.useFakeTimers();
    URL.createObjectURL = NodeURL.createObjectURL;
    URL.revokeObjectURL = NodeURL.revokeObjectURL;
    create = vi.spyOn(URL, 'createObjectURL');
    revoke = vi.spyOn(URL, 'revokeObjectURL');
    root = document.createElement('div');
    api = { current: null };
  });
  afterEach(() => {
    render(null, root);
    vi.useRealTimers();
    create.mockRestore();
    revoke.mockRestore();
    delete (URL as Partial<typeof URL>).createObjectURL;
    delete (URL as Partial<typeof URL>).revokeObjectURL;
  });

  const mount = (input: Omit<Input, 'quietPolicy'>) => act(() => render(<Harness apiRef={api} input={{ quietPolicy: FAST, ...input }} />, root));
  const built = (n = 2) => ({ blob: new NodeBlob(['x'.repeat(n)]) as unknown as Blob, pageCount: n });

  it('is idle on a null key and never builds', async () => {
    const build = vi.fn();
    await mount({ key: null, build });
    await settle();
    expect(out().status).toBe('idle');
    expect(out().url).toBeNull();
    expect(build).not.toHaveBeenCalled();
  });

  it('is pending, then ready once quiet', async () => {
    const build = async () => built(3);
    await mount({ key: 'a', build });
    expect(out().status).toBe('pending');
    await settle();
    expect(out().status).toBe('ready');
    expect(out().pageCount).toBe(3);
    expect(out().size).toBe(3);
    expect(out().url).toMatch(/^blob:/);
    expect(out().generation).toBe(1);
  });

  it('withdraws the blob at once when the key changes', async () => {
    const build = async () => built();
    await mount({ key: 'a', build });
    await settle();
    expect(out().status).toBe('ready');
    await mount({ key: 'b', build });
    expect(out().status).toBe('pending');
    expect(out().blob).toBeNull();
    expect(out().url).toBeNull();
  });

  it('restores a cached key as ready without building again', async () => {
    const builds: number[] = [];
    const build = async () => { builds.push(1); return built(); };
    await mount({ key: 'a', build });
    await settle();
    await mount({ key: 'b', build });
    await settle();
    expect(builds).toHaveLength(2);
    await mount({ key: 'a', build });
    expect(out().status).toBe('ready');
    expect(out().blob).not.toBeNull();
    expect(builds).toHaveLength(2);
  });

  const builtParts = () => ({
    parts: [
      { blob: new NodeBlob(['aa']) as unknown as Blob, filename: 'a-page-1.pdf' },
      { blob: new NodeBlob(['bbb']) as unknown as Blob, filename: 'a-page-2.pdf' },
    ],
    pageCount: 2,
  });

  it('exposes a parts result with no blob or url, the summed size, and parts null for a blob', async () => {
    await mount({ key: 'a', build: async () => builtParts() });
    await settle();
    expect(out().status).toBe('ready');
    expect(out().blob).toBeNull();
    expect(out().url).toBeNull();
    expect(out().parts?.map((p) => p.filename)).toEqual(['a-page-1.pdf', 'a-page-2.pdf']);
    expect(out().size).toBe(5);
    expect(out().pageCount).toBe(2);
    expect(out().generation).toBe(1);
    await mount({ key: 'b', build: async () => built() });
    await settle();
    expect(out().parts).toBeNull();
    expect(out().blob).not.toBeNull();
  });

  it('clears parts on a key change, a null key and an error, and restores them from the cache', async () => {
    const builds: number[] = [];
    const build = async () => { builds.push(1); return builtParts(); };
    await mount({ key: 'a', build });
    await settle();
    await mount({ key: 'b', build });
    expect(out().status).toBe('pending');
    expect(out().parts).toBeNull();
    await settle();
    await mount({ key: 'a', build });
    expect(out().status).toBe('ready');
    expect(out().parts).toHaveLength(2);
    expect(builds).toHaveLength(2);
    await mount({ key: null, build });
    expect(out().parts).toBeNull();
    await mount({ key: 'c', build: async () => { throw new Error('boom'); } });
    await settle();
    expect(out().status).toBe('error');
    expect(out().parts).toBeNull();
  });

  describe('meta', () => {
    it('is null until a build lands, then carries what the build returned', async () => {
      await mount({ key: 'a', build: async () => ({ ...built(), meta: { level: 'high', before: 10 } }) });
      expect(out().meta).toBeNull();
      await settle();
      expect(out().meta).toEqual({ level: 'high', before: 10 });
    });

    it('is withdrawn with the blob on a key change and restored from the cache', async () => {
      const builds: number[] = [];
      const build = async () => { builds.push(1); return ({ ...built(), meta: { n: Math.random() } }); };
      await mount({ key: 'a', build });
      await settle();
      const first = out().meta;
      await mount({ key: 'b', build });
      expect(out().meta).toBeNull();
      await settle();
      await mount({ key: 'a', build });
      expect(out().meta).toBe(first);
      expect(builds).toHaveLength(2);
    });

    it('is null for a build that returns none, a null key and an error', async () => {
      await mount({ key: 'a', build: async () => built() });
      await settle();
      expect(out().meta).toBeNull();
      await mount({ key: 'b', build: async () => ({ ...built(), meta: 1 }) });
      await settle();
      expect(out().meta).toBe(1);
      await mount({ key: null, build: vi.fn() });
      expect(out().meta).toBeNull();
      await mount({ key: 'c', build: async () => { throw new Error('boom'); } });
      await settle();
      expect(out().meta).toBeNull();
    });
  });

  it('does not treat an aborted build as an error', async () => {
    const onBuildError = vi.fn();
    const build = async () => { throw new DOMException('aborted', 'AbortError'); };
    await mount({ key: 'a', build, onBuildError });
    await settle();
    expect(out().status).toBe('pending');
    expect(onBuildError).not.toHaveBeenCalled();
  });

  it('re-arms the current key once when its build aborts without a newer change, so it cannot stay pending', async () => {
    const onBuildError = vi.fn();
    let calls = 0;
    const build = async () => {
      calls++;
      if (calls === 1) throw new DOMException('aborted', 'AbortError');
      return built();
    };
    await mount({ key: 'a', build, onBuildError });
    await settle();
    expect(calls).toBe(2);
    expect(out().status).toBe('ready');
    expect(onBuildError).not.toHaveBeenCalled();
  });

  it('re-arms an aborting key only once, so a build that always aborts does not spin', async () => {
    const builds: number[] = [];
    const build = async () => { builds.push(1); throw new DOMException('aborted', 'AbortError'); };
    await mount({ key: 'a', build });
    await settle();
    await settle();
    expect(builds).toHaveLength(2);
    expect(out().status).toBe('pending');
  });

  it('forgets results built for an earlier cacheScope, so a replaced document is not retained', async () => {
    const builds: number[] = [];
    const build = async () => { builds.push(1); return built(); };
    await mount({ key: 'a', build, cacheScope: 1 });
    await settle();
    await mount({ key: 'b', build, cacheScope: 2 });
    await settle();
    expect(builds).toHaveLength(2);
    await mount({ key: 'a', build, cacheScope: 1 });
    expect(out().status).toBe('pending');
    await settle();
    expect(builds).toHaveLength(3);
  });

  it('keeps cached results while the cacheScope stays the same', async () => {
    const builds: number[] = [];
    const build = async () => { builds.push(1); return built(); };
    await mount({ key: 'a', build, cacheScope: 1 });
    await settle();
    await mount({ key: 'b', build, cacheScope: 1 });
    await settle();
    await mount({ key: 'a', build, cacheScope: 1 });
    expect(out().status).toBe('ready');
    expect(builds).toHaveLength(2);
  });

  it('turns a failed build into error and reports it', async () => {
    const failure = new Error('boom');
    const onBuildError = vi.fn();
    const spy = vi.spyOn(console, 'error');
    await mount({ key: 'a', build: async () => { throw failure; }, onBuildError });
    await settle();
    expect(out().status).toBe('error');
    expect(out().error).toBe(failure);
    expect(onBuildError).toHaveBeenCalledWith(failure);
    spy.mockRestore();
  });

  it('prepareNow rebuilds the current key after a failed build', async () => {
    const spy = vi.spyOn(console, 'error');
    const builds: number[] = [];
    const build = async () => {
      builds.push(1);
      if (builds.length === 1) throw new Error('boom');
      return built();
    };
    await mount({ key: 'a', build });
    await settle();
    expect(out().status).toBe('error');
    await act(async () => out().prepareNow());
    await settle();
    expect(builds).toHaveLength(2);
    expect(out().status).toBe('ready');
    spy.mockRestore();
  });

  describe('part urls', () => {
    const made = () => create.mock.results.map((r) => String(r.value));
    const partsOf = () => ({
      parts: [
        { blob: new NodeBlob(['aa']) as unknown as Blob, filename: 'a-1.png', pageNumber: 1 },
        { blob: new NodeBlob(['bb']) as unknown as Blob, filename: 'a-2.png', pageNumber: 2 },
      ],
      pageCount: 2,
    });
    const revoked = () => revoke.mock.calls.map((c) => c[0]);

    it('gives each part an object url and carries its page number', async () => {
      await mount({ key: 'a', build: async () => partsOf() });
      await settle();
      expect(out().parts?.map((p) => p.url)).toEqual(made());
      expect(out().parts?.map((p) => p.pageNumber)).toEqual([1, 2]);
      expect(revoked()).toEqual([]);
    });

    it('revokes them when the key changes, the key goes null, and on unmount', async () => {
      const builds: number[] = [];
      const build = async () => { builds.push(1); return partsOf(); };
      await mount({ key: 'a', build });
      await settle();
      const first = made();
      await mount({ key: 'b', build });
      expect(revoked()).toEqual(expect.arrayContaining(first));
      await settle();
      const second = made().slice(first.length);
      await mount({ key: null, build });
      expect(revoked()).toEqual(expect.arrayContaining(second));
      await mount({ key: 'c', build });
      await settle();
      const third = made().slice(first.length + second.length);
      await act(() => render(null, root));
      expect(revoked()).toEqual(expect.arrayContaining(third));
    });

    it('makes fresh urls when a cached parts state comes back', async () => {
      const builds: number[] = [];
      const build = async () => { builds.push(1); return partsOf(); };
      await mount({ key: 'a', build });
      await settle();
      await mount({ key: 'b', build });
      await settle();
      await mount({ key: 'a', build });
      expect(out().status).toBe('ready');
      expect(out().parts?.every((p) => made().includes(p.url) && !revoked().includes(p.url))).toBe(true);
      expect(builds).toHaveLength(2);
    });
  });

  describe('autoBuild false', () => {
    it('withdraws on a key change but builds nothing until prepareNow', async () => {
      const builds: number[] = [];
      const build = async () => { builds.push(1); return built(); };
      await mount({ key: 'a', build, autoBuild: false });
      await settle();
      expect(out().status).toBe('pending');
      expect(builds).toEqual([]);
      await act(async () => out().prepareNow());
      await settle();
      expect(out().status).toBe('ready');
      await mount({ key: 'b', build, autoBuild: false });
      expect(out().status).toBe('pending');
      expect(out().url).toBeNull();
      await settle();
      expect(builds).toHaveLength(1);
      await act(async () => out().prepareNow());
      await settle();
      expect(builds).toHaveLength(2);
      expect(out().status).toBe('ready');
    });

    it('starts the quiet wait for the current key when autoBuild turns on', async () => {
      const builds: number[] = [];
      const build = async () => { builds.push(1); return built(); };
      await mount({ key: 'a', build, autoBuild: false });
      await settle();
      expect(builds).toEqual([]);
      await mount({ key: 'a', build, autoBuild: true });
      await settle();
      expect(builds).toHaveLength(1);
      expect(out().status).toBe('ready');
    });
  });
});
