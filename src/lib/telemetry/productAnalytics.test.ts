import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markArrival } from '../handoff/fileArrival.ts';
import * as pagePerformance from './pagePerformance.ts';
import { setReportingEnabledForTests } from './errorReport.ts';
import {
  MAX_USAGE_EVENTS_PER_PAGE,
  reportEdit,
  reportHomePageView,
  reportToolLifecycleEvent,
  resetUsageEventsForTests,
  type AnalyticsTool,
  type ToolLifecycleEvent,
} from './productAnalytics.ts';

vi.mock('./pagePerformance.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./pagePerformance.ts')>()),
  pageSettled: vi.fn(async () => 'loaded' as const),
  collectPageMeasures: vi.fn(async () => ({})),
}));

let beacon: ReturnType<typeof vi.fn>;
// One page view goes out after the load event and the measures settle, a few microtasks on.
const settleTick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  beacon = vi.fn(() => true);
  Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true, writable: true });
  setReportingEnabledForTests(true);
  resetUsageEventsForTests();
});

afterEach(() => {
  setReportingEnabledForTests(false);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('analytics sink', () => {
  it('sends a page view to /api/report, then to the sink address when one is configured', async () => {
    vi.stubEnv('PUBLIC_ANALYTICS_HOST', 'https://e.example.test');
    vi.stubEnv('PUBLIC_ANALYTICS_KEY', 'k');
    vi.stubGlobal('location', { origin: 'https://pdkef.com', pathname: '/merge/' }); // plain node has none
    reportToolLifecycleEvent('tool_page_viewed', 'merge');
    await settleTick();
    expect(beacon).toHaveBeenCalledTimes(2);
    expect(beacon.mock.calls[0][0]).toBe('/api/report');
    expect(beacon.mock.calls[1][0]).toBe('https://e.example.test/i/v0/e/');
  });
});

describe('reportToolLifecycleEvent', () => {
  it('posts one JSON blob to /api/report', async () => {
    reportToolLifecycleEvent('tool_result_ready', 'merge');
    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, blob] = beacon.mock.calls[0] as [string, Blob];
    expect(url).toBe('/api/report');
    expect(await blob.text()).toBe('{"name":"tool_result_ready","properties":{"tool":"merge","first":true}}');
  });

  it('marks the first event of a kind per tool in a page load with first: true', async () => {
    const bodies = async () => Promise.all(beacon.mock.calls.map(([, blob]) => (blob as Blob).text()));
    reportToolLifecycleEvent('tool_operation_failed', 'redact');
    reportToolLifecycleEvent('tool_operation_failed', 'redact');
    reportToolLifecycleEvent('tool_operation_failed', 'merge');
    reportToolLifecycleEvent('tool_operation_started', 'redact');
    expect(await bodies()).toEqual([
      '{"name":"tool_operation_failed","properties":{"tool":"redact","first":true}}',
      '{"name":"tool_operation_failed","properties":{"tool":"redact"}}',
      '{"name":"tool_operation_failed","properties":{"tool":"merge","first":true}}',
      '{"name":"tool_operation_started","properties":{"tool":"redact","first":true}}',
    ]);
  });

  it('says how the page load started on the first event of a kind only (DEBT-57)', async () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type: 'reload' }] as unknown as PerformanceEntryList);
    reportToolLifecycleEvent('tool_file_accepted', 'redact');
    reportToolLifecycleEvent('tool_file_accepted', 'redact');
    const bodies = await Promise.all(beacon.mock.calls.map(([, blob]) => (blob as Blob).text()));
    expect(bodies).toEqual([
      '{"name":"tool_file_accepted","properties":{"tool":"redact","first":true,"nav":"reload"}}',
      '{"name":"tool_file_accepted","properties":{"tool":"redact"}}',
    ]);
  });

  it('leaves nav out when the browser names no navigation, or one off the list', async () => {
    const spy = vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    reportToolLifecycleEvent('tool_file_accepted', 'redact');
    spy.mockReturnValue([{ type: 'something_new' }] as unknown as PerformanceEntryList);
    reportToolLifecycleEvent('tool_file_accepted', 'merge');
    const bodies = await Promise.all(beacon.mock.calls.map(([, blob]) => (blob as Blob).text()));
    expect(bodies.every((b) => !b.includes('nav'))).toBe(true);
    expect(bodies).toHaveLength(2);
  });

  it('stays first until a beacon is actually handed off', async () => {
    beacon.mockReturnValueOnce(false);
    reportToolLifecycleEvent('tool_result_ready', 'merge');
    reportToolLifecycleEvent('tool_result_ready', 'merge');
    expect(await (beacon.mock.calls[1][1] as Blob).text()).toContain('"first":true');
  });

  it('sends nothing for an unknown tool or event', () => {
    reportToolLifecycleEvent('tool_result_ready', 'nope' as AnalyticsTool);
    reportToolLifecycleEvent('nope' as ToolLifecycleEvent, 'merge');
    expect(beacon).not.toHaveBeenCalled();
  });

  it('sends nothing past the per-page cap', () => {
    for (let i = 0; i < MAX_USAGE_EVENTS_PER_PAGE + 1; i++) reportToolLifecycleEvent('tool_file_accepted', 'split');
    expect(beacon).toHaveBeenCalledTimes(MAX_USAGE_EVENTS_PER_PAGE);
  });

  it('sends nothing when reporting is disabled', () => {
    setReportingEnabledForTests(false);
    reportToolLifecycleEvent('tool_result_ready', 'merge');
    expect(beacon).not.toHaveBeenCalled();
  });

  it('never throws when sendBeacon does', () => {
    beacon.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => reportToolLifecycleEvent('tool_result_ready', 'merge')).not.toThrow();
  });

  it('adds the build commit when the page carries one, and only then', async () => {
    const page = (content: string | null) =>
      vi.stubGlobal('performance', {
        getEntriesByType: () => [{ serverTiming: content === null ? [] : [{ name: 'build', description: content }] }],
      });
    page('08e10cf');
    reportToolLifecycleEvent('tool_result_ready', 'merge');
    expect(JSON.parse(await (beacon.mock.calls[0]![1] as Blob).text()).properties).toEqual({ tool: 'merge', build: '08e10cf', first: true });
    page(null);
    reportToolLifecycleEvent('tool_result_ready', 'merge');
    expect(JSON.parse(await (beacon.mock.calls[1]![1] as Blob).text()).properties).toEqual({ tool: 'merge' });
  });
});

describe('the funnel (DEBT-58)', () => {
  const store = (throws = false) => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => {
        if (throws) throw new Error('blocked');
        return m.get(k) ?? null;
      },
      setItem: (k: string, v: string) => void m.set(k, v),
    };
  };
  // Page views carry `ready` off the real clock; these tests are about visit, so the clock reads nothing.
  beforeEach(() => void vi.spyOn(performance, 'now').mockReturnValue(Number.NaN));
  const props = async () => Promise.all(beacon.mock.calls.map(async ([, b]) => JSON.parse(await (b as Blob).text()).properties));

  it('DEBT-61: the home page view carries the visit, and a tool page opened later that day reads today', async () => {
    vi.stubGlobal('localStorage', store());
    reportHomePageView();
    await settleTick();
    resetUsageEventsForTests(); // the next page load
    reportToolLifecycleEvent('tool_page_viewed', 'sign');
    await settleTick();
    expect(await props()).toEqual([
      { tool: 'home', first: true, visit: 'new', since: 'first' },
      { tool: 'sign', first: true, visit: 'today', since: 'day' },
    ]);
  });

  it('adds visit to the page view and stamps it once per page load', async () => {
    const ls = store();
    vi.stubGlobal('localStorage', ls);
    reportToolLifecycleEvent('tool_page_viewed', 'sign');
    reportToolLifecycleEvent('tool_page_viewed', 'sign');
    await settleTick();
    const [a, b] = await props();
    expect(a).toEqual({ tool: 'sign', first: true, visit: 'new', since: 'first' });
    expect(b.visit).toBe('new');
    expect(b.since).toBe('first');
    expect(ls.getItem('pdkef:last-tool-visit')).not.toBeNull();
  });

  it('omits visit without storage', async () => {
    vi.stubGlobal('localStorage', store(true));
    reportToolLifecycleEvent('tool_page_viewed', 'sign');
    await settleTick();
    expect((await props())[0]).toEqual({ tool: 'sign', first: true });
  });

  it('sends the marked source (and from for a handoff) on tool_file_accepted', async () => {
    markArrival('handoff', 'merge');
    reportToolLifecycleEvent('tool_file_accepted', 'sign');
    markArrival('drop');
    reportToolLifecycleEvent('tool_file_accepted', 'sign');
    reportToolLifecycleEvent('tool_file_accepted', 'sign');
    const [a, b, c] = await props();
    expect(a).toMatchObject({ source: 'handoff', from: 'merge' });
    expect(b).toMatchObject({ source: 'drop' });
    expect(b.from).toBeUndefined();
    expect(c.source).toBeUndefined();
  });

  it('attaches the current arrival source, never from, to later events', async () => {
    markArrival('handoff', 'merge');
    reportToolLifecycleEvent('tool_file_accepted', 'sign');
    for (const e of ['tool_first_edit', 'tool_operation_started', 'tool_result_ready', 'tool_operation_failed'] as const) {
      reportToolLifecycleEvent(e, 'sign');
    }
    const [, ...rest] = await props();
    expect(rest).toHaveLength(4);
    for (const p of rest) {
      expect(p.source).toBe('handoff');
      expect(p.from).toBeUndefined();
    }
  });

  it('puts no source on later events before any file arrived with a mark', async () => {
    reportToolLifecycleEvent('tool_result_ready', 'sign');
    expect((await props())[0].source).toBeUndefined();
  });
});

describe('reportEdit', () => {
  const names = async () => Promise.all(beacon.mock.calls.map(async ([, b]) => JSON.parse(await (b as Blob).text()).name));

  it('an acceptance nobody marked (Merge undoing the removal of its last file) keeps the file it continues', async () => {
    markArrival('pick');
    reportToolLifecycleEvent('tool_file_accepted', 'merge');
    reportEdit('merge');
    reportToolLifecycleEvent('tool_file_accepted', 'merge');
    reportEdit('merge');
    reportToolLifecycleEvent('tool_result_ready', 'merge');
    const sent = await Promise.all(beacon.mock.calls.map(async ([, b]) => JSON.parse(await (b as Blob).text())));
    expect(sent.map((e) => e.name)).toEqual(['tool_file_accepted', 'tool_first_edit', 'tool_file_accepted', 'tool_result_ready']);
    expect(sent[3].properties.source).toBe('pick');
  });

  it('sends nothing before a file was accepted', () => {
    reportEdit('sign');
    expect(beacon).not.toHaveBeenCalled();
  });

  it('sends tool_first_edit once per accepted file', async () => {
    markArrival('pick');
    reportToolLifecycleEvent('tool_file_accepted', 'sign');
    reportEdit('sign');
    reportEdit('sign');
    expect(await names()).toEqual(['tool_file_accepted', 'tool_first_edit']);
    markArrival('replace');
    reportToolLifecycleEvent('tool_file_accepted', 'sign');
    reportEdit('sign');
    reportEdit('sign');
    expect(await names()).toEqual(['tool_file_accepted', 'tool_first_edit', 'tool_file_accepted', 'tool_first_edit']);
  });
});

describe('performance measures (MEM-45)', () => {
  const sent = async () => Promise.all(beacon.mock.calls.map(async ([, b]) => JSON.parse(await (b as Blob).text())));
  const clock = (ms: number) => vi.spyOn(performance, 'now').mockReturnValue(ms);

  it('a tool page view waits for the window load, then sends once with the measures and ready', async () => {
    let load!: () => void;
    vi.mocked(pagePerformance.pageSettled).mockReturnValueOnce(new Promise<'loaded'>((resolve) => (load = () => resolve('loaded'))));
    vi.mocked(pagePerformance.collectPageMeasures).mockResolvedValueOnce({ net: '0', local: '16-30', lcp: 'le2.5s' });
    clock(1800);
    reportToolLifecycleEvent('tool_page_viewed', 'sign');
    await settleTick();
    expect(beacon).not.toHaveBeenCalled();
    clock(9000); // ready was taken at the call, not at the send
    load();
    await settleTick();
    expect(beacon).toHaveBeenCalledTimes(1);
    expect((await sent())[0].properties).toEqual({ tool: 'sign', first: true, net: '0', local: '16-30', lcp: 'le2.5s', ready: 'le2.5s' });
  });

  it('the home page view carries net, local and lcp and never ready', async () => {
    vi.mocked(pagePerformance.collectPageMeasures).mockResolvedValueOnce({ net: '2-5', local: '6-15', lcp: 'le1s' });
    clock(500);
    reportHomePageView();
    await settleTick();
    expect((await sent())[0].properties).toEqual({ tool: 'home', first: true, net: '2-5', local: '6-15', lcp: 'le1s' });
  });

  it('leaves out what the browser could not measure', async () => {
    clock(Number.NaN);
    reportToolLifecycleEvent('tool_page_viewed', 'merge');
    await settleTick();
    expect((await sent())[0].properties).toEqual({ tool: 'merge', first: true });
  });

  it('tool_file_accepted carries the time since the arrival was marked', async () => {
    clock(10_000);
    markArrival('pick');
    clock(12_100);
    reportToolLifecycleEvent('tool_file_accepted', 'sign');
    expect((await sent())[0].properties).toMatchObject({ source: 'pick', ms: 'le2.5s' });
    expect((await sent())[0].properties).not.toHaveProperty('at');
  });

  it('an acceptance nobody marked has no ms', async () => {
    reportToolLifecycleEvent('tool_file_accepted', 'sign');
    expect((await sent())[0].properties).not.toHaveProperty('ms');
  });

  it('tool_result_ready carries the time since tool_operation_started, once', async () => {
    clock(1000);
    reportToolLifecycleEvent('tool_operation_started', 'compress');
    clock(6200);
    reportToolLifecycleEvent('tool_result_ready', 'compress');
    reportToolLifecycleEvent('tool_result_ready', 'compress');
    const [started, ready, again] = await sent();
    expect(started.properties).not.toHaveProperty('ms');
    expect(ready.properties.ms).toBe('gt4s');
    expect(again.properties).not.toHaveProperty('ms');
  });

  it('a page hidden before load sends the view at once with ready and no measures, and only once', async () => {
    let settle!: (how: 'loaded' | 'hidden') => void;
    vi.mocked(pagePerformance.pageSettled).mockReturnValueOnce(new Promise((resolve) => (settle = resolve)));
    vi.mocked(pagePerformance.collectPageMeasures).mockClear();
    clock(900);
    reportToolLifecycleEvent('tool_page_viewed', 'sign');
    settle('hidden');
    settle('loaded'); // a late load changes nothing
    await settleTick();
    expect(beacon).toHaveBeenCalledTimes(1);
    expect((await sent())[0].properties).toEqual({ tool: 'sign', first: true, ready: 'le1s' });
    expect(pagePerformance.collectPageMeasures).not.toHaveBeenCalled();
  });

  it('a hidden home view sends with no measures at all', async () => {
    vi.mocked(pagePerformance.pageSettled).mockResolvedValueOnce('hidden');
    reportHomePageView();
    await settleTick();
    expect((await sent())[0].properties).toEqual({ tool: 'home', first: true });
  });

  it('a back-to-back started and ready marked untimed carry no ms, and leave an earlier timing alone', async () => {
    clock(1000);
    reportToolLifecycleEvent('tool_operation_started', 'sign', { untimed: true });
    clock(1001);
    reportToolLifecycleEvent('tool_result_ready', 'sign', { untimed: true });
    reportToolLifecycleEvent('tool_result_ready', 'sign');
    const bodies = await sent();
    for (const b of bodies) expect(b.properties).not.toHaveProperty('ms');
  });

  it('ms on tool_file_accepted only for a fresh pick, drop, paste or replace', async () => {
    for (const source of ['pick', 'drop', 'paste', 'replace'] as const) {
      clock(1000);
      markArrival(source);
      clock(1500);
      reportToolLifecycleEvent('tool_file_accepted', 'sign');
    }
    for (const source of ['restore', 'recent', 'camera'] as const) {
      clock(1000);
      markArrival(source);
      clock(1500);
      reportToolLifecycleEvent('tool_file_accepted', 'sign');
    }
    clock(1000);
    markArrival('handoff', 'merge');
    clock(1500);
    reportToolLifecycleEvent('tool_file_accepted', 'sign');
    const withMs = (await sent()).map((e) => 'ms' in e.properties);
    expect(withMs).toEqual([true, true, true, true, false, false, false, false]);
  });

  it('a mark older than 60 s leaves no ms: a rejected file does not lend its time to a later acceptance', async () => {
    clock(1000);
    markArrival('pick');
    clock(1000 + 60_000);
    reportToolLifecycleEvent('tool_file_accepted', 'sign');
    markArrival('pick');
    clock(1000 + 60_001 + 60_001);
    reportToolLifecycleEvent('tool_file_accepted', 'sign');
    const [fresh, stale] = await sent();
    expect(fresh.properties.ms).toBe('gt4s');
    expect(stale.properties).not.toHaveProperty('ms');
  });
});
