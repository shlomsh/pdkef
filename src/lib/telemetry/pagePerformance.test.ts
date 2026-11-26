// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyRequests,
  collectPageMeasures,
  countBucket,
  latestStartTime,
  pageMeasures,
  pageSettled,
  resetPagePerformanceForTests,
  timeBucket,
} from './pagePerformance.ts';
import { drainPromises } from '../../test/support/drainPromises.ts';
import { finishLoading, startLoading } from './loadingPage.test-helper.ts';

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
  // The answer without waiting for anything else to happen.
  const now = (settled: ReturnType<typeof pageSettled>) => Promise.race([settled, drainPromises().then(() => 'waiting')]);
  const hide = () => {
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: jsdom never hides a page
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  };
  // oxlint-disable-next-line landmines/no-test-doubles -- Forced: undoes hide, putting back jsdom's own visibilityState
  const show = () => Reflect.deleteProperty(document, 'visibilityState');

  afterEach(async () => {
    show();
    await finishLoading();
  });

  it('is loaded at once when the document is complete', async () => {
    expect(document.readyState).toBe('complete');
    expect(await now(pageSettled())).toBe('loaded');
  });

  it('waits for the load event, then says loaded', async () => {
    startLoading();
    const settled = pageSettled();
    await finishLoading();
    expect(await now(settled)).toBe('loaded');
  });

  it('says hidden when the page is hidden before load, by pagehide or by visibilitychange', async () => {
    for (const [type, target] of [['pagehide', window], ['visibilitychange', document]] as const) {
      startLoading();
      const settled = pageSettled();
      hide();
      target.dispatchEvent(new Event(type));
      await finishLoading();
      expect(await now(settled)).toBe('hidden');
      show();
    }
  });

  it('does not call a visibilitychange to visible hidden', async () => {
    startLoading();
    const settled = pageSettled();
    document.dispatchEvent(new Event('visibilitychange'));
    await finishLoading();
    expect(await now(settled)).toBe('loaded');
  });

  it('settles once: the other order and every listener are gone after the first', async () => {
    startLoading();
    const added = [vi.spyOn(window, 'addEventListener'), vi.spyOn(document, 'addEventListener')];
    const removed = [vi.spyOn(window, 'removeEventListener'), vi.spyOn(document, 'removeEventListener')];
    const pairs = (spies: typeof added) => spies.map((spy) => spy.mock.calls.map(([type, listener]) => [type, listener]));
    const settled = pageSettled();
    const during = pairs(added);
    expect(during.flat().map(([type]) => type)).toEqual(['load', 'pagehide', 'visibilitychange']);
    window.dispatchEvent(new Event('pagehide'));
    expect(pairs(removed)).toEqual(during);
    await finishLoading();
    expect(await now(settled)).toBe('hidden');
  });

  it('says hidden at once for a page already hidden and still loading', async () => {
    startLoading();
    hide();
    expect(await now(pageSettled())).toBe('hidden');
  });
});

describe('pageMeasures', () => {
  const resource = (transferSize: number, decodedBodySize: number) => ({ transferSize, decodedBodySize }) as PerformanceResourceTiming;

  it('counts navigation and resource entries together, and takes the latest LCP', () => {
    const entries = [resource(0, 4000), resource(0, 90000), resource(1200, 1200)];
    expect(pageMeasures(entries, latestStartTime([{ startTime: 800 }, { startTime: 2100 }]))).toEqual({ net: '1', local: '2-5', lcp: 'le2.5s' });
  });

  it('keeps the earlier LCP when a later read lists no entry', () => {
    expect(latestStartTime([], 3000)).toBe(3000);
    expect(latestStartTime([{ startTime: 10 }], 3000)).toBe(10);
  });

  it('leaves out what the browser does not support, never guessing', async () => {
    expect(pageMeasures(undefined, undefined)).toEqual({});
    // A test page lists no entries and no paint, as a browser without them would.
    expect(await collectPageMeasures()).toEqual({});
  });

  it('leaves lcp out, without waiting, when the browser does not list the largest-contentful-paint entry type', async () => {
    expect(pageMeasures([resource(500, 500)], undefined)).toEqual({ net: '1', local: '0' });
    expect(PerformanceObserver.supportedEntryTypes).not.toContain('largest-contentful-paint');
    expect(await collectPageMeasures()).toEqual({});
  });
});
