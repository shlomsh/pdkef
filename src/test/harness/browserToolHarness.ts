import { vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { worker } from '../support/network.browser.ts';
import { resetErrorReportingForTests, setReportingEnabledForTests } from '#lib/telemetry/errorReport.ts';
import { resetUsageEventsForTests } from '#lib/telemetry/productAnalytics.ts';
import { resetActionTrailForTests } from '#lib/telemetry/actionTrail.ts';
import { ERROR_REPORT_PATH } from '#lib/telemetry/errorReportSchema.ts';
import { loadDraft, readRecentFiles, takeHandoff } from '#lib/drafts/draftStore.ts';
import type { BeaconRecord, ToolHarness } from './toolHarness.ts';

export type BrowserToolHarness = Omit<ToolHarness, 'settle' | 'blobForUrl' | 'restore'> & {
  /** The blob behind a `blob:` URL the page made (a download link's `href`), read back from Chromium itself. */
  blobForUrl(url: string | null | undefined): Promise<Blob | undefined>;
  /** Waits for every beacon sent so far to land, then puts reporting back; `await` it from `afterEach`. */
  restore(): Promise<void>;
};

const CONTROL = 'browser-tool-harness-flush';

/** Preact runs the effects of a render made outside `act` in a task after the next frame; this resolves in the task behind it. */
const effectsRun = () => new Promise<void>((resolve) => { requestAnimationFrame(() => { setTimeout(resolve); }); });

async function emptyIndexedDb() {
  const names = (await indexedDB.databases()).map((database) => database.name).filter((name): name is string => !!name);
  await Promise.all(names.map((name) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  })));
}

/** Call from `beforeEach` and await it: an empty IndexedDB and web storage, reporting on and every beacon recorded. */
export async function installBrowserToolHarness() {
  await emptyIndexedDb();
  localStorage.clear();
  sessionStorage.clear();

  const records: BeaconRecord[] = [];
  const bodies: Promise<void>[] = [];
  const controls = new Map<number, () => void>();
  const landed = ({ request }: { request: Request }) => {
    if (request.method !== 'POST' || new URL(request.url).pathname !== ERROR_REPORT_PATH) return;
    const record: BeaconRecord = { url: ERROR_REPORT_PATH, payload: undefined };
    records.push(record);
    bodies.push(request.clone().text().then((text) => {
      const payload = JSON.parse(text);
      if (payload?.[CONTROL] === undefined) record.payload = payload;
      else {
        const at = records.indexOf(record);
        if (at >= 0) records.splice(at, 1);
        controls.get(payload[CONTROL])?.();
      }
    }));
  };
  worker.events.on('request:start', landed);
  worker.use(http.post(ERROR_REPORT_PATH, () => new HttpResponse(null, { status: 204 })));

  const objectUrls = vi.spyOn(URL, 'createObjectURL');

  let flushes = 0;
  const flush = async () => {
    if (!vi.isFakeTimers()) await effectsRun();
    const marker = ++flushes;
    const arrived = new Promise<void>((resolve) => { controls.set(marker, resolve); });
    navigator.sendBeacon(ERROR_REPORT_PATH, JSON.stringify({ [CONTROL]: marker }));
    await arrived;
    await Promise.all(bodies.splice(0));
  };

  const resetUsage = () => {
    resetErrorReportingForTests();
    resetUsageEventsForTests();
    resetActionTrailForTests();
  };
  resetUsage();
  setReportingEnabledForTests(true);

  const payloads = () => records.map((r) => r.payload).filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null);
  const blobs = () => objectUrls.mock.calls.map(([blob]) => blob as Blob);

  return {
    beacons: () => [...records],
    reports: () => payloads().filter((p) => 'area' in p && 'step' in p) as unknown as ReturnType<ToolHarness['reports']>,
    usageEvents: (name) => (payloads().filter((p) => typeof p.name === 'string' && 'properties' in p) as unknown as ReturnType<ToolHarness['usageEvents']>)
      .filter((e) => name === undefined || e.name === name),
    clearBeacons: () => { records.length = 0; },
    resetUsage,
    flush,
    createdBlobs: blobs,
    blobForUrl: async (url) => (url ? fetch(url).then((response) => response.blob(), () => undefined) : undefined),
    storedDraft: (tool) => loadDraft(tool),
    takeHandoff: (tool) => takeHandoff(tool),
    recents: () => readRecentFiles(),
    restore: async () => {
      setReportingEnabledForTests(false);
      await flush();
      worker.events.removeListener('request:start', landed);
      objectUrls.mockRestore();
    },
  } satisfies BrowserToolHarness;
}
