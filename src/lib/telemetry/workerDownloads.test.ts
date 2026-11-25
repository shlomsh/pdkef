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
  // A worker is a real MessagePort; the other end answers each take with a real message on the reply port.
  const open: MessagePort[] = [];
  const worker = (reply?: () => unknown) => {
    const { port1, port2 } = new MessageChannel();
    open.push(port1, port2);
    const seen: { data: unknown; ports: number }[] = [];
    const replyPorts: MessagePort[] = [];
    port2.onmessage = (e) => {
      takes += 1;
      seen.push({ data: e.data, ports: e.ports.length });
      open.push(...e.ports);
      replyPorts.push(...e.ports);
      const next = reply ? reply() : replies.shift();
      if (next !== 'silent') e.ports[0].postMessage(next);
    };
    return { port: port1, seen, replyPorts };
  };
  // Forced: navigator.serviceWorker does not exist in Node, so the page's service worker is a mock.
  const install = (controller: unknown) =>
    vi.stubGlobal('navigator', {
      serviceWorker: { controller, addEventListener: (_t: string, fn: (e: unknown) => void) => (listener = fn) },
    });
  const hint = (source: unknown) => listener?.({ data: { type: 'pdkef:downloads-recorded' }, source });
  // Port messages arrive on real ticks, one for the take and one for its reply; only the timeouts are faked.
const tick = async () => {
  for (let i = 0; i < 6; i++) {
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
    for (const p of open.splice(0)) p.close();
  });

  it('does nothing without a service worker', () => {
    expect(navigator.serviceWorker).toBeUndefined();
    const onReport = vi.fn();
    expect(() => watchWorkerDownloads(onReport)).not.toThrow();
    expect(onReport).not.toHaveBeenCalled();
  });

  it('takes once from the controller on start and reports the counts', async () => {
    const w = worker();
    replies = [{ refresh: 3 }];
    install(w.port);
    const onReport = vi.fn();
    watchWorkerDownloads(onReport);
    await flush();
    expect(w.seen).toEqual([{ data: { type: 'pdkef:take-downloads' }, ports: 1 }]);
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
    const source = worker().port;
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
    install(controller.port);
    replies = [{}, { update: 1 }];
    const onReport = vi.fn();
    watchWorkerDownloads(onReport);
    await flush();
    expect(onReport).not.toHaveBeenCalled();
    hint(null);
    await advance(5000);
    expect(controller.seen).toHaveLength(2);
    expect(onReport).toHaveBeenCalledWith({ update: '1' });
  });

  it('reports nothing for {} and keeps listening', async () => {
    install(null);
    const source = worker().port;
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
    install(w.port);
    const onReport = vi.fn();
    watchWorkerDownloads(onReport);
    await flush();
    hint(w.port);
    await advance(5000);
    expect(w.seen).toHaveLength(1);
    expect(onReport).toHaveBeenCalledOnce();
  });

  it('gives up quietly after 15 s without a reply, and a later hint tries again', async () => {
    install(null);
    const source = worker().port;
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
    // The slow worker keeps the reply port it was handed and answers late.
    const slow = worker(() => 'silent');
    const onReport = vi.fn();
    watchWorkerDownloads(onReport);
    hint(slow.port);
    await advance(5000 + 10000);
    expect(slow.replyPorts).toHaveLength(1);
    slow.replyPorts[0].postMessage({ update: 4 });
    await flush();
    expect(onReport).toHaveBeenCalledWith({ update: '2-5' });
  });

  it('ignores other messages and a source that throws', async () => {
    install(null);
    const onReport = vi.fn();
    watchWorkerDownloads(onReport);
    listener?.({ data: { type: 'other' }, source: worker().port });
    hint({ postMessage: () => { throw new Error('gone'); } });
    await advance(9000);
    expect(onReport).not.toHaveBeenCalled();
    expect(takes).toBe(0);
  });
});
