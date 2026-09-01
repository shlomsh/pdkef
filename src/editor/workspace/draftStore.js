import { createDraftRetention, isDraftExpired } from './draftPolicy.js';

// Workspace-owned, on-device draft persistence for in-progress PDF edits.
//
// Uses IndexedDB (not localStorage) because drafts hold the raw PDF bytes as an
// ArrayBuffer: localStorage is synchronous, string-only, and capped around 5MB,
// while IndexedDB stores binary via structured clone and is async. Everything here
// stays on the user's device — nothing is ever uploaded (see CLAUDE.md privacy
// invariants).
//
// One draft per tool: the store is keyed by tool name ('sign' | 'redact'), so
// picking a new file or starting over simply overwrites/deletes the single record.
// The same store also holds short-lived handoffs under a `handoff:<tool>` key -
// see saveHandoff/takeHandoff below for why those must never share the draft key.

const DB_NAME = 'pdf-toolkit-drafts';
const STORE_NAME = 'drafts';
const DB_VERSION = 1;

// Kept as a public re-export for existing callers. The policy itself lives in
// draftPolicy.js so cache writes and every read path share one definition.
export { MAX_AGE_MS } from './draftPolicy.js';

// A handoff is a baton, not a draft: the home page drops a PDF into it and the tool
// page picks it up one navigation later. Five minutes is far longer than a
// same-origin navigation and short enough that a handoff abandoned mid-flight
// cannot ambush a different session days later with a file it never asked for.
export const HANDOFF_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

// Handoffs live in the same store under their own key space, which is the whole
// point: the home page used to write the dropped file straight into the tool's
// draft key, and since a put() replaces the record, one drop silently destroyed
// whatever signing work was saved there - and wrote a record with no fileBytes, so
// the restore path skipped it and the dropped file was lost too. Nothing outside
// this file may write to a tool's draft key on a tool's behalf.
const handoffKey = (tool) => `handoff:${tool}`;

// Mirrors "a draft record exists for `tool`" into localStorage, which is
// synchronous and readable from a blocking inline script before first paint -
// unlike the IndexedDB record itself. ToolPageLayout.astro reads this at parse
// time to pre-collapse the marketing hero for a returning visitor who has a
// saved draft, instead of the hero visibly collapsing later, once the async
// IndexedDB read and Preact hydration finish - a real, input-less layout shift
// that Core Web Vitals' CLS metric scores. See ToolHero.astro for the read
// side and the invariant this depends on: the flag must be cleared whenever a
// load resolves without a usable record, or a stale hint would pre-collapse a
// hero that then has no file to show.
const DRAFT_HINT_PREFIX = 'pdf-toolkit:has-draft:';

// The home page's resume card needs more than "a draft exists": it names the
// file, dates it, and shows a page-1 preview. All three have to be readable
// *synchronously*, for the same reason the boolean hint does - the card sits
// above the dropzone, so learning about it after an async IndexedDB read would
// push the dropzone down after first paint, which is the exact layout shift
// the hint was invented to avoid.
//
// This is a second key rather than a richer value under DRAFT_HINT_PREFIX on
// purpose. Two readers already hard-compare that value to the string '1'
// (hasDraftHint below, and ToolPageLayout.astro's blocking head script), and
// both run for visitors whose localStorage was written by an older build.
// Widening it would have meant migrating a value that decides whether a hero
// pre-collapses - a silent CLS regression if either reader was missed. A
// sibling key costs one extra write and cannot break either of them.
const DRAFT_META_PREFIX = 'pdf-toolkit:draft-meta:';

function setDraftHint(tool, meta) {
  try {
    localStorage.setItem(DRAFT_HINT_PREFIX + tool, '1');
  } catch {
    // Best-effort, like everything else here — localStorage can throw in
    // private/locked-down browsing contexts.
  }
  // Separate try/catch, and second: the preview pushes this value into the
  // kilobytes, so it is the write that can plausibly hit a quota error. If it
  // does, the boolean hint above must still stand - a tool page that
  // pre-collapses its hero is worth more than a home-page card that shows a
  // thumbnail.
  try {
    if (!meta) return;
    localStorage.setItem(
      DRAFT_META_PREFIX + tool,
      JSON.stringify({ fileName: meta.fileName, savedAt: meta.savedAt, preview: meta.preview }),
    );
  } catch {
    // ditto
  }
}

function clearDraftHint(tool) {
  try {
    localStorage.removeItem(DRAFT_HINT_PREFIX + tool);
  } catch {
    // ditto
  }
  try {
    localStorage.removeItem(DRAFT_META_PREFIX + tool);
  } catch {
    // ditto
  }
}

/**
 * Synchronous, best-effort read of a draft's display metadata without opening
 * IndexedDB, so the client-only home launcher can render its complete local
 * state in its first pass.
 *
 * Advisory only, exactly like hasDraftHint - the IndexedDB record stays the
 * source of truth, and this can lag it if a write was dropped on quota. A
 * caller that acts on this must therefore tolerate the draft turning out not
 * to exist; FileDropzone does, by handing the tool a plain navigation and
 * letting the tool's own restore decide.
 *
 * @param {string} tool
 * @returns {{ fileName?: string, savedAt?: number, preview?: string }|null}
 */
export function readDraftMeta(tool) {
  try {
    if (localStorage.getItem(DRAFT_HINT_PREFIX + tool) !== '1') return null;
    const raw = localStorage.getItem(DRAFT_META_PREFIX + tool);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || isDraftExpired(parsed.savedAt)) {
      clearDraftHint(tool);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Synchronous, best-effort read of the same hint ToolPageLayout.astro's
 * pre-paint script reads: "a draft probably exists for `tool`". Exported so
 * useDraftPersistence.js can decide, before its first render, whether it is
 * worth holding the caller in a "checking" state at all - a visitor with no
 * hint gets today's behaviour (empty state immediately), so this can never
 * add a wait where there wasn't already a draft to wait for.
 *
 * @param {string} tool
 * @returns {boolean}
 */
export function hasDraftHint(tool) {
  try {
    return localStorage.getItem(DRAFT_HINT_PREFIX + tool) === '1';
  } catch {
    return false;
  }
}

function hasIndexedDB() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    // Accessing indexedDB can throw in some locked-down/Safari-private contexts.
    return false;
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'tool' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Run a single transaction against the drafts store and resolve with `resultFn`'s
// value once the transaction commits. Closes the connection afterwards.
async function withStore(mode, work) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      let result;
      Promise.resolve(work(store))
        .then((value) => {
          result = value;
        })
        .catch(reject);
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Persist (overwrite) the single draft for a tool.
 * Silently no-ops if IndexedDB is unavailable — persistence is best-effort and must
 * never break the tool itself.
 *
 * @param {string} tool - 'sign' | 'redact'
 * @param {object} record - draft fields (tool key is set/overridden here)
 * @returns {Promise<boolean>} true if written
 */
export async function saveDraft(tool, record) {
  if (!hasIndexedDB()) return false;
  // `preview` is display metadata for the home page, not part of the draft:
  // it lives in localStorage (see setDraftHint) because it has to be readable
  // synchronously. Keeping it out of the record avoids storing the same image
  // twice, and keeps it out of what onRestore rehydrates a tool from.
  const { preview, ...draft } = record;
  const { savedAt } = createDraftRetention();
  try {
    await withStore('readwrite', (store) => {
      store.put({ ...draft, tool, savedAt });
    });
    setDraftHint(tool, { fileName: draft.fileName, savedAt, preview });
    return true;
  } catch (e) {
    console.error('draftStore.saveDraft failed:', e);
    return false;
  }
}

/**
 * Load a tool's draft, or null if none exists. Records older than MAX_AGE_MS are
 * treated as absent and deleted.
 *
 * @param {string} tool
 * @returns {Promise<object|null>}
 */
export async function loadDraft(tool) {
  // No IndexedDB means no draft ever gets written by this module, so any hint
  // still sitting in localStorage (from a previous browser/profile whose
  // export got copied, say) cannot correspond to a real record here — clear it
  // rather than let it keep pre-collapsing a hero with nothing to restore.
  if (!hasIndexedDB()) {
    clearDraftHint(tool);
    return null;
  }
  try {
    const record = await withStore('readonly', (store) => reqToPromise(store.get(tool)));
    if (!record) {
      clearDraftHint(tool);
      return null;
    }
    if (isDraftExpired(record.savedAt)) {
      await deleteDraft(tool);
      return null;
    }
    return record;
  } catch (e) {
    console.error('draftStore.loadDraft failed:', e);
    clearDraftHint(tool);
    return null;
  }
}

/**
 * Remove a tool's draft. Called when a tool loads a different file over this one; Start over, which
 * used to be the other caller, is gone (it and Replace meant the same thing).
 * @param {string} tool
 * @returns {Promise<boolean>}
 */
export async function deleteDraft(tool) {
  if (!hasIndexedDB()) return false;
  try {
    await withStore('readwrite', (store) => {
      store.delete(tool);
    });
    clearDraftHint(tool);
    return true;
  } catch (e) {
    console.error('draftStore.deleteDraft failed:', e);
    return false;
  }
}

/**
 * Park a dropped file for a tool to collect after the navigation that follows.
 * Stores the bytes, not the File: a File handle does not survive a page load, and
 * the receiving side rebuilds one from these fields.
 *
 * @param {string} tool - 'sign' | 'redact'
 * @param {{ fileName: string, fileType?: string, fileBytes: ArrayBuffer }} record
 * @returns {Promise<boolean>} true if written
 */
export async function saveHandoff(tool, record) {
  if (!hasIndexedDB()) return false;
  try {
    await withStore('readwrite', (store) => {
      store.put({ ...record, tool: handoffKey(tool), savedAt: Date.now() });
    });
    return true;
  } catch (e) {
    console.error('draftStore.saveHandoff failed:', e);
    return false;
  }
}

/**
 * Collect and consume a tool's pending handoff, or null if there is none.
 *
 * Read-and-delete in one call, deliberately: a handoff is a one-shot baton, so
 * leaving it behind would re-open the same file on every later visit to the tool,
 * and would do it over whatever the user had since started.
 *
 * @param {string} tool
 * @returns {Promise<object|null>}
 */
export async function takeHandoff(tool) {
  if (!hasIndexedDB()) return null;
  const key = handoffKey(tool);
  try {
    const record = await withStore('readonly', (store) => reqToPromise(store.get(key)));
    if (!record) return null;
    await withStore('readwrite', (store) => {
      store.delete(key);
    });
    if (typeof record.savedAt === 'number' && Date.now() - record.savedAt > HANDOFF_MAX_AGE_MS) {
      return null;
    }
    return record.fileBytes ? record : null;
  } catch (e) {
    console.error('draftStore.takeHandoff failed:', e);
    return null;
  }
}
