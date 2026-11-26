// Node on purpose: no `localStorage` here at all, which is what a browser that blocks storage looks like to the page.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TIME_BUCKETS } from './usageEventSchema';
import { drainPromises } from '../../test/support/drainPromises.ts';
import { installBeaconRecorder, type BeaconRecorder } from '../../test/support/beaconRecorder.ts';
import { setReportingEnabledForTests } from './errorReport.ts';
import { reportToolLifecycleEvent, resetUsageEventsForTests } from './productAnalytics.ts';

let rec: BeaconRecorder;

beforeEach(() => {
  rec = installBeaconRecorder();
  setReportingEnabledForTests(true);
  resetUsageEventsForTests();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-20T12:00:00'));
});

afterEach(() => {
  vi.useRealTimers();
  rec.restore();
  setReportingEnabledForTests(false);
});

it('omits visit without storage', async () => {
  expect(() => localStorage).toThrow(); // live control: the storage is really absent
  reportToolLifecycleEvent('tool_page_viewed', 'sign');
  await drainPromises();
  expect(rec.calls).toHaveLength(1);
  // Page views carry `ready` off the real clock, as a time bucket; this test is about visit, so it is then set aside.
  const { ready, ...properties } = (await rec.bodies()).map((b) => (b as { properties: Record<string, unknown> }).properties)[0];
  if (ready !== undefined) expect(TIME_BUCKETS).toContain(ready);
  expect(properties).toEqual({ tool: 'sign', first: true });
});
