/**
 * What a tab must finish before a new build may take it over (MEM-10).
 *
 * A new build takes over silently on a navigation, once every open tab has
 * answered the service worker that it is idle (`src/site-lib/appUpdate.ts`):
 * the waiting worker activates, deletes the old build's cache, and every tab
 * reloads itself on `controllerchange`. Two things in a tab must not be cut
 * off by that:
 *
 * - **Work a reload would lose.** An export in flight lazy-imports
 *   content-hashed chunks (pdf-lib, pdfjs, fonts) from the build it started on;
 *   deleting that cache under it is the "PDF silently never appears" failure
 *   that kept `skipWaiting` banned. And a tool without drafts keeps its loaded
 *   file, settings and result only in memory. A tool calls `holdUpdate()` and
 *   the returned release around either (or `useHoldUpdate(active)`). While any
 *   tab holds, nothing updates, and the other tabs' line says why.
 * - **A debounced draft save.** Drafts survive the reload because they live in
 *   IndexedDB, but only once written. A draft hook registers a flush with
 *   `registerBeforeUpdateReload`; the tab awaits every flush before it reloads.
 *
 * - **MEM-13, a forced update.** A build that fixes a major bug takes every tab
 *   over without waiting for the holds above, except an export in flight and
 *   the draft flush. So a hold says what it is for: `'export'` (the default,
 *   and the safe reading of any caller that does not say) is work in flight
 *   that a forced update still waits for, up to a cap; `'open'` is a file that
 *   merely sits open in a tool without drafts, which a force overrides.
 *
 * Framework-free and module-scoped on purpose: the layout's registration
 * script and the tool islands import this same module, so they share one
 * registry per page.
 */

type Listener = (held: boolean) => void;
type Flush = () => unknown;

/** 'export': work in flight a forced update still waits for. 'open': a file merely open. */
export type HoldKind = 'export' | 'open';

let holds = 0;
let exportHolds = 0;
const listeners = new Set<Listener>();
const exportListeners = new Set<Listener>();
const flushes = new Set<Flush>();

function notify() {
  const held = holds > 0;
  for (const listener of listeners) listener(held);
}

function notifyExport() {
  const inFlight = exportHolds > 0;
  for (const listener of exportListeners) listener(inFlight);
}

/** Marks work a reload would lose. The returned release is idempotent. */
export function holdUpdate(kind: HoldKind = 'export'): () => void {
  holds += 1;
  if (holds === 1) notify();
  if (kind === 'export') {
    exportHolds += 1;
    if (exportHolds === 1) notifyExport();
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    if (holds === 0) notify();
    if (kind === 'export') {
      exportHolds -= 1;
      if (exportHolds === 0) notifyExport();
    }
  };
}

/** True while this tab has an export in flight (an 'export' hold), the only hold a force waits for. */
export function isExportInFlight(): boolean {
  return exportHolds > 0;
}

/** Called with the new value whenever this tab starts or stops having an export in flight. */
export function onExportInFlightChange(listener: Listener): () => void {
  exportListeners.add(listener);
  return () => exportListeners.delete(listener);
}

export function isUpdateHeld(): boolean {
  return holds > 0;
}

/** Called with the new value whenever this tab starts or stops holding. */
export function onUpdateHoldChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Registers work to finish (and await) before an update reloads the tab. */
export function registerBeforeUpdateReload(flush: Flush): () => void {
  flushes.add(flush);
  return () => flushes.delete(flush);
}

/**
 * Runs every registered flush and resolves once all have settled, or after
 * `timeoutMs`, whichever is first: a write that never settles must not leave
 * the tab stranded on a build whose cache is already gone.
 */
export async function flushBeforeUpdateReload(timeoutMs = 3000): Promise<void> {
  const settled = Promise.allSettled([...flushes].map(async (flush) => flush()));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs); });
  await Promise.race([settled, timeout]);
  clearTimeout(timer);
}
