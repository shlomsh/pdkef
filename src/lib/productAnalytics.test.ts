import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setReportingEnabledForTests } from './errorReport.ts';
import {
  MAX_USAGE_EVENTS_PER_PAGE,
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
