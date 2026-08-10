// On-device, no-backend draft persistence for in-progress PDF edits.
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

// Drop drafts older than this on load so an abandoned (possibly sensitive) PDF does
// not linger in browser storage forever.
export const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

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

function setDraftHint(tool) {
  try {
    localStorage.setItem(DRAFT_HINT_PREFIX + tool, '1');
  } catch {
    // Best-effort, like everything else here — localStorage can throw in
    // private/locked-down browsing contexts.
  }
}

function clearDraftHint(tool) {
  try {
    localStorage.removeItem(DRAFT_HINT_PREFIX + tool);
  } catch {
    // ditto
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
  try {
    await withStore('readwrite', (store) => {
      store.put({ ...record, tool, savedAt: Date.now() });
    });
    setDraftHint(tool);
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
    if (typeof record.savedAt === 'number' && Date.now() - record.savedAt > MAX_AGE_MS) {
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
