import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadProps, watchWorkerDownloads } from './workerDownloads.ts';

describe('downloadProps', () => {
  it.each([
    [1, '1'], [2, '2-5'], [5, '2-5'], [6, '6-10'], [10, '6-10'], [11, '11-20'], [20, '11-20'],
    [21, '21-40'], [40, '21-40'], [41, '41-80'], [80, '41-80'], [81, '81+'], [5000, '81+'],
  ])('puts %i in %s', (n, bucket) => {
    expect(downloadProps({ install: n })).toEqual({ install: bucket });
  });
  it('carries every kind and unmeasured', () => {
    expect(downloadProps({ install: 1, update: 3, addtool: 7, refresh: 12, forwarded: 30, unmeasured: true })).toEqual({
      install: '1', update: '2-5', addtool: '6-10', refresh: '11-20', forwarded: '21-40', unmeasured: true,
    });
  });
  it('sends unmeasured alone', () => {
    expect(downloadProps({ unmeasured: true })).toEqual({ unmeasured: true });
  });
  it.each([[0], [-1], [1.5], ['3'], [NaN], [Infinity], [null]])('ignores %s', (n) => {
    expect(downloadProps({ install: n })).toBeUndefined();
  });
  it.each([[undefined], [null], [{}], ['x'], [{ other: 2 }], [{ unmeasured: false }]])('has nothing to send for %j', (reply) => {
    expect(downloadProps(reply)).toBeUndefined();
  });
});

describe('watchWorkerDownloads', () => {
  let listener: ((e: unknown) => void) | undefined;
  let replies: unknown[];
  let takes: number;
  const worker = (reply?: () => unknown) => ({
    postMessage: vi.fn((_msg: unknown, [port]: MessagePort[]) => {
      takes += 1;
      const next = reply ? reply() : replies.shift();
      if (next !== 'silent') (port as unknown as { postMessage(m: unknown): void }).postMessage(next);
    }),
  });
  const install = (controller: unknown) =>
    vi.stubGlobal('navigator', {
      serviceWorker: { controller, addEventListener: (_t: string, fn: (e: unknown) => void) => (listener = fn) },
    });
  const hint = (source: unknown) => listener?.({ data: { type: 'pdkef:downloads-recorded' }, source });
  // Port messages arrive on real ticks; only the timeouts are faked.
const tick = async () => {
  for (let i = 0; i < 3; i++) {
    await new Promise<void>((r) => {
      const c = new MessageChannel();
      c.port1.onmessage = () => { c.port1.close(); r(); };
      c.port2.postMessage(0);
    });
  }
};
const flush = tick;
const advance = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms);
  await tick();
};

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    listener = undefined;
    replies = [];
    takes = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does nothing without a service worker', () => {
    vi.stubGlobal('navigator', {});
    const onReport = vi.fn();
    expect(() => watchWorkerDownloads(onReport)).not.toThrow();
    expect(onReport).not.toHaveBeenCalled();
  });

  it('takes once from the controller on start and reports the counts', async () => {
    const w = worker();
    replies = [{ refresh: 3 }];
    install(w);
    const onReport = vi.fn();
    watchWorkerDownloads(onReport);
    await flush();
    expect(w.postMessage).toHaveBeenCalledWith({ type: 'pdkef:take-downloads' }, [expect.anything()]);
    expect(onReport).toHaveBeenCalledOnce();
    expect(onReport).toHaveBeenCalledWith({ refresh: '2-5' });
  });

  it('does not take on start without a controller', async () => {
    install(null);
    watchWorkerDownloads(vi.fn());
    await flush();
    expect(takes).toBe(0);
  });

  it('waits 5 s after a hint, restarting on each, then takes once from the hinting worker', async () => {
    install(null);
    const source = worker();
    replies = [{ install: 4 }];
    const onReport = vi.fn();
    watchWorkerDownloads(onReport);
    hint(source);
    await advance(4000);
    hint(source);
    await advance(4000);
    hint(source);
    await advance(4999);
    expect(takes).toBe(0);
    await advance(1);
    expect(takes).toBe(1);
    expect(onReport).toHaveBeenCalledOnce();
    expect(onReport).toHaveBeenCalledWith({ install: '2-5' });
  });

  it('falls back to the controller when the hint has no source', async () => {
    const controller = worker();
    install(controller);
    replies = [{}, { update: 1 }];
    const onReport = vi.fn();
    watchWorkerDownloads(onReport);
    await flush();
    expect(onReport).not.toHaveBeenCalled();
    hint(null);
    await advance(5000);
    expect(controller.postMessage).toHaveBeenCalledTimes(2);
    expect(onReport).toHaveBeenCalledWith({ update: '1' });
  });

  it('reports nothing for {} and keeps listening', async () => {
    install(null);
    const source = worker();
    replies = [{}, { forwarded: 2 }];
    const onReport = vi.fn();
    watchWorkerDownloads(onReport);
    hint(source);
    await advance(5000);
    expect(onReport).not.toHaveBeenCalled();
    hint(source);
    await advance(5000);
    expect(onReport).toHaveBeenCalledOnce();
    expect(onReport).toHaveBeenCalledWith({ forwarded: '2-5' });
  });

  it('reports at most once per page load', async () => {
    const w = worker();
    replies = [{ refresh: 1 }, { refresh: 9 }];
    install(w);
    const onReport = vi.fn();
    watchWorkerDownloads(onReport);
    await flush();
    hint(w);
    await advance(5000);
    expect(w.postMessage).toHaveBeenCalledOnce();
    expect(onReport).toHaveBeenCalledOnce();
  });

  it('gives up quietly after 15 s without a reply, and a later hint tries again', async () => {
    install(null);
    const source = worker();
    replies = ['silent', { addtool: 1 }];
    const onReport = vi.fn();
    watchWorkerDownloads(onReport);
    hint(source);
    await advance(5000 + 15000);
    expect(onReport).not.toHaveBeenCalled();
    hint(source);
    await advance(5000);
    expect(onReport).toHaveBeenCalledWith({ addtool: '1' });
  });

  it('still reports a reply that takes 10 s', async () => {
    install(null);
    let port: { postMessage(m: unknown): void } | undefined;
    const slow = { postMessage: vi.fn((_m: unknown, [p]: MessagePort[]) => { port = p as never; }) };
    const onReport = vi.fn();
    watchWorkerDownloads(onReport);
    hint(slow);
    await advance(5000 + 10000);
    port?.postMessage({ update: 4 });
    await flush();
    expect(onReport).toHaveBeenCalledWith({ update: '2-5' });
  });

  it('ignores other messages and a source that throws', async () => {
    install(null);
    const onReport = vi.fn();
    watchWorkerDownloads(onReport);
    listener?.({ data: { type: 'other' }, source: worker() });
    hint({ postMessage: () => { throw new Error('gone'); } });
    await advance(9000);
    expect(onReport).not.toHaveBeenCalled();
    expect(takes).toBe(0);
  });
});
