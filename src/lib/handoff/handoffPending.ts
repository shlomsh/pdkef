import { pageSlugsForHandoffKey } from '../app/toolIds.ts';

/**
 * HERO-02: a synchronous "a hand-off is waiting for this page" marker.
 *
 * A hand-off lives in IndexedDB, which ToolPageLayout.astro's pre-paint script cannot read, so a
 * file that arrived through one landed 100-300ms after the empty two-column first screen had
 * painted (CLS 0.2-0.3). `saveHandoff` also writes this sessionStorage key (the sender and the
 * target are the same tab, and sessionStorage survives the same-tab navigation); the pre-paint
 * script reads `pdkef:handoff-pending:<last path segment>` and sets `html[data-handoff-pending]`,
 * which makes the page behave like a Merge restore until the tool has a file.
 *
 * Callers pass the hand-off key (the draft-store key, `handoffKeyFor` in routeFiles.ts). That
 * equals the page slug for most tools. Compress Image is the Compress island in image mode, and
 * Organize PDF is the 'edit-pdf' island, and variant landing pages share an island, so one
 * hand-off opens several pages. `pageSlugsForHandoffKey` (toolIds.ts) lists the page slugs a key
 * opens; the marker is written and cleared under all of them, so the pre-paint script (which only
 * knows the page slug) needs no mapping.
 * Sign and Redact get the marker too: their editor restore (useEditorDraftPersistence's
 * `beforeRestore`) is what takes the hand-off and releases it. The key text is also in ToolPageLayout.astro's hashed script: change both together.
 */
const PREFIX = 'pdkef:handoff-pending:';
const ATTRIBUTE = 'data-handoff-pending';
const slugsFor = pageSlugsForHandoffKey;
/** A load that never shows a tool must not leave the page's body hidden for good. */
const RELEASE_CAP_MS = 8000;
const LOADED = '[data-tool-loaded], [data-tool-shell]';

export function markHandoffPending(tool: string): void {
  try {
    for (const slug of slugsFor(tool)) sessionStorage.setItem(PREFIX + slug, '1');
  } catch {
    // expected: storage blocked or full; the hand-off still loads, just with the late layout switch.
  }
}

/** Drop the storage key now: it is a one-shot, so a reload must not hide the page again. */
export function clearHandoffPending(tool: string): void {
  try {
    for (const slug of slugsFor(tool)) sessionStorage.removeItem(PREFIX + slug);
  } catch {
    // expected: storage blocked; nothing was written, so there is nothing to clear.
  }
}

/** Drop `html[data-handoff-pending]` at once (nothing to consume: a stale marker). */
export function releaseHandoffPending(): void {
  document.documentElement.removeAttribute(ATTRIBUTE);
}

/**
 * Drop `html[data-handoff-pending]` once the tool shows its file, so the held-back layout never
 * flashes back to the empty one in between; after `RELEASE_CAP_MS` regardless, so a file the tool
 * refused still shows the tool's own message. Returns the cancel function.
 */
export function releaseHandoffPendingWhenLoaded(): () => void {
  const root = document.documentElement;
  if (!root.hasAttribute(ATTRIBUTE)) return () => {};
  if (document.querySelector(LOADED)) {
    releaseHandoffPending();
    return () => {};
  }
  let timer = 0;
  const observer = new MutationObserver(() => {
    if (document.querySelector(LOADED)) done();
  });
  const stop = () => {
    observer.disconnect();
    window.clearTimeout(timer);
  };
  const done = () => {
    stop();
    releaseHandoffPending();
  };
  observer.observe(document.body, { childList: true, subtree: true });
  timer = window.setTimeout(done, RELEASE_CAP_MS);
  return stop;
}
