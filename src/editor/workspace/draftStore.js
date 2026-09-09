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

// This is intentionally a fresh, fixed schema instead of a new version of
// `pdf-toolkit-drafts`. Safari can leave an installed app's previous page
// attached to an old database version, which turns an ordinary schema upgrade
// into an indefinitely blocked `open()` request. The retired store is never
// opened or migrated by this app; its already-expired drafts are simply no
// longer reachable from the current workspace.
//
// Every record keeps its source bytes with the draft. Fields may be added to a
// record without changing an IndexedDB object store, so this database has no
// upgrade path to coordinate between open PWA windows.
const DB_NAME = 'pdf-toolkit-workspace';
const STORE_NAME = 'workspace';
const DB_VERSION = 1;

// This tiny localStorage record is deliberately metadata only. It lets a
// second tab say what happened without ever copying a filename, PDF byte, edit,
// or document identifier through the `storage` event channel.
const DRAFT_CHANGE_PREFIX = 'pdf-toolkit:workspace:draft-change:';
let tabWriterId;

function getTabWriterId() {
  if (tabWriterId) return tabWriterId;
  try {
    const existing = sessionStorage.getItem('pdf-toolkit:draft-writer');
    if (existing) return (tabWriterId = existing);
    const next = crypto.randomUUID?.() || `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem('pdf-toolkit:draft-writer', next);
    return (tabWriterId = next);
  } catch {
    return (tabWriterId = `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  }
}

function notifyDraftChange(tool, change) {
  try {
    localStorage.setItem(DRAFT_CHANGE_PREFIX + tool, JSON.stringify(change));
  } catch {
    // Coordination is advisory; a blocked localStorage must not stop a draft
    // write that already committed in IndexedDB.
  }
}

/**
 * Subscribe to another tab saving or deleting this tool's draft. A live editor
 * intentionally keeps its own edits open; callers use this as an explicit
 * conflict warning, and the next local save deterministically wins.
 */
export function subscribeToDraftChanges(tool, listener) {
  if (typeof window === 'undefined') return () => {};
  const key = DRAFT_CHANGE_PREFIX + tool;
  const onStorage = (event) => {
    if (event.key !== key || !event.newValue) return;
    try {
      const change = JSON.parse(event.newValue);
      if (!change || change.writerId === getTabWriterId()
        || !Number.isInteger(change.revision) || change.revision < 0
        || (change.kind !== 'saved' && change.kind !== 'deleted')) return;
      listener({ revision: change.revision, kind: change.kind, conflictPolicy: 'last-writer-wins' });
    } catch {
      // Ignore a corrupt advisory record. IndexedDB remains authoritative.
    }
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

/** Stable content address for one source PDF. Null means this browser cannot
 * safely deduplicate; we fail the best-effort draft write rather than risk a
 * metadata collision attaching edits to a different document. */
export async function sourceIdForBytes(fileBytes) {
  // `instanceof ArrayBuffer` fails for a File read in a different browser
  // realm (and in the test DOM), even though Web Crypto accepts it.
  if (Object.prototype.toString.call(fileBytes) !== '[object ArrayBuffer]' || !globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', fileBytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

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
const DRAFT_HINT_PREFIX = 'pdf-toolkit:workspace:has-draft:';

// The home page's resume card needs more than "a draft exists": it names the
// file, dates it, and shows a page-1 preview. All three have to be readable
// *synchronously*, for the same reason the boolean hint does - the card sits
// above the dropzone, so learning about it after an async IndexedDB read would
// push the dropzone down after first paint, which is the exact layout shift
// the hint was invented to avoid.
//
// This is a second key rather than a richer value under DRAFT_HINT_PREFIX on
// purpose. Two readers hard-compare that value to the string '1'
// (hasDraftHint below, and ToolPageLayout.astro's blocking head script).
// Keeping the preview in a sibling key means changing its shape never affects
// the pre-paint decision.
const DRAFT_META_PREFIX = 'pdf-toolkit:workspace:draft-meta:';

// Recent files are deliberately a separate cache from drafts. A draft is the
// editable state for one tool and is replaced whenever that tool opens another
// PDF; a recent entry is just a recoverable copy of the source document that
// can be opened again from the home page. Keeping this index in localStorage
// makes the home-page list inexpensive to read, while the actual PDF bytes
// remain in IndexedDB.
const RECENT_FILES_META_KEY = 'pdf-toolkit:workspace:recent-files';
const RECENT_FILE_PREFIX = 'recent:';
export const MAX_RECENT_FILES = 6;

const recentFileKey = (id) => `${RECENT_FILE_PREFIX}${id}`;

/**
 * A PDF's byte hash is the authoritative cache key, but it cannot be the
 * only way the launcher recognizes one document. iOS file providers can hand
 * Safari the same visible file with a regenerated PDF wrapper (for example
 * after a Files share-sheet round trip). The pages look and are named exactly
 * the same, while their byte hashes differ, so hash-only deduplication showed
 * two copies of every document on the home screen.
 *
 * This is deliberately scoped to a tool: two unrelated PDFs named
 * "document.pdf" can still appear when they were opened in different tools,
 * while reopening a same-named document in one tool replaces its older recent
 * entry. NFC also makes provider-specific Unicode normalization invisible to
 * this comparison.
 */
export function recentDisplayKey(tool, fileName) {
  // Files and share sheets on iOS sometimes add directionality marks around
  // RTL names. They are invisible in the launcher, but made two visually
  // identical filenames compare differently. Collapse ordinary whitespace as
  // well: providers commonly turn a normal space into a no-break space.
  const name = typeof fileName === 'string'
    ? fileName
      .normalize('NFC')
      .replace(/[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g, '')
      .replace(/\s+/gu, ' ')
      .trim()
      .toLowerCase()
    : 'untitled document';
  return `${tool || ''}\u0000${name}`;
}

function writeRecentFiles(entries) {
  try {
    localStorage.setItem(RECENT_FILES_META_KEY, JSON.stringify(entries));
  } catch {
    // Recent documents are a convenience. A quota failure must not prevent a
    // PDF from opening or interfere with the editor's crash-recovery draft.
  }
}

function validRecentEntry(entry) {
  return entry && typeof entry === 'object'
    && typeof entry.id === 'string' && entry.id.length > 0
    && typeof entry.tool === 'string' && entry.tool.length > 0
    && typeof entry.fileName === 'string'
    && Number.isFinite(entry.savedAt)
    && !isDraftExpired(entry.savedAt);
}

function readRecentEntries() {
  try {
    const raw = localStorage.getItem(RECENT_FILES_META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seenIds = new Set();
    const seenDocuments = new Set();
    const entries = parsed
      .filter(validRecentEntry)
      .sort((a, b) => b.savedAt - a.savedAt)
      .filter((entry) => {
        const displayKey = recentDisplayKey(entry.tool, entry.fileName);
        if (seenIds.has(entry.id) || seenDocuments.has(displayKey)) return false;
        seenIds.add(entry.id);
        seenDocuments.add(displayKey);
        return true;
      })
      .slice(0, MAX_RECENT_FILES);
    // Expired or malformed entries must not leave an ever-growing stale index.
    if (entries.length !== parsed.length) writeRecentFiles(entries);
    return entries;
  } catch {
    return [];
  }
}

/** Synchronous metadata read for the home page. File bytes are never copied
 * into localStorage; they are loaded only after a person chooses an entry. */
export function readRecentFiles() {
  return readRecentEntries();
}

function removeRecentMeta(id) {
  const next = readRecentEntries().filter((entry) => entry.id !== id);
  writeRecentFiles(next);
}

/**
 * Save a source PDF in the bounded recent-files cache. Content hashes make a
 * repeated open of the same PDF update one entry instead of consuming another
 * of the six slots. The most recently used tool wins for that document.
 */
export async function cacheRecentFile(tool, record) {
  if (!hasIndexedDB() || !record?.fileBytes) return false;
  const id = await sourceIdForBytes(record.fileBytes).catch(() => null);
  if (!id) return false;
  const savedAt = Date.now();
  const displayKey = recentDisplayKey(tool, record.fileName);
  const existing = readRecentEntries();
  const previous = existing.find((entry) => entry.id === id || recentDisplayKey(entry.tool, entry.fileName) === displayKey);
  const entry = {
    id,
    tool,
    fileName: record.fileName || 'Untitled document',
    fileType: record.fileType || 'application/pdf',
    savedAt,
    ...(record.preview || previous?.preview ? { preview: record.preview || previous.preview } : {}),
  };
  // Prefer the just-opened file for its display identity too. This catches
  // iOS providers that recreate equivalent PDFs with different byte hashes.
  const entries = [entry, ...existing.filter((item) =>
    item.id !== id && recentDisplayKey(item.tool, item.fileName) !== displayKey,
  )];
  const kept = entries.slice(0, MAX_RECENT_FILES);
  try {
    await withStore('readwrite', (store) => {
      store.put({
        tool: recentFileKey(id),
        fileName: entry.fileName,
        fileType: entry.fileType,
        fileBytes: record.fileBytes,
        savedAt,
      });
      // Prune by walking cache records rather than only the entries evicted
      // in this write. That also clears old records whose local metadata
      // expired on a previous home-page visit, keeping binary storage truly
      // bounded to six PDFs.
      const keepKeys = new Set(kept.map((item) => recentFileKey(item.id)));
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const current = cursor.result;
        if (!current) return;
        if (typeof current.key === 'string' && current.key.startsWith(RECENT_FILE_PREFIX) && !keepKeys.has(current.key)) {
          current.delete();
        }
        current.continue();
      };
    });
    writeRecentFiles(kept);
    return true;
  } catch (e) {
    console.error('draftStore.cacheRecentFile failed:', e);
    return false;
  }
}

/** Load (without consuming) a recent source PDF selected on the home page. */
export async function loadRecentFile(id) {
  if (!hasIndexedDB() || typeof id !== 'string') return null;
  const entry = readRecentEntries().find((item) => item.id === id);
  if (!entry) return null;
  try {
    const record = await withStore('readonly', (store) => reqToPromise(store.get(recentFileKey(id))));
    if (!record?.fileBytes || isDraftExpired(record.savedAt)) {
      await withStore('readwrite', (store) => { store.delete(recentFileKey(id)); });
      removeRecentMeta(id);
      return null;
    }
    return { ...record, tool: entry.tool };
  } catch (e) {
    console.error('draftStore.loadRecentFile failed:', e);
    return null;
  }
}

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
 * Attach a page-1 preview to an existing draft's display metadata.
 *
 * The preview is rendered asynchronously (pdf.js is a dynamic import, so it
 * must never sit in front of the first autosave), which leaves a window where
 * a draft has been written with no preview and nothing later writes one: the
 * next save carries it, but only if there *is* a next save. Load a document,
 * change nothing, go back to the home page, and the resume card had a draft to
 * show and no thumbnail for it - permanently, since the preview only ever
 * arrived as a side effect of saving again.
 *
 * This closes that window without moving the render in front of the save. It
 * is deliberately hint-only: `preview` is display metadata and is stripped out
 * of the IndexedDB record by saveDraft, so the localStorage hint is the entire
 * store for it and there is nothing else to keep in step.
 *
 * No-ops when no draft hint exists for the tool. That check is the point
 * rather than a guard: without it, a preview that resolves after the draft was
 * cleared (Replace file, or expiry) would resurrect metadata for a document
 * that is gone, and the home page would offer to resume it.
 *
 * @param {string} tool - 'sign' | 'redact'
 * @param {string} preview - data URL
 * @returns {boolean} true if a hint existed and was updated
 */
export function attachDraftPreview(tool, preview) {
  if (!preview) return false;
  try {
    if (localStorage.getItem(DRAFT_HINT_PREFIX + tool) !== '1') return false;
    const raw = localStorage.getItem(DRAFT_META_PREFIX + tool);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || isDraftExpired(parsed.savedAt)) return false;
    if (parsed.preview === preview) return true;
    localStorage.setItem(DRAFT_META_PREFIX + tool, JSON.stringify({ ...parsed, preview }));
    return true;
  } catch {
    // Same bargain as setDraftHint: a quota error here costs a thumbnail, and
    // must not cost the draft.
    return false;
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
  const { preview, fileBytes, ...draft } = record;
  const sourceId = await sourceIdForBytes(fileBytes).catch(() => null);
  if (!sourceId) return false;
  const { savedAt } = createDraftRetention();
  const writerId = getTabWriterId();
  try {
    await withStore('readwrite', (drafts) => {
      // One transaction serializes same-user tabs. It reads the committed
      // revision immediately before assigning the next one, so two tabs that
      // started from revision N become N+1 then N+2 rather than racing under
      // the same revision.
      const oldRequest = drafts.get(tool);
      oldRequest.onsuccess = () => {
        const old = oldRequest.result;
        const oldMeta = old && Number.isInteger(old.revision)
          ? { revision: old.revision, updatedAt: old.updatedAt || 0, writerId: old.writerId || 'legacy' }
          : { revision: 0, updatedAt: 0, writerId: 'legacy' };
        const now = Date.now();
        const metadata = {
          revision: old ? oldMeta.revision + 1 : 1,
          updatedAt: Math.max(now, oldMeta.updatedAt + 1),
          writerId,
        };
        drafts.put({ ...draft, tool, fileBytes, sourceId, savedAt, ...metadata });
      };
    });
    setDraftHint(tool, { fileName: draft.fileName, savedAt, preview });
    // Obtain the persisted record's metadata without leaking source identity.
    const latest = await withStore('readonly', (store) => reqToPromise(store.get(tool)));
    if (latest?.writerId === writerId) {
      notifyDraftChange(tool, { kind: 'saved', revision: latest.revision, updatedAt: latest.updatedAt, writerId });
    }
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
    if (record.fileBytes) return record;
    clearDraftHint(tool);
    return null;
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
    const writerId = getTabWriterId();
    let change = null;
    await withStore('readwrite', (drafts) => {
      const request = drafts.get(tool);
      request.onsuccess = () => {
        const old = request.result;
        drafts.delete(tool);
        change = {
          kind: 'deleted', revision: (Number.isInteger(old?.revision) ? old.revision : 0) + 1,
          updatedAt: Date.now(), writerId,
        };
      };
    });
    clearDraftHint(tool);
    if (change) notifyDraftChange(tool, change);
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
