// @ts-nocheck - test-only, mirrors PageGrid.test.tsx's untyped style
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { usePreparedOutput } from './usePreparedOutput.ts';

// Real timers with a 1ms quiet wait, the same approach as useMergeDraft.test.tsx.
const FAST = { baseMs: 1, stepMs: 0, maxMs: 1, burstWindowMs: 1 };
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 30)));

function Harness({ apiRef, input }) {
  apiRef.current = usePreparedOutput(input);
  return null;
}

describe('usePreparedOutput', () => {
  let root;
  let api;
  beforeEach(() => {
    root = document.createElement('div');
    api = { current: null };
    URL.createObjectURL = vi.fn(() => `blob:fake-${Math.random()}`);
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => render(null, root));

  const mount = (input) => act(() => render(<Harness apiRef={api} input={{ quietPolicy: FAST, ...input }} />, root));
  const built = (n = 2) => ({ blob: new Blob(['x'.repeat(n)]), pageCount: n });

  it('is idle on a null key and never builds', async () => {
    const build = vi.fn();
    await mount({ key: null, build });
    await settle();
    expect(api.current.status).toBe('idle');
    expect(api.current.url).toBeNull();
    expect(build).not.toHaveBeenCalled();
  });

  it('is pending, then ready once quiet', async () => {
    const build = vi.fn(async () => built(3));
    await mount({ key: 'a', build });
    expect(api.current.status).toBe('pending');
    await settle();
    expect(api.current.status).toBe('ready');
    expect(api.current.pageCount).toBe(3);
    expect(api.current.size).toBe(3);
    expect(api.current.url).toMatch(/^blob:/);
    expect(api.current.generation).toBe(1);
  });

  it('withdraws the blob at once when the key changes', async () => {
    const build = vi.fn(async () => built());
    await mount({ key: 'a', build });
    await settle();
    expect(api.current.status).toBe('ready');
    await mount({ key: 'b', build });
    expect(api.current.status).toBe('pending');
    expect(api.current.blob).toBeNull();
    expect(api.current.url).toBeNull();
  });

  it('restores a cached key as ready without building again', async () => {
    const build = vi.fn(async () => built());
    await mount({ key: 'a', build });
    await settle();
    await mount({ key: 'b', build });
    await settle();
    expect(build).toHaveBeenCalledTimes(2);
    await mount({ key: 'a', build });
    expect(api.current.status).toBe('ready');
    expect(api.current.blob).not.toBeNull();
    expect(build).toHaveBeenCalledTimes(2);
  });

  const builtParts = () => ({
    parts: [
      { blob: new Blob(['aa']), filename: 'a-page-1.pdf' },
      { blob: new Blob(['bbb']), filename: 'a-page-2.pdf' },
    ],
    pageCount: 2,
  });

  it('exposes a parts result with no blob or url, the summed size, and parts null for a blob', async () => {
    await mount({ key: 'a', build: vi.fn(async () => builtParts()) });
    await settle();
    expect(api.current.status).toBe('ready');
    expect(api.current.blob).toBeNull();
    expect(api.current.url).toBeNull();
    expect(api.current.parts.map((p) => p.filename)).toEqual(['a-page-1.pdf', 'a-page-2.pdf']);
    expect(api.current.size).toBe(5);
    expect(api.current.pageCount).toBe(2);
    expect(api.current.generation).toBe(1);
    await mount({ key: 'b', build: vi.fn(async () => built()) });
    await settle();
    expect(api.current.parts).toBeNull();
    expect(api.current.blob).not.toBeNull();
  });

  it('clears parts on a key change, a null key and an error, and restores them from the cache', async () => {
    const build = vi.fn(async () => builtParts());
    await mount({ key: 'a', build });
    await settle();
    await mount({ key: 'b', build });
    expect(api.current.status).toBe('pending');
    expect(api.current.parts).toBeNull();
    await settle();
    await mount({ key: 'a', build });
    expect(api.current.status).toBe('ready');
    expect(api.current.parts).toHaveLength(2);
    expect(build).toHaveBeenCalledTimes(2);
    await mount({ key: null, build });
    expect(api.current.parts).toBeNull();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await mount({ key: 'c', build: vi.fn(async () => { throw new Error('boom'); }) });
    await settle();
    expect(api.current.status).toBe('error');
    expect(api.current.parts).toBeNull();
  });

  it('does not treat an aborted build as an error', async () => {
    const onBuildError = vi.fn();
    const build = vi.fn(async () => { throw new DOMException('aborted', 'AbortError'); });
    await mount({ key: 'a', build, onBuildError });
    await settle();
    expect(api.current.status).toBe('pending');
    expect(onBuildError).not.toHaveBeenCalled();
  });

  it('turns a failed build into error and reports it', async () => {
    const failure = new Error('boom');
    const onBuildError = vi.fn();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await mount({ key: 'a', build: async () => { throw failure; }, onBuildError });
    await settle();
    expect(api.current.status).toBe('error');
    expect(api.current.error).toBe(failure);
    expect(onBuildError).toHaveBeenCalledWith(failure);
    spy.mockRestore();
  });

  it('prepareNow rebuilds the current key after a failed build', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const build = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(built());
    await mount({ key: 'a', build });
    await settle();
    expect(api.current.status).toBe('error');
    await act(async () => api.current.prepareNow());
    await settle();
    expect(build).toHaveBeenCalledTimes(2);
    expect(api.current.status).toBe('ready');
    spy.mockRestore();
  });

  describe('part urls', () => {
    let made;
    beforeEach(() => {
      made = [];
      URL.createObjectURL = vi.fn(() => { const u = `blob:part-${made.length}`; made.push(u); return u; });
    });
    const partsOf = () => ({
      parts: [
        { blob: new Blob(['aa']), filename: 'a-1.png', pageNumber: 1 },
        { blob: new Blob(['bb']), filename: 'a-2.png', pageNumber: 2 },
      ],
      pageCount: 2,
    });
    const revoked = () => URL.revokeObjectURL.mock.calls.map((c) => c[0]);

    it('gives each part an object url and carries its page number', async () => {
      await mount({ key: 'a', build: vi.fn(async () => partsOf()) });
      await settle();
      expect(api.current.parts.map((p) => p.url)).toEqual(made);
      expect(api.current.parts.map((p) => p.pageNumber)).toEqual([1, 2]);
      expect(revoked()).toEqual([]);
    });

    it('revokes them when the key changes, the key goes null, and on unmount', async () => {
      const build = vi.fn(async () => partsOf());
      await mount({ key: 'a', build });
      await settle();
      const first = [...made];
      await mount({ key: 'b', build });
      expect(revoked()).toEqual(expect.arrayContaining(first));
      await settle();
      const second = made.slice(first.length);
      await mount({ key: null, build });
      expect(revoked()).toEqual(expect.arrayContaining(second));
      await mount({ key: 'c', build });
      await settle();
      const third = made.slice(first.length + second.length);
      await act(() => render(null, root));
      expect(revoked()).toEqual(expect.arrayContaining(third));
    });

    it('makes fresh urls when a cached parts state comes back', async () => {
      const build = vi.fn(async () => partsOf());
      await mount({ key: 'a', build });
      await settle();
      await mount({ key: 'b', build });
      await settle();
      await mount({ key: 'a', build });
      expect(api.current.status).toBe('ready');
      expect(api.current.parts.every((p) => made.includes(p.url) && !revoked().includes(p.url))).toBe(true);
      expect(build).toHaveBeenCalledTimes(2);
    });
  });

  describe('autoBuild false', () => {
    it('withdraws on a key change but builds nothing until prepareNow', async () => {
      const build = vi.fn(async () => built());
      await mount({ key: 'a', build, autoBuild: false });
      await settle();
      expect(api.current.status).toBe('pending');
      expect(build).not.toHaveBeenCalled();
      await act(async () => api.current.prepareNow());
      await settle();
      expect(api.current.status).toBe('ready');
      await mount({ key: 'b', build, autoBuild: false });
      expect(api.current.status).toBe('pending');
      expect(api.current.url).toBeNull();
      await settle();
      expect(build).toHaveBeenCalledTimes(1);
      await act(async () => api.current.prepareNow());
      await settle();
      expect(build).toHaveBeenCalledTimes(2);
      expect(api.current.status).toBe('ready');
    });

    it('starts the quiet wait for the current key when autoBuild turns on', async () => {
      const build = vi.fn(async () => built());
      await mount({ key: 'a', build, autoBuild: false });
      await settle();
      expect(build).not.toHaveBeenCalled();
      await mount({ key: 'a', build, autoBuild: true });
      await settle();
      expect(build).toHaveBeenCalledTimes(1);
      expect(api.current.status).toBe('ready');
    });
  });
});
