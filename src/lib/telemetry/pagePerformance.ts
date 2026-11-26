/**
 * MEM-45: what a real visitor's page load cost, measured by the browser and reduced to buckets here,
 * so the usage ping can carry it with no extra request. Pure bucketing and classifying, plus one thin
 * collector over Resource Timing and the `largest-contentful-paint` observer. A measure the browser
 * does not support is left out, never guessed. No URL, name, size or raw time leaves this module.
 */
import { COUNT_BUCKETS, NAVIGATION_TYPES, TIME_BUCKETS, type CountBucket, type NavigationType, type TimeBucket } from './usageEventSchema';

/**
 * `0`, `1`, `2-5`, `6-15`, `16-30`, `31-50`, `51+`; undefined for anything that is not a whole count.
 * @testSeam
 */
export function countBucket(n: number): CountBucket | undefined {
  if (!Number.isInteger(n) || n < 0) return undefined;
  const upper = [0, 1, 5, 15, 30, 50];
  const at = upper.findIndex((max) => n <= max);
  return COUNT_BUCKETS[at === -1 ? upper.length : at];
}

/** `le1s`, `le2.5s`, `le4s`, `gt4s`; undefined for anything that is not a time. */
export function timeBucket(ms: number | undefined): TimeBucket | undefined {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return undefined;
  const upper = [1000, 2500, 4000];
  const at = upper.findIndex((max) => ms <= max);
  return TIME_BUCKETS[at === -1 ? upper.length : at];
}

/**
 * How this page load started, off the browser's navigation timing entries (DEBT-57), and only on the
 * first event of a kind; undefined when it is not the first, or the entry names none on the list.
 */
export function navigationType(entries: readonly PerformanceEntry[], first: boolean): NavigationType | undefined {
  if (!first) return undefined;

  const type = (entries[0] as PerformanceNavigationTiming | undefined)?.type;
  return (NAVIGATION_TYPES as readonly string[]).includes(type as string) ? (type as NavigationType) : undefined;
}

const BUILD_COMMIT = /^[0-9a-f]{7}$/;

/**
 * The 7-character commit the page was built from (MEM-19), off the `build` entry of the navigation entry's
 * `Server-Timing` list (set by middleware.ts), or undefined when it is missing or malformed.
 */
export function parseBuildCommit(entries: readonly PerformanceEntry[]): string | undefined {
  const description = (entries[0] as PerformanceNavigationTiming | undefined)?.serverTiming?.find((entry) => entry.name === 'build')?.description;
  return typeof description === 'string' && BUILD_COMMIT.test(description) ? description : undefined;
}

/**
 * Requests that reached the network (`transferSize > 0`, a revalidation included) against those answered
 * on the device (no transfer, but a body or a `cache` delivery: the worker's cache or the browser's).
 * An entry with neither, such as a cross-origin one the browser hides the timing of, is ignored.
 * Undefined when the browser listed no entries at all.
 * @testSeam
 */
export function classifyRequests(entries: readonly PerformanceResourceTiming[]): { net: number; local: number } | undefined {
  if (entries.length === 0) return undefined;
  let net = 0;
  let local = 0;
  for (const e of entries) {
    if (e.transferSize > 0) net += 1;
    else if (e.decodedBodySize > 0 || (e as { deliveryType?: string }).deliveryType === 'cache') local += 1;
  }
  return { net, local };
}

/**
 * How the page's own load ended: `loaded` when the window `load` event fired (or already had), `hidden`
 * when the page was hidden first (`pagehide`, or `visibilitychange` to hidden), so a view is never lost
 * to a load that does not come. Settles once; every listener is removed with it.
 */
export function pageSettled(): Promise<'loaded' | 'hidden'> {
  if (typeof document === 'undefined' || document.readyState === 'complete') return Promise.resolve('loaded');
  if (document.visibilityState === 'hidden') return Promise.resolve('hidden');
  return new Promise((resolve) => {
    const done = (how: 'loaded' | 'hidden') => {
      window.removeEventListener('load', onLoad);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      resolve(how);
    };
    const onLoad = () => done('loaded');
    const onHide = () => done('hidden');
    const onVisibility = () => { if (document.visibilityState === 'hidden') done('hidden'); };
    window.addEventListener('load', onLoad);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
  });
}

let lcp: number | undefined;
let observer: PerformanceObserver | null | undefined;
let firstEntry: Promise<void> = Promise.resolve();
// The buffered entries arrive in a task after observe(); a page without any must not wait for them.
const LCP_WAIT_MS = 100;

function startLcpObserver(): void {
  if (observer !== undefined) return;
  observer = null;
  try {
    // A browser that does not list the entry type would only make the page wait out the timeout.
    if (!PerformanceObserver.supportedEntryTypes?.includes('largest-contentful-paint')) return;
    let arrived!: () => void;
    firstEntry = new Promise((resolve) => (arrived = resolve));
    const o = new PerformanceObserver((list) => {
      lcp = latestStartTime(list.getEntries(), lcp);
      arrived();
    });
    o.observe({ type: 'largest-contentful-paint', buffered: true });
    observer = o;
  } catch {
    // expected: a browser without the entry type or the observer leaves lcp out
  }
}

/** The latest largest-contentful-paint time so far, in ms; undefined when the browser reports none. */
async function readLcp(): Promise<number | undefined> {
  startLcpObserver();
  if (!observer) return undefined;
  await Promise.race([firstEntry, new Promise((resolve) => setTimeout(resolve, LCP_WAIT_MS))]);
  lcp = latestStartTime(observer.takeRecords(), lcp);
  return lcp;
}

type PageMeasures = { net?: CountBucket; local?: CountBucket; lcp?: TimeBucket };

/**
 * The latest paint entry's start time, or `previous` when the list holds none.
 * @testSeam
 */
export function latestStartTime(entries: readonly { startTime: number }[], previous?: number): number | undefined {
  return entries.length === 0 ? previous : entries[entries.length - 1].startTime;
}

/**
 * The measures as buckets, from the navigation and resource entries and the latest LCP time; each key is
 * absent when its source is unsupported (undefined entries, undefined time).
 * @testSeam
 */
export function pageMeasures(entries: readonly PerformanceResourceTiming[] | undefined, lcpMs: number | undefined): PageMeasures {
  const out: PageMeasures = {};
  const counts = entries && classifyRequests(entries);
  if (counts) {
    out.net = countBucket(counts.net);
    out.local = countBucket(counts.local);
  }
  const bucket = timeBucket(lcpMs);
  if (bucket) out.lcp = bucket;
  return out;
}

/** The properties of a page view: its measures, and `ready` (a time bucket) for a tool page that gave the time it mounted. */
export function pageViewMeasures(measures: PageMeasures, tool: string, mountedAt?: number): PageMeasures & { ready?: TimeBucket } {
  const ready = tool === 'home' ? undefined : timeBucket(mountedAt);
  return { ...measures, ...(ready ? { ready } : {}) };
}

/** The measures of this page's own load, as buckets; each key is absent when its source is unsupported. */
export async function collectPageMeasures(): Promise<PageMeasures> {
  let entries: PerformanceResourceTiming[] | undefined;
  try {
    entries = [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')] as PerformanceResourceTiming[];
  } catch {
    // expected: no Resource Timing leaves net and local out
  }
  let lcpMs: number | undefined;
  try {
    lcpMs = await readLcp();
  } catch {
    // expected: an observer that fails mid-read leaves lcp out of the view
  }
  return pageMeasures(entries, lcpMs);
}

/** @testSeam */
export function resetPagePerformanceForTests(): void {
  lcp = undefined;
  observer = undefined;
  firstEntry = Promise.resolve();
}
