// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installBeaconRecorder, type BeaconRecorder } from '../test/support/beaconRecorder.ts';
import { setReportingEnabledForTests } from '#lib/telemetry/errorReport.ts';
import { beaconMaintenanceTransport, reportMaintenanceEvent, resetMaintenanceEventsForTests } from '#lib/telemetry/maintenanceTelemetry.ts';
import type { MaintenanceEvent } from '#lib/telemetry/maintenanceEventSchema.ts';
import { reportSwInstallFailures } from './swInstallReport.ts';

const BASE = 'https://pdkef.test';
const REC = '/__maint/sw-install/';
const SENT = '/__maint/sw-install-sent/';

// In-memory CacheStorage: one cache, insertion-ordered like the real one.
function fakeCaches(initial: Record<string, string> = {}, opts: { exists?: boolean } = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  let exists = opts.exists ?? true;
  const abs = (k: unknown) => new URL(typeof k === 'string' ? k : (k as Request).url, BASE).pathname;
  const cache = {
    keys: async () => [...store.keys()].map((p) => new Request(BASE + p)),
    match: async (k: unknown) => (store.has(abs(k)) ? new Response(store.get(abs(k))) : undefined),
    put: async (k: unknown, res: Response) => { store.set(abs(k), await res.text()); },
    delete: async (k: unknown) => store.delete(abs(k)),
  };
  const caches = {
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: jsdom and Node have no CacheStorage.
    has: vi.fn(async () => exists),
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: jsdom and Node have no CacheStorage.
    open: vi.fn(async () => { exists = true; return cache; }),
  };
  return { caches, store };
}

// The send the page passes in production, over the real beacon path.
const send = (event: MaintenanceEvent) => reportMaintenanceEvent(event, beaconMaintenanceTransport);

let beacons: BeaconRecorder;
beforeEach(() => {
  beacons = installBeaconRecorder();
  setReportingEnabledForTests(true);
  resetMaintenanceEventsForTests();
});
afterEach(() => {
  beacons.restore();
  setReportingEnabledForTests(false);
  comeOnline();
});

// The browser is offline: reportMaintenanceEvent makes no attempt and says so.
function goOffline() {
  // oxlint-disable-next-line landmines/no-test-doubles -- Forced: jsdom has no way to take the browser offline.
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  expect(navigator.onLine).toBe(false);
}

function comeOnline() {
  // oxlint-disable-next-line landmines/no-test-doubles -- Forced: undoes the offline override above.
  Reflect.deleteProperty(navigator, 'onLine');
}

const rec = (build: string, over: Record<string, unknown> = {}) =>
  JSON.stringify({ v: 1, build, reason: 'storage', missed: '0', ...over });

describe('reportSwInstallFailures', () => {
  it('sends one record exactly as the schema wants, without the build id, then writes a tombstone', async () => {
    const { caches, store } = fakeCaches({ [REC + 'b1']: rec('b1', { reason: 'files_missed', missed: '2-5' }) });
    await reportSwInstallFailures({ caches, send });
    expect(beacons.calls).toHaveLength(1);
    expect(await beacons.bodies()).toEqual([{ name: 'sw_install', properties: { outcome: 'failure', reason: 'files_missed', missed: '2-5' } }]);
    expect(JSON.stringify(await beacons.bodies())).not.toContain('b1');
    expect(store.has(SENT + 'b1')).toBe(true);
  });

  it('reads the same state on two page loads and sends once in total', async () => {
    const { caches } = fakeCaches({ [REC + 'b1']: rec('b1') });
    await reportSwInstallFailures({ caches, send });
    await reportSwInstallFailures({ caches, send });
    expect(beacons.calls).toHaveLength(1);
  });

  it('does not send a record that has a tombstone', async () => {
    const { caches } = fakeCaches({ [REC + 'b1']: rec('b1'), [SENT + 'b1']: '1' });
    await reportSwInstallFailures({ caches, send });
    expect(beacons.calls).toHaveLength(0);
  });

  it.each([
    ['bad JSON', '{nope'],
    ['unknown reason', rec('b1', { reason: 'mystery' })],
    ['unknown bucket', rec('b1', { missed: '7' })],
    ['version 2', rec('b1', { v: 2 })],
  ])('deletes a malformed record (%s) and never sends it', async (_n, body) => {
    const { caches, store } = fakeCaches({ [REC + 'b1']: body });
    await reportSwInstallFailures({ caches, send });
    expect(beacons.calls).toHaveLength(0);
    expect(store.has(REC + 'b1')).toBe(false);
  });

  it('never opens (so never creates) the cache when it does not exist', async () => {
    const { caches } = fakeCaches({}, { exists: false });
    await reportSwInstallFailures({ caches, send });
    expect(caches.open).not.toHaveBeenCalled();
    expect(beacons.calls).toHaveLength(0);
  });

  it('resolves when send throws', async () => {
    const { caches } = fakeCaches({ [REC + 'b1']: rec('b1') });
    // Forced: the real send never throws (reportMaintenanceEvent catches), so only a throwing function reaches the page's own catch.
    await expect(reportSwInstallFailures({ caches, send: () => { throw new Error('x'); } })).resolves.toBeUndefined();
  });

  it('resolves when the cache throws', async () => {
    // Forced: jsdom and Node have no CacheStorage to make throw.
    const caches = { has: async () => { throw new Error('x'); }, open: async () => { throw new Error('y'); } };
    await expect(reportSwInstallFailures({ caches, send })).resolves.toBeUndefined();
    // Forced: jsdom and Node have no CacheStorage to make throw.
    const openThrows = { has: async () => true, open: async () => { throw new Error('y'); } };
    await expect(reportSwInstallFailures({ caches: openThrows, send })).resolves.toBeUndefined();
  });

  it('removes tombstones that have no record', async () => {
    const { caches, store } = fakeCaches({ [REC + 'b2']: rec('b2'), [SENT + 'gone']: '1', [SENT + 'b2']: '1' });
    await reportSwInstallFailures({ caches, send });
    expect(store.has(SENT + 'gone')).toBe(false);
    expect(store.has(SENT + 'b2')).toBe(true);
  });

  it('keeps at most 5 records, dropping the oldest with their tombstones', async () => {
    const init: Record<string, string> = {};
    for (let i = 1; i <= 8; i++) init[REC + `b${i}`] = rec(`b${i}`);
    const { caches, store } = fakeCaches(init);
    await reportSwInstallFailures({ caches, send });
    const records = [...store.keys()].filter((k) => k.startsWith(REC));
    expect(records).toEqual([3, 4, 5, 6, 7, 8].slice(1).map((i) => REC + `b${i}`));
    expect([...store.keys()].filter((k) => k.startsWith(SENT)).sort()).toEqual(records.map((k) => SENT + k.slice(REC.length)).sort());
  });

  it('writes no tombstone when the send did not go out, and sends once a later load can', async () => {
    const { caches, store } = fakeCaches({ [REC + 'b1']: rec('b1') });
    goOffline();
    await reportSwInstallFailures({ caches, send });
    expect(beacons.calls).toHaveLength(0);
    expect(store.has(SENT + 'b1')).toBe(false);
    comeOnline();
    expect(navigator.onLine).toBe(true);
    await reportSwInstallFailures({ caches, send });
    await reportSwInstallFailures({ caches, send });
    expect(beacons.calls).toHaveLength(1);
    expect(store.has(SENT + 'b1')).toBe(true);
  });

  it('writes no tombstone when send throws', async () => {
    const { caches, store } = fakeCaches({ [REC + 'b1']: rec('b1') });
    // Forced: the real send never throws (reportMaintenanceEvent catches), so only a throwing function reaches the page's own catch.
    await reportSwInstallFailures({ caches, send: () => { throw new Error('x'); } });
    expect(store.has(SENT + 'b1')).toBe(false);
  });
});
