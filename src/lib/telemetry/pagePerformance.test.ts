import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyRequests,
  collectPageMeasures,
  countBucket,
  pageSettled,
  resetPagePerformanceForTests,
  timeBucket,
} from './pagePerformance.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetPagePerformanceForTests();
});

describe('countBucket', () => {
  it('buckets at the edges', () => {
    const at = [0, 1, 2, 5, 6, 15, 16, 30, 31, 50, 51, 400].map(countBucket);
    expect(at).toEqual(['0', '1', '2-5', '2-5', '6-15', '6-15', '16-30', '16-30', '31-50', '31-50', '51+', '51+']);
  });
  it('is undefined for a number that is not a count', () => {
    expect([-1, NaN, Infinity, 1.5].map(countBucket)).toEqual([undefined, undefined, undefined, undefined]);
  });
});

describe('timeBucket', () => {
  it('buckets at the edges', () => {
    expect([0, 1000, 1001, 2500, 2501, 4000, 4001, 90000].map(timeBucket)).toEqual(['le1s', 'le1s', 'le2.5s', 'le2.5s', 'le4s', 'le4s', 'gt4s', 'gt4s']);
  });
  it('is undefined for a number that is not a time', () => {
    expect([-1, NaN, Infinity, undefined].map((n) => timeBucket(n as number))).toEqual([undefined, undefined, undefined, undefined]);
  });
});

describe('classifyRequests', () => {
  const entry = (e: Record<string, unknown>) => e as unknown as PerformanceResourceTiming;
  it('a network file has transferSize above 0; a worker-served file and a memory-cache file are answered on the device', () => {
    const network = entry({ transferSize: 18234, decodedBodySize: 50000 });
    const workerServed = entry({ transferSize: 0, decodedBodySize: 50000, deliveryType: '' });
    const memoryCache = entry({ transferSize: 0, decodedBodySize: 8000, deliveryType: 'cache' });
    expect(classifyRequests([network])).toEqual({ net: 1, local: 0 });
    expect(classifyRequests([workerServed])).toEqual({ net: 0, local: 1 });
    expect(classifyRequests([memoryCache])).toEqual({ net: 0, local: 1 });
  });
  it('a cache delivery with no body size still counts as local', () => {
    expect(classifyRequests([entry({ transferSize: 0, decodedBodySize: 0, deliveryType: 'cache' })])).toEqual({ net: 0, local: 1 });
  });
  it('a cross-origin entry with no timing data is ignored', () => {
    expect(classifyRequests([entry({ transferSize: 0, decodedBodySize: 0, encodedBodySize: 0 })])).toEqual({ net: 0, local: 0 });
  });
  it('counts a mixed load', () => {
    const list = [
      entry({ transferSize: 900, decodedBodySize: 2000 }),
      entry({ transferSize: 300, decodedBodySize: 300 }),
      entry({ transferSize: 0, decodedBodySize: 70000 }),
      entry({ transferSize: 0, decodedBodySize: 0 }),
    ];
    expect(classifyRequests(list)).toEqual({ net: 2, local: 1 });
  });
  it('is undefined when the browser listed no entries at all', () => {
    expect(classifyRequests([])).toBeUndefined();
  });
});

describe('pageSettled', () => {
  // A page and its window, as far as the function reads them: listeners it adds can be fired by name.
  const page = (readyState: string, visibilityState = 'visible') => {
    const listeners: Record<string, Array<() => void>> = {};
    const on = (type: string, cb: () => void) => void (listeners[type] ??= []).push(cb);
    const off = (type: string, cb: () => void) => void (listeners[type] = (listeners[type] ?? []).filter((l) => l !== cb));
    const doc = { readyState, visibilityState, addEventListener: on, removeEventListener: off };
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', { addEventListener: on, removeEventListener: off });
    return { doc, fire: (type: string) => (listeners[type] ?? []).slice().forEach((cb) => cb()), count: () => Object.values(listeners).flat().length };
  };

  it('is loaded at once when the document is complete', async () => {
    page('complete');
    await expect(pageSettled()).resolves.toBe('loaded');
  });

  it('waits for the load event, then says loaded', async () => {
    const p = page('interactive');
    const settled = pageSettled();
    p.fire('load');
    await expect(settled).resolves.toBe('loaded');
  });

  it('says hidden when the page is hidden before load, by pagehide or by visibilitychange', async () => {
    for (const type of ['pagehide', 'visibilitychange']) {
      const p = page('interactive');
      const settled = pageSettled();
      p.doc.visibilityState = 'hidden';
      p.fire(type);
      await expect(settled).resolves.toBe('hidden');
    }
  });

  it('does not call a visibilitychange to visible hidden', async () => {
    const p = page('interactive', 'visible');
    const settled = pageSettled();
    p.fire('visibilitychange');
    p.fire('load');
    await expect(settled).resolves.toBe('loaded');
  });

  it('settles once: the other order and every listener are gone after the first', async () => {
    const p = page('interactive');
    const settled = pageSettled();
    p.fire('pagehide');
    p.fire('load');
    await expect(settled).resolves.toBe('hidden');
    expect(p.count()).toBe(0);
  });

  it('says hidden at once for a page already hidden and still loading', async () => {
    page('loading', 'hidden');
    await expect(pageSettled()).resolves.toBe('hidden');
  });
});

describe('collectPageMeasures', () => {
  const resource = (transferSize: number, decodedBodySize: number) => ({ transferSize, decodedBodySize });
  const stubPerformance = (entries: unknown[]) =>
    vi.stubGlobal('performance', { getEntriesByType: (t: string) => (t === 'navigation' || t === 'resource' ? entries.filter((e) => (e as { t: string }).t === t) : []) });

  it('counts navigation and resource entries together, and takes the latest LCP', async () => {
    stubPerformance([{ t: 'navigation', ...resource(0, 4000) }, { t: 'resource', ...resource(0, 90000) }, { t: 'resource', ...resource(1200, 1200) }]);
    class FakeObserver {
      static supportedEntryTypes = ['largest-contentful-paint'];
      constructor(private cb: (l: { getEntries: () => { startTime: number }[] }) => void) {}
      observe(opts: unknown) { expect(opts).toEqual({ type: 'largest-contentful-paint', buffered: true }); queueMicrotask(() => this.cb({ getEntries: () => [{ startTime: 800 }, { startTime: 2100 }] })); }
      takeRecords() { return []; }
    }
    vi.stubGlobal('PerformanceObserver', FakeObserver);
    expect(await collectPageMeasures()).toEqual({ net: '1', local: '2-5', lcp: 'le2.5s' });
  });

  it('leaves out what the browser does not support, never guessing', async () => {
    vi.stubGlobal('performance', {});
    vi.stubGlobal('PerformanceObserver', undefined);
    expect(await collectPageMeasures()).toEqual({});
  });

  it('leaves lcp out, without waiting, when the browser does not list the largest-contentful-paint entry type', async () => {
    stubPerformance([{ t: 'navigation', ...resource(500, 500) }]);
    vi.stubGlobal('PerformanceObserver', class { static supportedEntryTypes = ['event']; observe() { throw new TypeError('unsupported'); } takeRecords() { return []; } });
    expect(await collectPageMeasures()).toEqual({ net: '1', local: '0' });
  });
});
