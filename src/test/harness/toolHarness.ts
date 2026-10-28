/**
 * One harness for island tests (ARCH-78): fake only the EDGE, run everything inside it for real.
 *
 * Edges, which this harness fakes: IndexedDB (fake-indexeddb), localStorage/sessionStorage (cleared),
 * the network transport (`navigator.sendBeacon`, recorded instead of sent) and `URL.createObjectURL`
 * (recorded). Browser APIs jsdom lacks (`mockFileShare.js`) stay with the test file. The pdf.js edge is faked in `pdfjsEdges.ts`, registered by the
 * island projects' setup files, and steered through `harness.pdfjs`.
 *
 * Internal modules are NOT mocked: `draftStore`, `productAnalytics`, `errorReport`, `actionTrail`, a
 * tool's own lib modules and the hand-off/session hooks run for real. A test asserts on what they
 * leave behind, read back through this harness, instead of on a spy of one of them.
 *
 * Usage:
 *   let harness: ToolHarness;
 *   beforeEach(() => { harness = installToolHarness(); });
 *   afterEach(() => { harness.restore(); });
 *   ...
 *   await act(...);
 *   await harness.flush();                          // beacons are read asynchronously
 *   expect(harness.usageEvents('tool_operation_failed')).toHaveLength(1);
 *   expect((await harness.takeHandoff('compress'))?.fileName).toBe('extracted_a.pdf');
 */
// Installs the global IndexedDB classes (IDBKeyRange, ...); the factory itself is replaced per test.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { resetErrorReportingForTests, setReportingEnabledForTests } from '#lib/telemetry/errorReport.ts';
import { resetUsageEventsForTests } from '#lib/telemetry/productAnalytics.ts';
import { createPdfjsHarness, resetPdfjsEdges, type PdfjsHarness } from './pdfjsEdges.ts';
import { resetActionTrailForTests } from '#lib/telemetry/actionTrail.ts';
import { loadDraft, readRecentFiles, takeHandoff } from '#lib/drafts/draftStore.ts';
import type { UsageEvent } from '#lib/telemetry/usageEventSchema.ts';
import type { DropRecord, ErrorReport } from '#lib/telemetry/errorReportSchema.ts';

/** One `navigator.sendBeacon` call: where it was aimed and the JSON it carried. */
export interface BeaconRecord {
  url: string;
  payload: unknown;
}

export interface ToolHarness {
  /** The pdf.js edge (probe, thumbnails, `pdfjs-dist`): fakes registered by the island setup files, steered here. */
  pdfjs: PdfjsHarness;
  /** Every beacon handed to `navigator.sendBeacon` so far, in order (completed reads only, see `flush`). */
  beacons(): BeaconRecord[];
  /**
   * The beacons that are error reports (`reportError`), as sent. A test run has no app stack frames,
   * so a thrown Error arrives as a `kind: 'dropped'` record that still carries `area` and `step`.
   */
  reports(): (ErrorReport | DropRecord)[];
  /** The beacons that are usage events (`tool_operation_failed`, ...), optionally only one `name`. */
  usageEvents(name?: string): UsageEvent[];
  /** Forget the beacons so far (usage state such as "first edit sent" is not reset, see `resetUsage`). */
  clearBeacons(): void;
  /** Reset the once-per-page counters of analytics and error reporting, as a fresh page load would. */
  resetUsage(): void;
  /** Resolves once every beacon sent so far has been read; `await` it before asserting on beacons. */
  flush(): Promise<void>;
  /** The blobs passed to `URL.createObjectURL` so far, in order: what a download or preview was built from. */
  createdBlobs(): Blob[];
  /** The blob behind a `blob:` URL that `URL.createObjectURL` handed out (for example a download link's `href`). */
  blobForUrl(url: string | null | undefined): Blob | undefined;
  /** The tool's current stored draft entry, read back through the real `loadDraft`. */
  storedDraft(tool: string): ReturnType<typeof loadDraft>;
  /** Collects and CONSUMES the hand-off parked for `tool` (the real `takeHandoff`), or null. */
  takeHandoff(tool: string): ReturnType<typeof takeHandoff>;
  /** The recents index, through the real `readRecentFiles`. */
  recents(): ReturnType<typeof readRecentFiles>;
  /** Undo what `installToolHarness` replaced; call from `afterEach`. */
  restore(): void;
}

/**
 * Call from `beforeEach`. Gives the test a fresh IndexedDB and empty web storage, turns error/usage
 * reporting on and records its beacons instead of sending them, and records object URLs.
 */
export function installToolHarness(): ToolHarness {
  resetPdfjsEdges();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  sessionStorage.clear();

  const originalBeacon = Object.getOwnPropertyDescriptor(navigator, 'sendBeacon');
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  const records: BeaconRecord[] = [];
  const pending: Promise<void>[] = [];
  const blobs: Blob[] = [];
  const blobsByUrl = new Map<string, Blob>();

  Object.defineProperty(navigator, 'sendBeacon', {
    configurable: true,
    value: (url: string, data: Blob) => {
      const record: BeaconRecord = { url, payload: undefined };
      records.push(record);
      pending.push(data.text().then((text) => { record.payload = JSON.parse(text); }));
      return true;
    },
  });
  URL.createObjectURL = (blob: Blob | MediaSource) => {
    blobs.push(blob as Blob);
    const url = `blob:fake-url-${blobs.length}`;
    blobsByUrl.set(url, blob as Blob);
    return url;
  };
  URL.revokeObjectURL = () => {};

  const resetUsage = () => {
    resetErrorReportingForTests();
    resetUsageEventsForTests();
    resetActionTrailForTests();
  };
  resetUsage();
  setReportingEnabledForTests(true);

  const payloads = () => records.map((r) => r.payload).filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null);

  return {
    pdfjs: createPdfjsHarness(),
    beacons: () => [...records],
    reports: () => payloads().filter((p) => 'area' in p && 'step' in p) as unknown as (ErrorReport | DropRecord)[],
    usageEvents: (name) => (payloads().filter((p) => typeof p.name === 'string' && 'properties' in p) as unknown as UsageEvent[])
      .filter((e) => name === undefined || e.name === name),
    clearBeacons: () => { records.length = 0; pending.length = 0; },
    resetUsage,
    flush: async () => { await Promise.all(pending.splice(0)); },
    createdBlobs: () => [...blobs],
    blobForUrl: (url) => (url ? blobsByUrl.get(url) : undefined),
    storedDraft: (tool) => loadDraft(tool),
    takeHandoff: (tool) => takeHandoff(tool),
    recents: () => readRecentFiles(),
    restore: () => {
      setReportingEnabledForTests(false);
      if (originalBeacon) Object.defineProperty(navigator, 'sendBeacon', originalBeacon);
      else delete (navigator as { sendBeacon?: unknown }).sendBeacon;
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    },
  };
}
