/**
 * MEM-38: a failed chunk import reloads the page once.
 *
 * After a deploy, a tab the service worker does not control asks the network
 * for chunks its build named, and the new build no longer serves them: the lazy
 * import fails and the feature just stops. One reload picks up the current
 * build. It waits for the same draft flush an update reload uses, never
 * happens while an update hold says a reload would lose work, and happens at
 * most once per window so a chunk that is really missing cannot loop.
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

type ChunkReloadDecision = 'reload' | 'report-held' | 'report-repeat';

/** @testSeam */
export function decideChunkReload(input: { held: boolean; lastReloadAt: number | null; now: number }): ChunkReloadDecision {
  if (input.held) return 'report-held';
  if (input.lastReloadAt !== null && input.now - input.lastReloadAt < CHUNK_RELOAD_WINDOW_MS) return 'report-repeat';
  return 'reload';
}

type Report = (area: 'chunk_load', error: unknown, step: string) => unknown;

interface ChunkReloadDeps {
  win?: Pick<Window, 'addEventListener'> & { location: Pick<Location, 'reload'> };
  /** The tab's session storage, or null when the browser refuses it. */
  storage?: () => Pick<Storage, 'getItem' | 'setItem'> | null;
  now?: () => number;
  report?: Report;
  flush?: () => Promise<void>;
  isHeld?: () => boolean;
}

function safeSessionStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
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
  // Set on the first reload decision and never cleared: the page is going away.
  let reloading = false;

  function readLastReload(): number | null {
    try {
      const raw = storage()?.getItem(STORAGE_KEY);
      const at = raw ? Number(raw) : NaN;
      return Number.isFinite(at) ? at : null;
    } catch {
      // expected: no record means a reload is allowed
      return null;
    }
  }

  function recordReload(at: number) {
    try {
      storage()?.setItem(STORAGE_KEY, String(at));
    } catch {
      // expected: without a record the window cannot hold, one reload still happens
    }
  }

  /** Whether the page will reload, so the caller knows to keep the browser's own error handling off. */
  function handle(error: unknown): boolean {
    if (reloading) return true;
    const at = now();
    const decision = decideChunkReload({ held: isHeld(), lastReloadAt: readLastReload(), now: at });
    if (decision !== 'reload') {
      void Promise.resolve(report('chunk_load', error, decision === 'report-held' ? 'chunk_failure_held' : 'chunk_failure_repeat')).catch(() => {
        // expected: reporting never changes what the page does
      });
      return false;
    }
    reloading = true;
    recordReload(at);
    const reported = Promise.resolve(report('chunk_load', error, 'chunk_failure_reload')).catch(() => {
      // expected: reporting never changes what the page does
    });
    void Promise.allSettled([reported, flush()]).then(() => win.location.reload());
    return true;
  }

  win.addEventListener('vite:preloadError', (event: Event) => {
    if (handle((event as Event & { payload?: unknown }).payload)) event.preventDefault();
  });
  win.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    if (isChunkLoadFailure(event.reason)) handle(event.reason);
  });
}
