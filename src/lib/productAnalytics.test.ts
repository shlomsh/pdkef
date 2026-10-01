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

afterEach(() => setReportingEnabledForTests(false));

describe('reportToolLifecycleEvent', () => {
  it('posts one JSON blob to /api/report', async () => {
    reportToolLifecycleEvent('tool_result_ready', 'merge');
    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, blob] = beacon.mock.calls[0] as [string, Blob];
    expect(url).toBe('/api/report');
    expect(await blob.text()).toBe('{"name":"tool_result_ready","properties":{"tool":"merge"}}');
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
});
