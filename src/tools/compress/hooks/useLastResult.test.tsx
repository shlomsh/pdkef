import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePreparedOutput } from '#lib/output/usePreparedOutput.ts';
import { DEFAULT_QUIET, type QuietPolicy } from '#lib/output/quietPrepare.ts';
import { waitUntil } from '../../../test/support/waitUntil.ts';
import { drainPromises } from '../../../test/support/drainPromises.ts';
import { useLastResult } from './useLastResult.ts';

const FAST_QUIET: QuietPolicy = { baseMs: 5, stepMs: 0, maxMs: 5, burstWindowMs: 1 };

type Meta = { name: string };
type Built = { blob: Blob; pageCount: number; meta: Meta };
type Build = (key: string) => Promise<Built>;

const built = (name: string): Built => ({ blob: new Blob([name]), pageCount: 0, meta: { name } });

function Harness({ apiRef, keyed, build, quietPolicy }: { apiRef: { current: Api | null }; keyed: string | null; build: Build; quietPolicy: QuietPolicy }) {
  const prepared = usePreparedOutput<Meta>({ key: keyed, build: () => build(keyed as string), quietPolicy });
  apiRef.current = { prepared, ...useLastResult(prepared) };
  return null;
}
type Api = { prepared: ReturnType<typeof usePreparedOutput<Meta>> } & ReturnType<typeof useLastResult<Meta>>;

describe('useLastResult', () => {
  let root: HTMLElement;
  let api: { current: Api | null };
  let builds: string[];
  let build: Build;
  const show = (keyed: string | null, quietPolicy: QuietPolicy = FAST_QUIET) => act(() => render(<Harness apiRef={api} keyed={keyed} build={(key) => { builds.push(key); return build(key); }} quietPolicy={quietPolicy} />, root));
  const landed = (name: string) => waitUntil(() => api.current!.prepared.status === 'ready' && api.current!.prepared.meta?.name === name);

  beforeEach(() => {
    root = document.createElement('div');
    api = { current: null };
    builds = [];
    build = async (key) => built(key);
  });
  afterEach(() => {
    act(() => render(null, root));
    vi.useRealTimers();
  });

  it('holds the result that landed, and the link of the prepared output while it is ready', async () => {
    show('a');
    expect(api.current!.last).toBeNull();
    await landed('a');
    const { last, prepared } = api.current!;
    expect(last?.blob).toBe(prepared.blob);
    expect(last?.meta).toEqual({ name: 'a' });
    expect(last?.url).toBe(prepared.url);
    expect(last?.url).not.toBeNull();
  });

  it('keeps showing the last result, with a link of its own, while the next one builds', async () => {
    const next = Promise.withResolvers<Built>();
    build = (key) => (key === 'b' ? next.promise : Promise.resolve(built(key)));
    show('a');
    await landed('a');
    const first = api.current!.last!;
    show('b');
    await waitUntil(() => builds.includes('b'));
    expect(api.current!.prepared.status).toBe('pending');
    expect(api.current!.prepared.blob).toBeNull();
    expect(api.current!.prepared.url).toBeNull();
    expect(api.current!.last?.blob).toBe(first.blob);
    expect(api.current!.last?.meta).toEqual({ name: 'a' });
    expect(api.current!.last?.url).toEqual(expect.any(String));
    await act(async () => { next.resolve(built('b')); await drainPromises(); });
    await landed('b');
    expect(api.current!.last?.meta).toEqual({ name: 'b' });
    expect(api.current!.last?.url).toBe(api.current!.prepared.url);
  });

  it('does not rebuild before 1500ms after a level change, and shows the last result meanwhile', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    show('a', DEFAULT_QUIET);
    await act(async () => { await vi.advanceTimersByTimeAsync(1501); });
    await waitUntil(() => api.current!.prepared.status === 'ready', { dueFakeTimers: true });
    // Past the burst window, so the next wait is the base one.
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    show('b', DEFAULT_QUIET);
    await act(async () => { await vi.advanceTimersByTimeAsync(1499); });
    expect(builds).toEqual(['a']);
    expect(api.current!.last?.meta).toEqual({ name: 'a' });
    await act(async () => { await vi.advanceTimersByTimeAsync(2); });
    await waitUntil(() => api.current!.last?.meta.name === 'b', { dueFakeTimers: true });
    expect(builds).toEqual(['a', 'b']);
  });

  it('drops the held result on forget, so one file result never shows for the next', async () => {
    show('a');
    await landed('a');
    act(() => api.current!.forget());
    expect(api.current!.last).toBeNull();
    // The prepared output still holds that same result: it belongs to the dropped file and is not held again.
    show('a');
    await act(async () => { await drainPromises(); });
    expect(api.current!.prepared.status).toBe('ready');
    expect(api.current!.last).toBeNull();
    show('b');
    await landed('b');
    expect(api.current!.last?.meta).toEqual({ name: 'b' });
  });

  it('drops the held result when the build fails', async () => {
    vi.spyOn(console, 'error');
    build = (key) => (key === 'b' ? Promise.reject(new Error('boom')) : Promise.resolve(built(key)));
    show('a');
    await landed('a');
    show('b');
    await waitUntil(() => api.current!.prepared.status === 'error');
    expect(api.current!.last).toBeNull();
  });

  it('drops the held result when there is nothing to build', async () => {
    show('a');
    await landed('a');
    show(null);
    await waitUntil(() => api.current!.prepared.status === 'idle');
    expect(api.current!.last).toBeNull();
  });
});
