/**
 * MEM-38: a failed chunk import reloads the page once.
 *
 * After a deploy, a tab the service worker does not control asks the network
 * for chunks its build named, and the new build no longer serves them: the lazy
 * import fails and the feature just stops. One reload picks up the current
 * build. It waits for the same draft flush an update reload uses, never
 * happens while an update hold says a reload would lose work, and happens at
 * most once per window so a chunk that is really missing cannot loop. With no
 * way to record the reload there is no window, so it does not reload at all;
 * offline is not a deploy, so it does not reload either. A page reports one
 * non-reload outcome and then stays quiet.
 *
 * Decisions are small pure functions; `installChunkReload` is thin wiring over
 * injected dependencies so it runs against fakes. The reporter loads on demand
 * (appUpdate.ts does the same): every page carries this file, few ever need it.
 */
import { flushBeforeUpdateReload, isUpdateHeld } from '#lib/appUpdate/updateHolds.ts';

/** @testSeam */
export const CHUNK_RELOAD_WINDOW_MS = 60_000;
const STORAGE_KEY = 'pdkef:chunk-reload-at';

// Each browser's own wording of a failed dynamic import.
const IMPORT_FAILURE = /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module/i;

/** @testSeam */
export function isChunkLoadFailure(reason: unknown): boolean {
  return reason instanceof Error && IMPORT_FAILURE.test(reason.message);
}

type ChunkReloadDecision = 'reload' | 'report-held' | 'report-repeat' | 'report-unrecorded' | 'report-offline';

const REPORT_STEP: Record<Exclude<ChunkReloadDecision, 'reload'>, string> = {
  'report-held': 'chunk_failure_held',
  'report-repeat': 'chunk_failure_repeat',
  'report-unrecorded': 'chunk_failure_unrecorded',
  'report-offline': 'chunk_failure_offline',
};

/** @testSeam */
export function decideChunkReload(input: {
  held: boolean;
  online: boolean;
  /** Whether this tab can keep the reload record that bounds the window. */
  canRecord: boolean;
  lastReloadAt: number | null;
  now: number;
}): ChunkReloadDecision {
  if (input.held) return 'report-held';
  if (!input.online) return 'report-offline';
  if (!input.canRecord) return 'report-unrecorded';
  if (input.lastReloadAt !== null && input.now - input.lastReloadAt < CHUNK_RELOAD_WINDOW_MS) return 'report-repeat';
  return 'reload';
}

type Report = (area: 'chunk_load', error: unknown, step: string) => unknown;

interface ChunkReloadDeps {
  win?: Pick<Window, 'addEventListener'> & { location: Pick<Location, 'reload'> };
  /** The tab's session storage, or null when the browser refuses it. */
  storage?: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  now?: () => number;
  report?: Report;
  flush?: () => Promise<void>;
  isHeld?: () => boolean;
  isOnline?: () => boolean;
}

function safeSessionStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  try {
    return window.sessionStorage;
  } catch {
    // expected: storage is blocked in some private modes
    return null;
  }
}

function lazyReport(area: 'chunk_load', error: unknown, step: string): Promise<void> {
  return import('#lib/telemetry/errorReport.ts').then((m) => m.reportError(area, error, step));
}

export function installChunkReload(deps: ChunkReloadDeps = {}): void {
  const win = deps.win ?? window;
  const storage = deps.storage ?? safeSessionStorage;
  const now = deps.now ?? Date.now;
  const report = deps.report ?? lazyReport;
  const flush = deps.flush ?? flushBeforeUpdateReload;
  const isHeld = deps.isHeld ?? isUpdateHeld;
  const isOnline = deps.isOnline ?? (() => navigator.onLine !== false);
  // Set on the first reload decision and never cleared: the page is going away.
  let reloading = false;
  // Set on the first non-reload outcome: later events on this page do nothing.
  let reported = false;

  function readLastReload(): number | null {
    try {
      const raw = storage()?.getItem(STORAGE_KEY);
      const at = raw ? Number(raw) : NaN;
      return Number.isFinite(at) ? at : null;
    } catch {
      // expected: no readable record, so canRecord decides
      return null;
    }
  }

  /** Writes the record and reads it back; true only when it was kept. */
  function recordReload(at: number): boolean {
    try {
      const s = storage();
      if (!s) return false;
      s.setItem(STORAGE_KEY, String(at));
      return s.getItem(STORAGE_KEY) === String(at);
    } catch {
      // expected: storage refused the write
      return false;
    }
  }

  /** Whether a record could be kept right now, probed on a key that never holds a window. */
  function canRecord(at: number): boolean {
    const probe = `${STORAGE_KEY}:probe`;
    try {
      const s = storage();
      if (!s) return false;
      s.setItem(probe, String(at));
      const ok = s.getItem(probe) === String(at);
      s.removeItem(probe);
      return ok;
    } catch {
      // expected: storage refused the probe
      return false;
    }
  }

  function send(error: unknown, step: string): Promise<void> {
    return Promise.resolve(report('chunk_load', error, step)).then(() => undefined).catch(() => {
      // expected: reporting never changes what the page does
    });
  }

  /** Whether the page will reload, so the caller knows to keep the browser's own error handling off. */
  function handle(error: unknown): boolean {
    if (reloading) return true;
    if (reported) return false;
    const at = now();
    const decision = decideChunkReload({
      held: isHeld(),
      online: isOnline(),
      canRecord: canRecord(at),
      lastReloadAt: readLastReload(),
      now: at,
    });
    if (decision !== 'reload') {
      reported = true;
      void send(error, REPORT_STEP[decision]); // reason: send() catches its own rejection; the page carries on
      return false;
    }
    if (!recordReload(at)) {
      reported = true;
      void send(error, REPORT_STEP['report-unrecorded']); // reason: send() catches its own rejection
      return false;
    }
    reloading = true;
    const sent = send(error, 'chunk_failure_reload');
    void Promise.allSettled([sent, flush()]).then(() => { // reason: allSettled never rejects; the page reloads or stays
      // A hold can start while the flush runs (an export began): leave the page be.
      // A second report is sent here, it says why this reload did not happen.
      if (isHeld()) {
        void send(error, REPORT_STEP['report-held']); // reason: send() catches its own rejection
        return;
      }
      win.location.reload();
    });
    return true;
  }

  win.addEventListener('vite:preloadError', (event: Event) => {
    if (handle((event as Event & { payload?: unknown }).payload)) event.preventDefault();
  });
  win.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    if (isChunkLoadFailure(event.reason)) handle(event.reason);
  });
}
