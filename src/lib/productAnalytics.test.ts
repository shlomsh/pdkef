import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markArrival } from './fileArrival.ts';
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

let beacon: ReturnType<typeof vi.fn>;

beforeEach(() => {
  beacon = vi.fn(() => true);
  Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true, writable: true });
  setReportingEnabledForTests(true);
  resetUsageEventsForTests();
});

afterEach(() => {
  setReportingEnabledForTests(false);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
      vi.stubGlobal('document', {
        querySelector: () => (content === null ? null : { getAttribute: () => content }),
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
  const props = async () => Promise.all(beacon.mock.calls.map(async ([, b]) => JSON.parse(await (b as Blob).text()).properties));

  it('DEBT-61: the home page view carries the visit, and a tool page opened later that day reads today', async () => {
    vi.stubGlobal('localStorage', store());
    reportHomePageView();
    resetUsageEventsForTests(); // the next page load
    reportToolLifecycleEvent('tool_page_viewed', 'sign');
    expect(await props()).toEqual([
      { tool: 'home', first: true, visit: 'new' },
      { tool: 'sign', first: true, visit: 'today' },
    ]);
  });

  it('adds visit to the page view and stamps it once per page load', async () => {
    const ls = store();
    vi.stubGlobal('localStorage', ls);
    reportToolLifecycleEvent('tool_page_viewed', 'sign');
    reportToolLifecycleEvent('tool_page_viewed', 'sign');
    const [a, b] = await props();
    expect(a).toEqual({ tool: 'sign', first: true, visit: 'new' });
    expect(b.visit).toBe('new');
    expect(ls.getItem('pdkef:last-tool-visit')).not.toBeNull();
  });

  it('omits visit without storage', async () => {
    vi.stubGlobal('localStorage', store(true));
    reportToolLifecycleEvent('tool_page_viewed', 'sign');
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
