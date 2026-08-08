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

const DB_NAME = 'pdf-toolkit-drafts';
const STORE_NAME = 'drafts';
const DB_VERSION = 1;

// Drop drafts older than this on load so an abandoned (possibly sensitive) PDF does
// not linger in browser storage forever.
export const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

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
  if (!hasIndexedDB()) return null;
  try {
    const record = await withStore('readonly', (store) => reqToPromise(store.get(tool)));
    if (!record) return null;
    if (typeof record.savedAt === 'number' && Date.now() - record.savedAt > MAX_AGE_MS) {
      await deleteDraft(tool);
      return null;
    }
    return record;
  } catch (e) {
    console.error('draftStore.loadDraft failed:', e);
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
    return true;
  } catch (e) {
    console.error('draftStore.deleteDraft failed:', e);
    return false;
  }
}
