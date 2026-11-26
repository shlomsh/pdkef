// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://pdkef.com/merge/" }
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_BUCKETS } from './usageEventSchema';
import { drainPromises } from '../../test/support/drainPromises.ts';
import { installBeaconRecorder, type BeaconRecorder } from '../../test/support/beaconRecorder.ts';
import { markArrival } from '../handoff/fileArrival.ts';
import { finishLoading, startLoading } from './loadingPage.test-helper.ts';
import { sendToSink } from './analyticsSink.ts';
import * as pagePerformance from './pagePerformance.ts';
const { navigationType, pageViewMeasures, parseBuildCommit } = pagePerformance;
import { setReportingEnabledForTests } from './errorReport.ts';
import { watchWorkerDownloads } from './workerDownloads.ts';
import {
  MAX_USAGE_EVENTS_PER_PAGE,
  reportEdit,
  reportHandedOn,
  reportHomePageView,
  reportResult,
  reportToolLifecycleEvent,
  resetUsageEventsForTests,
  type AnalyticsTool,
  type ToolLifecycleEvent,
} from './productAnalytics.ts';

vi.mock('./pagePerformance.ts', { spy: true });

vi.mock('./workerDownloads.ts', { spy: true });

vi.mock('./analyticsSink.ts', { spy: true });

let rec: BeaconRecorder;
// A browser that takes the beacons from here on; the earlier recorder is put back first.
function freshBeacon(options?: { returns?: boolean }) {
  rec.restore();
  rec = installBeaconRecorder(options);
}
const texts = () => Promise.all(rec.calls.map((c) => c.blob.text()));
const sentEvents = async () => (await rec.bodies()) as { name: string; properties: Record<string, any> }[];
// One page view goes out after the load event and the measures settle, a few microtasks on.
const settleTick = () => drainPromises();

beforeEach(() => {
  localStorage.clear();
  rec = installBeaconRecorder();
  setReportingEnabledForTests(true);
  resetUsageEventsForTests();
  vi.mocked(sendToSink).mockClear();
});

afterEach(async () => {
  rec.restore();
  await finishLoading();
  setReportingEnabledForTests(false);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('analytics sink', () => {
  it('sends a page view to /api/report, then to the sink address when one is configured', async () => {
    vi.stubEnv('PUBLIC_ANALYTICS_HOST', 'https://e.example.test');
    vi.stubEnv('PUBLIC_ANALYTICS_KEY', 'k');
    reportToolLifecycleEvent('tool_page_viewed', 'merge');
    await settleTick();
    expect(rec.calls).toHaveLength(2);
    expect(rec.urls()[0]).toBe('/api/report');
    expect(rec.urls()[1]).toBe('https://e.example.test/i/v0/e/');
  });
});

describe('analytics sink follows the first beacon', () => {
  const SINK = 'https://e.example.test/i/v0/e/';
  beforeEach(() => {
    vi.stubEnv('PUBLIC_ANALYTICS_HOST', 'https://e.example.test');
    vi.stubEnv('PUBLIC_ANALYTICS_KEY', 'k');
  });

  it('makes no second call when the first beacon is refused', () => {
    freshBeacon({ returns: false });
    reportToolLifecycleEvent('tool_result_ready', 'merge');
    expect(rec.calls).toHaveLength(1);
  });

  it('sends nothing to the sink past the per-page cap', () => {
    for (let i = 0; i < MAX_USAGE_EVENTS_PER_PAGE + 3; i++) reportToolLifecycleEvent('tool_file_accepted', 'split');
    const urls = rec.urls();
    expect(urls.filter((u) => u === SINK)).toHaveLength(MAX_USAGE_EVENTS_PER_PAGE);
    expect(urls.filter((u) => u === '/api/report')).toHaveLength(MAX_USAGE_EVENTS_PER_PAGE);
  });
});

describe('reportToolLifecycleEvent', () => {
  it('posts one JSON blob to /api/report', async () => {
    reportToolLifecycleEvent('tool_result_ready', 'merge');
    expect(rec.calls).toHaveLength(1);
    const { url, blob } = rec.calls[0];
    expect(url).toBe('/api/report');
    expect(await blob.text()).toBe('{"name":"tool_result_ready","properties":{"tool":"merge","first":true}}');
  });

  it('marks the first event of a kind per tool in a page load with first: true', async () => {
    const bodies = texts;
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
    const reload = [{ type: 'reload' }] as unknown as PerformanceEntryList;
    expect(navigationType(reload, true)).toBe('reload');
    expect(navigationType(reload, false)).toBeUndefined();
    // A test page has no navigation entry, so the shell sends the first event and the next without nav.
    reportToolLifecycleEvent('tool_file_accepted', 'redact');
    reportToolLifecycleEvent('tool_file_accepted', 'redact');
    const bodies = await texts();
    expect(bodies).toEqual([
      '{"name":"tool_file_accepted","properties":{"tool":"redact","first":true}}',
      '{"name":"tool_file_accepted","properties":{"tool":"redact"}}',
    ]);
  });

  it('leaves nav out when the browser names no navigation, or one off the list', async () => {
    expect(navigationType([], true)).toBeUndefined();
    expect(navigationType([{ type: 'something_new' }] as unknown as PerformanceEntryList, true)).toBeUndefined();
    reportToolLifecycleEvent('tool_file_accepted', 'redact');
    reportToolLifecycleEvent('tool_file_accepted', 'merge');
    const bodies = await texts();
    expect(bodies.every((b) => !b.includes('nav'))).toBe(true);
    expect(bodies).toHaveLength(2);
  });

  it('stays first until a beacon is actually handed off', async () => {
    freshBeacon({ returns: false });
    reportToolLifecycleEvent('tool_result_ready', 'merge');
    expect(rec.calls).toHaveLength(1);
    freshBeacon();
    reportToolLifecycleEvent('tool_result_ready', 'merge');
    expect(await rec.calls[0].blob.text()).toContain('"first":true');
  });

  it('sends nothing for an unknown tool or event', () => {
    reportToolLifecycleEvent('tool_result_ready', 'nope' as AnalyticsTool);
    reportToolLifecycleEvent('nope' as ToolLifecycleEvent, 'merge');
    expect(rec.calls).toHaveLength(0);
  });

  it('sends nothing past the per-page cap', () => {
    for (let i = 0; i < MAX_USAGE_EVENTS_PER_PAGE + 1; i++) reportToolLifecycleEvent('tool_file_accepted', 'split');
    expect(rec.calls).toHaveLength(MAX_USAGE_EVENTS_PER_PAGE);
  });

  it('sends nothing when reporting is disabled', () => {
    setReportingEnabledForTests(false);
    reportToolLifecycleEvent('tool_result_ready', 'merge');
    expect(rec.calls).toHaveLength(0);
  });

  it('never throws when sendBeacon does', () => {
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: a sendBeacon that throws cannot be produced on cue
    vi.spyOn(navigator, 'sendBeacon').mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => reportToolLifecycleEvent('tool_result_ready', 'merge')).not.toThrow();
  });

  it('adds the build commit when the page carries one, and only then', async () => {
    const page = (content: string | null) =>
      [{ serverTiming: content === null ? [] : [{ name: 'build', description: content }] }] as unknown as PerformanceEntryList;
    expect(parseBuildCommit(page('08e10cf'))).toBe('08e10cf');
    expect(parseBuildCommit(page('not-a-sha'))).toBeUndefined();
    expect(parseBuildCommit(page(null))).toBeUndefined();
    expect(parseBuildCommit([])).toBeUndefined();
    // A test page carries no Server-Timing header, so the shell sends no build.
    reportToolLifecycleEvent('tool_result_ready', 'merge');
    expect(JSON.parse(await rec.calls[0].blob.text()).properties).toEqual({ tool: 'merge', first: true });
  });
});

describe('the funnel (DEBT-58)', () => {
  // A fixed day after the tools list started, so these tests do not depend on today's date.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-20T12:00:00'));
  });
  afterEach(() => void vi.useRealTimers());
  // Page views carry `ready` off the real clock: only a page view may carry it, and only as a time bucket. Then it is set aside,
  // since these tests are about visit.
  const props = async () => (await sentEvents()).map(({ name, properties: { ready, ...rest } }) => {
    if (ready !== undefined) {
      expect(name).toBe('tool_page_viewed');
      expect(TIME_BUCKETS).toContain(ready);
    }
    return rest;
  });
  // What went to the analytics address, which alone carries the tools-opened values.
  const sinkProps = () => vi.mocked(sendToSink).mock.calls.map(([e]) => (e as { properties: Record<string, unknown> }).properties);

  it('DEBT-61: the home page view carries the visit, and a tool page opened later that day reads today', async () => {
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
    reportToolLifecycleEvent('tool_page_viewed', 'sign');
    reportToolLifecycleEvent('tool_page_viewed', 'sign');
    await settleTick();
    const [a, b] = await props();
    expect(a).toEqual({ tool: 'sign', first: true, visit: 'new', since: 'first' });
    expect(sinkProps()[0]).toMatchObject({ tools: '1', newtool: true, firsttool: 'sign' });
    expect(b.visit).toBe('new');
    expect(b.since).toBe('first');
    expect(localStorage.getItem('pdkef:last-tool-visit')).not.toBeNull();
  });

  describe('the tools this browser has opened (MEM-45)', () => {
    const load = async (tool: AnalyticsTool | 'home') => {
      resetUsageEventsForTests(); // a new page load
      if (tool === 'home') reportHomePageView();
      else reportToolLifecycleEvent('tool_page_viewed', tool);
      await settleTick();
      const all = sinkProps();
      return all[all.length - 1];
    };
    const history = (p: Record<string, unknown>) => ({ tools: p.tools, newtool: p.newtool, firsttool: p.firsttool });
    const none = { tools: undefined, newtool: undefined, firsttool: undefined };

    it('counts a fresh browser, then a second tool, then a repeat', async () => {
      expect(history(await load('sign'))).toEqual({ tools: '1', newtool: true, firsttool: 'sign' });
      expect(history(await load('merge'))).toEqual({ tools: '2', newtool: true, firsttool: 'sign' });
      expect(history(await load('merge'))).toEqual({ tools: '2', newtool: undefined, firsttool: 'sign' });
    });
    it('sends nothing for a returning browser that has no list, now or later', async () => {
      localStorage.setItem('pdkef:last-tool-visit', '2020-01-01');
      expect(history(await load('sign'))).toEqual(none);
      expect(history(await load('merge'))).toEqual(none);
    });
    it('does not stamp the list when the beacon refuses the view', async () => {
      freshBeacon({ returns: false });
      await load('sign');
      expect(rec.calls.length).toBeGreaterThan(0);
      expect(localStorage.getItem('pdkef:tools-opened')).toBeNull();
      freshBeacon();
      expect(history(await load('sign'))).toEqual({ tools: '1', newtool: true, firsttool: 'sign' });
    });
    it('starts the list for a new browser that saw the home page first', async () => {
      await load('home');
      expect(history(await load('redact'))).toEqual({ tools: '1', newtool: true, firsttool: 'redact' });
    });
    it('starts the list for a browser that saw the home page on an earlier day', async () => {
      localStorage.setItem('pdkef:first-visit', '2026-11-18');
      localStorage.setItem('pdkef:last-tool-visit', '2026-11-18');
      expect(history(await load('redact'))).toEqual({ tools: '1', newtool: true, firsttool: 'redact' });
    });
    it('sends newtool once when the same page reports its view twice', async () => {
      resetUsageEventsForTests();
      reportToolLifecycleEvent('tool_page_viewed', 'sign');
      await settleTick();
      reportToolLifecycleEvent('tool_page_viewed', 'sign');
      await settleTick();
      const [a, b] = sinkProps();
      expect(history(a)).toEqual({ tools: '1', newtool: true, firsttool: 'sign' });
      expect(history(b)).toEqual({ tools: '1', newtool: undefined, firsttool: 'sign' });
    });
    it('sends the tools-opened values only to the analytics address, never in the /api/report beacon', async () => {
      const sent = await load('sign');
      expect(history(sent)).toEqual({ tools: '1', newtool: true, firsttool: 'sign' });
      const [beaconed] = await props();
      expect(history(beaconed)).toEqual(none);
      expect(beaconed.visit).toBe('new');
    });
    it('puts nothing on the home page view', async () => {
      expect(history(await load('home'))).toEqual(none);
    });
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
  const names = async () => (await sentEvents()).map((e) => e.name);

  it('an acceptance nobody marked (Merge undoing the removal of its last file) keeps the file it continues', async () => {
    markArrival('pick');
    reportToolLifecycleEvent('tool_file_accepted', 'merge');
    reportEdit('merge');
    reportToolLifecycleEvent('tool_file_accepted', 'merge');
    reportEdit('merge');
    reportToolLifecycleEvent('tool_result_ready', 'merge');
    const sent = await sentEvents();
    expect(sent.map((e) => e.name)).toEqual(['tool_file_accepted', 'tool_first_edit', 'tool_file_accepted', 'tool_result_ready']);
    expect(sent[3].properties.source).toBe('pick');
  });

  it('sends nothing before a file was accepted', () => {
    reportEdit('sign');
    expect(rec.calls).toHaveLength(0);
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
  const sent = sentEvents;
  beforeEach(() => void vi.useFakeTimers({ toFake: ['performance'] }));
  afterEach(() => void vi.useRealTimers());
  const clock = (ms: number) => void vi.advanceTimersByTime(ms - performance.now());

  it('a tool page view waits for the window load, then sends once with the measures and ready', async () => {
    startLoading();
    vi.mocked(pagePerformance.collectPageMeasures).mockClear();
    const measures = { net: '0', local: '16-30', lcp: 'le2.5s' } as const;
    expect(pageViewMeasures(measures, 'sign', 1800)).toEqual({ ...measures, ready: 'le2.5s' });
    clock(1800);
    reportToolLifecycleEvent('tool_page_viewed', 'sign');
    await settleTick();
    expect(rec.calls).toHaveLength(0);
    clock(9000); // ready was taken at the call, not at the send
    await finishLoading();
    await settleTick();
    expect(rec.calls).toHaveLength(1);
    expect(pagePerformance.collectPageMeasures).toHaveBeenCalledTimes(1);
    // A test page lists no requests and no paint, so the shell sends ready alone.
    expect((await sent())[0].properties).toEqual({ tool: 'sign', first: true, visit: 'new', since: 'first', ready: 'le2.5s' });
  });

  it('the sent bodies carry nav and the build commit off the navigation entry, and net, local and lcp off the page load', async () => {
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: jsdom's performance has no navigation, resource or paint entries
    vi.spyOn(performance, 'getEntriesByType').mockImplementation((type: string) =>
      (type === 'navigation'
        ? [{ type: 'reload', transferSize: 0, decodedBodySize: 4000, serverTiming: [{ name: 'build', description: '08e10cf' }] }]
        : type === 'resource'
          ? [{ transferSize: 0, decodedBodySize: 90000 }, { transferSize: 1200, decodedBodySize: 1200 }]
          : []) as unknown as PerformanceEntryList);
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: jsdom's performance has no navigation, resource or paint entries
    vi.stubGlobal('PerformanceObserver', class {
      static supportedEntryTypes = ['largest-contentful-paint'];
      constructor(private cb: (l: { getEntries: () => { startTime: number }[] }) => void) {}
      observe() { queueMicrotask(() => this.cb({ getEntries: () => [{ startTime: 800 }, { startTime: 2100 }] })); }
      takeRecords() { return []; }
    });
    pagePerformance.resetPagePerformanceForTests(); // the observer is made once per page load
    reportToolLifecycleEvent('tool_result_ready', 'merge');
    reportToolLifecycleEvent('tool_page_viewed', 'merge');
    await settleTick();
    pagePerformance.resetPagePerformanceForTests();
    const [result, view] = await sent();
    expect(result.properties).toMatchObject({ tool: 'merge', build: '08e10cf', first: true, nav: 'reload' });
    expect(view.properties).toMatchObject({ build: '08e10cf', nav: 'reload', net: '1', local: '2-5', lcp: 'le2.5s' });
  });

  it('the home page view carries net, local and lcp and never ready', async () => {
    const measures = { net: '2-5', local: '6-15', lcp: 'le1s' } as const;
    expect(pageViewMeasures(measures, 'home')).toEqual(measures);
    expect(pageViewMeasures(measures, 'home', 500)).toEqual(measures);
    clock(500);
    reportHomePageView();
    await settleTick();
    expect((await sent())[0].properties).toEqual({ tool: 'home', first: true, visit: 'new', since: 'first' });
  });

  it('leaves out what the browser could not measure', async () => {
    expect(pageViewMeasures({}, 'merge', Number.NaN)).toEqual({});
    expect(pageViewMeasures({}, 'merge', undefined)).toEqual({});
    reportToolLifecycleEvent('tool_page_viewed', 'merge');
    await settleTick();
    expect((await sent())[0].properties).toEqual({ tool: 'merge', first: true, visit: 'new', since: 'first', ready: 'le1s' });
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
    startLoading();
    vi.mocked(pagePerformance.collectPageMeasures).mockClear();
    clock(900);
    reportToolLifecycleEvent('tool_page_viewed', 'sign');
    window.dispatchEvent(new Event('pagehide'));
    await finishLoading(); // a late load changes nothing
    await settleTick();
    expect(rec.calls).toHaveLength(1);
    expect((await sent())[0].properties).toEqual({ tool: 'sign', first: true, visit: 'new', since: 'first', ready: 'le1s' });
    expect(pagePerformance.collectPageMeasures).not.toHaveBeenCalled();
  });

  it('a hidden home view sends with no measures at all', async () => {
    startLoading();
    reportHomePageView();
    window.dispatchEvent(new Event('pagehide'));
    await settleTick();
    expect((await sent())[0].properties).toEqual({ tool: 'home', first: true, visit: 'new', since: 'first' });
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
      markArrival(source);
      vi.advanceTimersByTime(500);
      reportToolLifecycleEvent('tool_file_accepted', 'sign');
    }
    for (const source of ['restore', 'recent', 'camera'] as const) {
      markArrival(source);
      vi.advanceTimersByTime(500);
      reportToolLifecycleEvent('tool_file_accepted', 'sign');
    }
    markArrival('handoff', 'merge');
    vi.advanceTimersByTime(500);
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

describe('the page view timestamp', () => {
  it('is taken when the page asked for the view, not when it was sent', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      startLoading();
      vi.mocked(sendToSink).mockClear();
      reportToolLifecycleEvent('tool_page_viewed', 'merge');
      vi.setSystemTime(new Date('2026-01-01T00:00:05.000Z'));
      await finishLoading();
      await settleTick();
      expect(sendToSink).toHaveBeenCalledTimes(1);
      const at = vi.mocked(sendToSink).mock.calls[0][1];
      expect(at?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('is not passed for any other event', () => {
    vi.mocked(sendToSink).mockClear();
    reportToolLifecycleEvent('tool_result_ready', 'merge');
    expect(sendToSink).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendToSink).mock.calls[0][1]).toBeUndefined();
  });
});

describe('reportResult and reportHandedOn', () => {
  const names = async () =>
    (await texts()).map((t) => JSON.parse(t) as { name: string; properties: { ms?: string } });
  const arrive = () => {
    markArrival('pick');
    reportToolLifecycleEvent('tool_file_accepted', 'merge');
    freshBeacon();
  };

  it('sends the started-and-ready pair, untimed, when nothing is open', async () => {
    reportResult('merge');
    const sent = await names();
    expect(sent.map((e) => e.name)).toEqual(['tool_operation_started', 'tool_result_ready']);
    expect(sent.every((e) => e.properties.ms === undefined)).toBe(true);
  });

  it('sends only the ready event after a start', async () => {
    reportToolLifecycleEvent('tool_operation_started', 'merge');
    freshBeacon();
    reportResult('merge');
    expect((await names()).map((e) => e.name)).toEqual(['tool_result_ready']);
  });

  it('hands on nothing when the file already had a result', () => {
    arrive();
    reportToolLifecycleEvent('tool_result_ready', 'merge');
    freshBeacon();
    reportHandedOn('merge');
    expect(rec.calls).toHaveLength(0);
  });

  it('counts a first hand-on as the result, once', async () => {
    arrive();
    reportHandedOn('merge');
    expect((await names()).map((e) => e.name)).toEqual(['tool_operation_started', 'tool_result_ready']);
    freshBeacon();
    reportHandedOn('merge');
    expect(rec.calls).toHaveLength(0);
  });
});

describe('worker downloads (MEM-45)', () => {
  const sunk = () => vi.mocked(sendToSink).mock.calls.map(([e]) => e as { name: string; properties: Record<string, unknown> });
  const onReport = () => vi.mocked(watchWorkerDownloads).mock.calls[0][0];
  beforeEach(() => {
    vi.stubEnv('PUBLIC_ANALYTICS_HOST', 'https://e.example.test');
    vi.stubEnv('PUBLIC_ANALYTICS_KEY', 'k');
    vi.mocked(watchWorkerDownloads).mockClear();
    vi.mocked(sendToSink).mockClear();
  });

  it('starts watching once per page load, after the page view went out', async () => {
    reportToolLifecycleEvent('tool_page_viewed', 'merge');
    expect(watchWorkerDownloads).not.toHaveBeenCalled();
    await settleTick();
    expect(watchWorkerDownloads).toHaveBeenCalledOnce();
    reportToolLifecycleEvent('tool_page_viewed', 'merge');
    await settleTick();
    expect(watchWorkerDownloads).toHaveBeenCalledOnce();
  });

  it('does not ask the worker at all without an analytics address', async () => {
    vi.unstubAllEnvs();
    reportToolLifecycleEvent('tool_page_viewed', 'merge');
    await settleTick();
    expect(watchWorkerDownloads).not.toHaveBeenCalled();
  });

  it('starts on the home page too, and not on other events', async () => {
    reportToolLifecycleEvent('tool_file_accepted', 'merge');
    expect(watchWorkerDownloads).not.toHaveBeenCalled();
    reportHomePageView();
    await settleTick();
    expect(watchWorkerDownloads).toHaveBeenCalledOnce();
  });

  it('sends the report to the analytics address only, with the page tool, never to /api/report', async () => {
    reportToolLifecycleEvent('tool_page_viewed', 'sign');
    await settleTick();
    freshBeacon();
    vi.mocked(sendToSink).mockClear();
    onReport()({ install: '2-5', unmeasured: true });
    expect(sunk()).toEqual([{ name: 'worker_downloads', properties: { tool: 'sign', install: '2-5', unmeasured: true } }]);
    expect(rec.urls().filter((url) => url === '/api/report')).toEqual([]);
    expect(rec.calls).toHaveLength(1);
    expect(rec.urls()[0]).toBe('https://e.example.test/i/v0/e/');
  });

  it('names the home page as the tool', async () => {
    reportHomePageView();
    await settleTick();
    vi.mocked(sendToSink).mockClear();
    onReport()({ refresh: '1' });
    expect(sunk()[0].properties).toEqual({ tool: 'home', refresh: '1' });
  });

  it('counts against the per-page cap', async () => {
    reportToolLifecycleEvent('tool_page_viewed', 'sign');
    await settleTick();
    for (let i = 0; i < MAX_USAGE_EVENTS_PER_PAGE; i++) reportToolLifecycleEvent('tool_operation_started', 'sign');
    vi.mocked(sendToSink).mockClear();
    onReport()({ install: '1' });
    expect(sunk()).toEqual([]);
  });

  it('drops a report the schema does not accept', async () => {
    reportToolLifecycleEvent('tool_page_viewed', 'sign');
    await settleTick();
    vi.mocked(sendToSink).mockClear();
    onReport()({} as never);
    expect(sunk()).toEqual([]);
  });
});
