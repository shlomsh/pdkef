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
});
