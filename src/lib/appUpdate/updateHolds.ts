/**
 * What a tab must finish before a new build may take it over (MEM-10).
 *
 * The update line (`src/site-lib/appUpdate.ts`) lets a person move every open
 * tab onto a newly deployed build with one click: the waiting service worker
 * is told to skip waiting, it activates, deletes the old build's cache, and
 * every tab reloads itself on `controllerchange`. Two things in a tab must not
 * be cut off by that:
 *
 * - **An export in flight.** It lazy-imports content-hashed chunks (pdf-lib,
 *   pdfjs, fonts) from the build it started on; deleting that cache under it is
 *   the "PDF silently never appears" failure that kept `skipWaiting` banned.
 *   A tool calls `holdUpdate()` when a person-initiated export starts and the
 *   returned release when it ends (or `useHoldUpdate(active)`). While any tab
 *   holds, the update waits; the line stays.
 * - **A debounced draft save.** Drafts survive the reload because they live in
 *   IndexedDB, but only once written. A draft hook registers a flush with
 *   `registerBeforeUpdateReload`; the tab awaits every flush before it reloads.
 *
 * Framework-free and module-scoped on purpose: the layout's registration
 * script and the tool islands import this same module, so they share one
 * registry per page.
 */

type Listener = (held: boolean) => void;
type Flush = () => unknown;

let holds = 0;
const listeners = new Set<Listener>();
const flushes = new Set<Flush>();

function notify() {
  const held = holds > 0;
  for (const listener of listeners) listener(held);
}

/** Marks an export in flight. The returned release is idempotent. */
export function holdUpdate(): () => void {
  holds += 1;
  if (holds === 1) notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    if (holds === 0) notify();
  };
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
