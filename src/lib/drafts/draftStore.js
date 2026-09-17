import { createDraftRetention, isDraftExpired } from './draftPolicy.js';

// Workspace-owned, on-device memory for every PDF a tool has touched. Uses
// IndexedDB (not localStorage) because a record holds the raw PDF bytes as an
// ArrayBuffer: localStorage is synchronous, string-only, and capped around 5MB,
// while IndexedDB stores binary via structured clone and is async. Everything here
// stays on the user's device — nothing is ever uploaded (see CLAUDE.md privacy
// invariants).
//
// One memory space, not two. Before MEM-01 a tool's in-progress edit (the
// "draft", one fixed slot per tool) and a recoverable copy of a source PDF (a
// "recent file") were separate records: a file being edited was stored twice,
// and opening a second file in the same tool silently overwrote the first
// one's edits. The unit now is the entry: one PDF (or, for Merge, one ordered
// set of PDFs), keyed by content hash (`sourceIdForBytes`/`sourceIdForFiles`),
// holding its bytes once and a `work` map of what every tool has done to it,
// `{ sign: {...}, redact: {...} }`, so the same file signed and then redacted
// keeps both. A tool's "current" entry is a per-tool pointer
// (`setCurrentEntry`/`readCurrentEntryId`), not a per-tool slot. A file in
// PDkef is never final; download and share do not close it.
//
// Eviction is recency only, six entries wide, whether or not an entry carries
// work: a file opened and left alone is as much "in progress" as an edited
// one (someone opens a form, goes to fetch what it asks for, comes back), so
// the store must not rank them. Age expiry stays at 14 days for every entry
// (`draftPolicy.js`, one `savedAt`, refreshed by opening or saving in any
// tool, never a frozen `expiresAt`). Those two rules are the only way an
// entry drops out, and both are deliberate.
//
// A record comes in two shapes for `fileBytes` vs `files`, same distinction
// as before: Sign and Redact's work is single-file (`fileBytes` on the
// entry); Merge's is an ordered `files` array. `saveDraft`/`loadDraft`
// dispatch on `Array.isArray(record.files)` to tell them apart; see
// `sourceIdForFiles` for how a multi-file entry gets its content address.
// `plan`/`options`/`outputName` (Merge) and `elements`/`extra` (Sign/Redact)
// are opaque to this module - it never reads their shape, only stores and
// returns them inside `work[tool]`.

// This is intentionally a fixed schema with no upgrade path. Safari can leave
// an installed app's previous page attached to an old database version, which
// turns an ordinary schema upgrade into an indefinitely blocked `open()`
// request. Fields may be added to a record without changing an IndexedDB
// object store, so this database never needs one; MEM-01's entry model is
// itself such a change (same DB, same store, same keyPath, just richer
// records under the keys already in use) and the legacy per-tool records
// are folded into it by `migrateLegacyDraft` below, not by a version bump.
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
 * Subscribe to another tab saving or deleting this tool's work on its current
 * entry. A live editor intentionally keeps its own edits open; callers use
 * this as an explicit conflict warning, and the next local save deterministically wins.
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
 * safely deduplicate; we fail the best-effort entry write rather than risk a
 * metadata collision attaching work to a different document. */
export async function sourceIdForBytes(fileBytes) {
  // `instanceof ArrayBuffer` fails for a File read in a different browser
  // realm (and in the test DOM), even though Web Crypto accepts it.
  if (Object.prototype.toString.call(fileBytes) !== '[object ArrayBuffer]' || !globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', fileBytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** Starting point for the Merge tool's entry size limit (MERGE-13). A merge
 * entry holds every source file's bytes at once, unlike Sign/Redact's single
 * file, so it can approach IndexedDB quota much sooner. 200 MB is a starting
 * number, not a measured ceiling - iOS Safari's real-world quota for this
 * origin needs measuring on-device before this is trusted as a safe default. */
export const MERGE_DRAFT_MAX_BYTES = 200 * 1024 * 1024;

/** Stable content address for an ordered set of source PDFs, for the Merge tool's
 * multi-file entry. Built from the per-file `sourceIdForBytes` digests rather than
 * hashing the concatenated bytes directly, so it stays cheap to compute for large
 * files (each file is hashed once, not copied into one buffer first).
 *
 * Order-sensitive on purpose: the files are hashed in the order they appear in
 * `files`, so the same set of files merged in a different order produces a
 * different id. That is correct here, not an accident to fix - a merge's output
 * depends on file order, so an entry for [A, B] must not be treated as resumable
 * for a session that has since reordered to [B, A].
 *
 * Null (like sourceIdForBytes) means this browser cannot safely deduplicate;
 * callers fail the write rather than risk a metadata collision.
 *
 * @param {{ fileBytes: ArrayBuffer }[]} files
 * @returns {Promise<string|null>}
 */
export async function sourceIdForFiles(files) {
  const digests = [];
  for (const file of files) {
    const id = await sourceIdForBytes(file?.fileBytes).catch(() => null);
    if (!id) return null;
    digests.push(id.slice('sha256:'.length));
  }
  if (!globalThis.crypto?.subtle) return null;
  const encoded = new TextEncoder().encode(digests.join('\n'));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

// Kept as a public re-export for existing callers. The policy itself lives in
// draftPolicy.js so cache writes and every read path share one definition.
export { MAX_AGE_MS } from './draftPolicy.js';

// A handoff is a baton, not an entry: the home page drops a PDF into it and the tool
// page picks it up one navigation later. Five minutes is far longer than a
// same-origin navigation and short enough that a handoff abandoned mid-flight
// cannot ambush a different session days later with a file it never asked for.
export const HANDOFF_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

// Handoffs live in the same store under their own key space, which is the whole
// point: the home page used to write the dropped file straight into the tool's
// draft key, and since a put() replaces the record, one drop silently destroyed
// whatever signing work was saved there - and wrote a record with no fileBytes, so
// the restore path skipped it and the dropped file was lost too. Nothing outside
// this file may write to a tool's entry on a tool's behalf.
const handoffKey = (tool) => `handoff:${tool}`;

/**
 * Park a dropped file for a tool to collect after the navigation that follows.
 * Stores the bytes, not the File: a File handle does not survive a page load, and
 * the receiving side rebuilds one from these fields.
 *
 * The Merge tool (MERGE-14) is a caller too, in the other direction from
 * Sign/Redact's home-page drop: it hands one *output* file off to 'compress',
 * 'sign' or 'split' after a merge, under that target tool's own key, so
 * `{ fileName, fileType, fileBytes }` is the whole contract regardless of
 * which tool wrote it or which tool is about to take it - a handoff carries
 * one file, never Merge's multi-file entry shape.
 *
 * @param {string} tool - 'sign' | 'redact' | 'compress' | 'split' (the target tool's key)
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
 * @param {string} tool - the target tool's own key, e.g. 'sign' when Merge (MERGE-14)
 *   hands its output there
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

// Which entry a tool currently considers "the one it's on", by id. Replaces
// the old has-draft/draft-meta pair: those said "a draft exists for this
// tool"; this says "here is the entry (if any) this tool is on", and every
// other synchronous read below (hasDraftHint, readDraftMeta) resolves through
// it against the recents index. Reading and writing the pointer never touches
// IndexedDB, for the same pre-paint reason the old hint didn't: a tool page
// needs this synchronously, before the async IndexedDB read and Preact
// hydration would otherwise decide it and cost a real, input-less layout
// shift. See ToolPageLayout.astro's blocking head script for the other half.
const CURRENT_ENTRY_PREFIX = 'pdf-toolkit:workspace:current:';

/** Point `tool` at entry `id`. Exported for MEM-02/03: the home page sets this
 * when it opens a recent tile, and saveDraft/cacheRecentFile set it here too. */
export function setCurrentEntry(tool, id) {
  try {
    localStorage.setItem(CURRENT_ENTRY_PREFIX + tool, id);
  } catch {
    // Best-effort, like every other localStorage write in this file.
  }
}

/** Drop `tool`'s pointer, e.g. once its work on that entry has been cleared. */
export function clearCurrentEntry(tool) {
  try {
    localStorage.removeItem(CURRENT_ENTRY_PREFIX + tool);
  } catch {
    // ditto
  }
}

/** The entry id `tool` currently points at, or null. Synchronous, best-effort -
 * the id may point at an entry that has since expired or been evicted; callers
 * that care use hasDraftHint/loadDraft, which check against the live index. */
export function readCurrentEntryId(tool) {
  try {
    return localStorage.getItem(CURRENT_ENTRY_PREFIX + tool) || null;
  } catch {
    return null;
  }
}

// The bounded recency cache: up to six entries' display metadata, readable
// without opening IndexedDB, which is what makes the home page's launcher
// cheap to render and makes hasDraftHint/readDraftMeta possible before first
// paint. The actual PDF bytes and `work` live only in IndexedDB; this index
// never carries them.
const RECENT_FILES_META_KEY = 'pdf-toolkit:workspace:recent-files';
const RECENT_FILE_PREFIX = 'recent:';
export const MAX_RECENT_FILES = 6;

const recentFileKey = (id) => `${RECENT_FILE_PREFIX}${id}`;

function writeRecentFiles(entries) {
  try {
    localStorage.setItem(RECENT_FILES_META_KEY, JSON.stringify(entries));
  } catch {
    // Recent documents are a convenience. A quota failure must not prevent a
    // PDF from opening or interfere with a tool's own work on it.
  }
}

function validIndexEntry(entry) {
  return entry && typeof entry === 'object'
    && typeof entry.id === 'string' && entry.id.length > 0
    && typeof entry.tool === 'string' && entry.tool.length > 0
    && typeof entry.fileName === 'string'
    && Number.isFinite(entry.savedAt)
    && !isDraftExpired(entry.savedAt);
}

function readIndexEntries() {
  try {
    const raw = localStorage.getItem(RECENT_FILES_META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    const entries = parsed
      .filter(validIndexEntry)
      .sort((a, b) => b.savedAt - a.savedAt)
      .filter((entry) => {
        if (seen.has(entry.id)) return false;
        seen.add(entry.id);
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
  return readIndexEntries();
}

function removeRecentMeta(id) {
  writeRecentFiles(readIndexEntries().filter((entry) => entry.id !== id));
}

/**
 * Upsert one entry's row in the recency index and cap it at MAX_RECENT_FILES,
 * ordered by `savedAt` alone - no ranking by whether an entry carries work
 * (see this file's header comment). The row is sorted in rather than
 * prepended: a save or open passes `Date.now()` and lands first anyway, but
 * a migrated legacy draft keeps its own, possibly days-old `savedAt`, and
 * must not push out something touched more recently. Returns the kept rows so
 * callers can prune IndexedDB records that fell out of them.
 */
function upsertIndexEntry({ id, tool, fileName, fileType, savedAt, preview, pageCount, fileCount, hasWork }) {
  const existing = readIndexEntries();
  const previous = existing.find((entry) => entry.id === id);
  const resolvedPreview = preview ?? previous?.preview;
  const resolvedPageCount = pageCount ?? previous?.pageCount;
  const resolvedFileCount = fileCount ?? previous?.fileCount;
  const row = {
    id,
    tool,
    fileName,
    fileType,
    savedAt,
    ...(resolvedPreview ? { preview: resolvedPreview } : {}),
    ...(resolvedPageCount !== undefined ? { pageCount: resolvedPageCount } : {}),
    ...(resolvedFileCount !== undefined ? { fileCount: resolvedFileCount } : {}),
    ...(hasWork && hasWork.length > 0 ? { hasWork } : {}),
  };
  const kept = [row, ...existing.filter((entry) => entry.id !== id)]
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_RECENT_FILES);
  writeRecentFiles(kept);
  return kept;
}

/** Patch just the `hasWork` field of an existing index row, e.g. after
 * deleteDraft clears one tool's work but the entry itself stays in recents.
 * A no-op if the row already fell out of the index (nothing to patch). */
function updateIndexHasWork(id, hasWorkKeys) {
  const entries = readIndexEntries();
  const index = entries.findIndex((entry) => entry.id === id);
  if (index === -1) return;
  const { hasWork: _hasWork, ...rest } = entries[index];
  const next = [...entries];
  next[index] = hasWorkKeys.length > 0 ? { ...rest, hasWork: hasWorkKeys } : rest;
  writeRecentFiles(next);
}

/** Delete IndexedDB entry records that fell out of the recency index -
 * mirrors cacheRecentFile's old cursor sweep, pulled out so saveDraft,
 * cacheRecentFile and the legacy migration all bound binary storage to the
 * same six PDFs the index already promises. Runs in its own transaction
 * (this is a best-effort convenience cache, not the source of truth for
 * content, so it does not need to share a transaction with the write that
 * triggered it). */
async function pruneOrphans(keptEntries) {
  const keepKeys = new Set(keptEntries.map((entry) => recentFileKey(entry.id)));
  try {
    await withStore('readwrite', (store) => {
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
  } catch (e) {
    console.error('draftStore.pruneOrphans failed:', e);
  }
}

/**
 * Save a source PDF in the bounded recents cache without touching any tool's
 * work on it. Content hashes make a repeated open of the same PDF update one
 * entry instead of consuming another of the six slots; an entry that already
 * carries work from another tool keeps it untouched.
 */
export async function cacheRecentFile(tool, record) {
  if (!hasIndexedDB() || !record?.fileBytes) return false;
  await ensureMigrated();
  const id = await sourceIdForBytes(record.fileBytes).catch(() => null);
  if (!id) return false;
  const savedAt = Date.now();
  const key = recentFileKey(id);
  let committedEntry = null;
  try {
    await withStore('readwrite', (store) => {
      const oldRequest = store.get(key);
      oldRequest.onsuccess = () => {
        const old = oldRequest.result;
        const entry = {
          tool: key,
          id,
          fileName: record.fileName || old?.fileName || 'Untitled document',
          fileType: record.fileType || old?.fileType || 'application/pdf',
          fileBytes: record.fileBytes,
          savedAt,
          work: old?.work || {},
        };
        store.put(entry);
        committedEntry = entry;
      };
    });
  } catch (e) {
    console.error('draftStore.cacheRecentFile failed:', e);
    return false;
  }
  const kept = upsertIndexEntry({
    id,
    tool,
    fileName: committedEntry.fileName,
    fileType: committedEntry.fileType,
    savedAt,
    preview: record.preview,
    hasWork: Object.keys(committedEntry.work),
  });
  await pruneOrphans(kept);
  setCurrentEntry(tool, id);
  return true;
}

/** Load (without consuming) a recent source PDF selected on the home page. The
 * returned record now includes `work`, since an entry is no longer just a
 * cached source - see this file's header comment. */
export async function loadRecentFile(id) {
  if (!hasIndexedDB() || typeof id !== 'string') return null;
  await ensureMigrated();
  const meta = readIndexEntries().find((item) => item.id === id);
  if (!meta) return null;
  const key = recentFileKey(id);
  try {
    const record = await withStore('readonly', (store) => reqToPromise(store.get(key)));
    const usable = record && (
      record.fileBytes
      || (Array.isArray(record.files) && record.files.length > 0 && record.files.every((file) => file?.fileBytes))
    );
    if (!usable || isDraftExpired(record.savedAt)) {
      await withStore('readwrite', (store) => { store.delete(key); });
      removeRecentMeta(id);
      return null;
    }
    return { ...record, tool: meta.tool };
  } catch (e) {
    console.error('draftStore.loadRecentFile failed:', e);
    return null;
  }
}

/**
 * Attach a page-1 preview to the index row for whatever entry `tool` currently
 * points at.
 *
 * The preview is rendered asynchronously (pdf.js is a dynamic import, so it
 * must never sit in front of the first autosave), which leaves a window where
 * an entry has been written with no preview and nothing later writes one: the
 * next save carries it, but only if there *is* a next save. Load a document,
 * change nothing, go back to the home page, and the resume card had an entry
 * to show and no thumbnail for it - permanently, since the preview only ever
 * arrived as a side effect of saving again.
 *
 * This closes that window without moving the render in front of the save. It
 * is deliberately index-only: `preview` is display metadata and is never part
 * of the IndexedDB record, so the index row is the entire store for it and
 * there is nothing else to keep in step.
 *
 * No-ops when `tool` has no current entry, or that entry has fallen out of
 * the index. That check is the point rather than a guard: without it, a
 * preview that resolves after the pointer moved on (Replace file, or expiry)
 * would resurrect metadata for a document the tool is no longer on.
 *
 * @param {string} tool - 'sign' | 'redact' | 'merge'
 * @param {string} preview - data URL
 * @returns {boolean} true if an entry existed and was updated
 */
export function attachDraftPreview(tool, preview) {
  if (!preview) return false;
  try {
    const id = readCurrentEntryId(tool);
    if (!id) return false;
    const entries = readIndexEntries();
    const index = entries.findIndex((entry) => entry.id === id);
    if (index === -1) return false;
    if (entries[index].preview === preview) return true;
    const next = [...entries];
    next[index] = { ...next[index], preview };
    writeRecentFiles(next);
    return true;
  } catch {
    // Same bargain as upsertIndexEntry: a quota error here costs a thumbnail,
    // and must not cost the entry.
    return false;
  }
}

/**
 * Synchronous, best-effort read of the entry `tool` currently points at,
 * shaped as display metadata for the home page's resume card: name, date, a
 * page-1 preview, and (for Merge) a page count. No IndexedDB open - the index
 * row already carries everything a card needs.
 *
 * Advisory only, exactly like hasDraftHint - the IndexedDB record stays the
 * source of truth, and this can lag it if a write was dropped on quota. A
 * caller that acts on this must therefore tolerate the entry turning out not
 * to exist; FileDropzone does, by handing the tool a plain navigation and
 * letting the tool's own restore decide.
 *
 * @param {string} tool
 * @returns {{ fileName?: string, savedAt?: number, preview?: string, pageCount?: number, fileCount?: number }|null}
 */
export function readDraftMeta(tool) {
  try {
    const id = readCurrentEntryId(tool);
    if (!id) return null;
    const entry = readIndexEntries().find((item) => item.id === id);
    if (!entry) return null;
    return {
      fileName: entry.fileName, savedAt: entry.savedAt, preview: entry.preview,
      pageCount: entry.pageCount, fileCount: entry.fileCount,
    };
  } catch {
    return null;
  }
}

/**
 * Synchronous, best-effort read of the same thing ToolPageLayout.astro's
 * pre-paint script reads: "tool's current entry probably still exists".
 * Exported so useDraftPersistence.js can decide, before its first render,
 * whether it is worth holding the caller in a "checking" state at all - a
 * visitor with no pointer gets today's behaviour (empty state immediately),
 * so this can never add a wait where there wasn't already something to wait for.
 *
 * True means "tool's pointer is set and the recency index still lists that
 * entry" - it says nothing about whether the entry actually has `work[tool]`
 * on it, only that there is something to try restoring.
 *
 * The two readers must agree. The head script keeps its pre-paint restore
 * marker when the index is unparseable (the index is an optimisation, the
 * IndexedDB record is the truth), so this returns true there too. When it
 * said false while the marker was set, Merge's island took "not restoring,
 * no files" at face value and dropped the marker before IndexedDB answered,
 * which revealed the page and then pushed everything down as the grid
 * mounted (QUAL-10).
 *
 * @param {string} tool
 * @returns {boolean}
 */
export function hasDraftHint(tool) {
  try {
    const id = readCurrentEntryId(tool);
    if (!id) return false;
    if (!indexIsParseable()) return true;
    return readIndexEntries().some((entry) => entry.id === id);
  } catch {
    return false;
  }
}

function indexIsParseable() {
  try {
    JSON.parse(localStorage.getItem(RECENT_FILES_META_KEY) || '[]');
    return true;
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

// Run a single transaction against the workspace store and resolve with `resultFn`'s
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

// Shared by saveDraft and the legacy migration: given the work currently
// committed for this tool on an entry (or undefined/null if there is none
// yet), compute the next revision/updatedAt/writerId triple. Pulled out as a
// pure function, not a behaviour change, so every place that assigns a
// revision cannot drift on how - the actual read-then-put still happens
// inside each caller's own single transaction.
function nextDraftRevision(old, writerId) {
  const oldMeta = old && Number.isInteger(old.revision)
    ? { revision: old.revision, updatedAt: old.updatedAt || 0, writerId: old.writerId || 'legacy' }
    : { revision: 0, updatedAt: 0, writerId: 'legacy' };
  const now = Date.now();
  return {
    revision: old ? oldMeta.revision + 1 : 1,
    updatedAt: Math.max(now, oldMeta.updatedAt + 1),
    writerId,
  };
}

/**
 * Save one tool's work into its current entry, creating the entry if this is
 * the first save for this content. Silently no-ops if IndexedDB is
 * unavailable - persistence is best-effort and must never break the tool itself.
 *
 * `record` is the shape a tool already builds: Sign/Redact pass
 * `{ fileName, fileType, fileBytes, elements, extra, preview, schemaVersion,
 * fileSize?, fileLastModified? }`; Merge (`Array.isArray(record.files)`)
 * passes `{ files, plan, options, fileName, outputName?, pageCount?,
 * fileCount?, preview?, schemaVersion }`. Everything but `preview`,
 * `fileBytes`/`files`, `fileName` and `fileType` is opaque to this module and
 * is stored verbatim under `work[tool]` alongside the revision metadata - see
 * this file's header comment.
 *
 * @param {string} tool - 'sign' | 'redact' | 'merge'
 * @param {object} record
 * @returns {Promise<boolean>} true if written
 */
export async function saveDraft(tool, record) {
  if (!hasIndexedDB()) return false;
  await ensureMigrated();
  const isMulti = Array.isArray(record.files);
  if (isMulti) {
    // Nothing to merge, nothing to resume: refuse rather than write a
    // partial entry.
    if (record.files.length === 0) return false;
    // A merge entry holds every source file's bytes at once, so it can
    // approach IndexedDB quota far sooner than a single-document entry ever
    // could (MERGE-13's honest limit).
    const totalBytes = record.files.reduce((sum, file) => sum + (file?.fileBytes?.byteLength || 0), 0);
    if (totalBytes > MERGE_DRAFT_MAX_BYTES) return false;
  }
  // `preview` is display metadata for the home page, not part of an entry's
  // work: it lives in the recency index (see upsertIndexEntry) because it
  // has to be readable synchronously, and keeping it out of `work[tool]`
  // avoids storing the same image twice.
  const { preview, fileBytes, files, fileName, fileType, ...toolFields } = record;
  const id = isMulti
    ? await sourceIdForFiles(files).catch(() => null)
    : await sourceIdForBytes(fileBytes).catch(() => null);
  if (!id) return false;
  const { savedAt } = createDraftRetention();
  const writerId = getTabWriterId();
  const key = recentFileKey(id);
  let committedEntry = null;
  try {
    await withStore('readwrite', (store) => {
      // One transaction serializes same-user tabs. It reads the committed
      // entry immediately before assigning the next revision, so two tabs
      // that started from revision N become N+1 then N+2 rather than racing
      // under the same revision. It also carries forward every *other*
      // tool's work already on this entry - saveDraft only ever touches its
      // own `tool` key inside `work`.
      const oldRequest = store.get(key);
      oldRequest.onsuccess = () => {
        const old = oldRequest.result;
        const oldWork = old?.work || {};
        const metadata = nextDraftRevision(oldWork[tool], writerId);
        const toolWork = { ...toolFields, ...metadata };
        const entry = {
          tool: key,
          id,
          fileName: fileName || old?.fileName || 'Untitled document',
          fileType: fileType || old?.fileType || 'application/pdf',
          ...(isMulti ? { files } : { fileBytes }),
          savedAt,
          work: { ...oldWork, [tool]: toolWork },
        };
        store.put(entry);
        committedEntry = entry;
      };
    });
  } catch (e) {
    console.error('draftStore.saveDraft failed:', e);
    return false;
  }
  const kept = upsertIndexEntry({
    id,
    tool,
    fileName: committedEntry.fileName,
    fileType: committedEntry.fileType,
    savedAt,
    preview,
    pageCount: toolFields.pageCount,
    fileCount: toolFields.fileCount,
    hasWork: Object.keys(committedEntry.work),
  });
  await pruneOrphans(kept);
  setCurrentEntry(tool, id);
  // A prior file or edit may have completed after this write started. Obtain
  // the persisted work's own metadata rather than trusting what we just
  // built, and only notify if it is still current - the same guard the
  // single-transaction serialization above makes meaningful.
  try {
    const latest = await withStore('readonly', (store) => reqToPromise(store.get(key)));
    const latestWork = latest?.work?.[tool];
    if (latestWork?.writerId === writerId) {
      notifyDraftChange(tool, { kind: 'saved', revision: latestWork.revision, updatedAt: latestWork.updatedAt, writerId });
    }
  } catch {
    // Notification is advisory; a failed re-read must not undo an
    // already-committed save.
  }
  return true;
}

/**
 * Load the entry `tool` currently points at, or null. Records whose entry has
 * gone stale (older than MAX_AGE_MS) are treated as absent and deleted
 * outright - that timestamp is per entry, not per tool's work on it, so its
 * expiry takes every tool's work on that file with it (see this file's
 * header comment on why that is the one place an entry may still drop out).
 *
 * @param {string} tool
 * @returns {Promise<object|null>} `{ fileName, fileType, fileBytes|files,
 *   sourceId, savedAt, ...work[tool] }` if there is a current entry, even one
 *   with no work[tool] yet (a file that was opened but never edited is still
 *   the tool's current file); null otherwise.
 */
export async function loadDraft(tool) {
  // No IndexedDB means no entry ever gets written by this module, so any
  // pointer still sitting in localStorage (from a previous browser/profile
  // whose export got copied, say) cannot correspond to a real record here -
  // clear it rather than let it keep pre-collapsing a hero with nothing to
  // restore.
  if (!hasIndexedDB()) {
    clearCurrentEntry(tool);
    return null;
  }
  await ensureMigrated();
  const id = readCurrentEntryId(tool);
  if (!id) return null;
  const key = recentFileKey(id);
  try {
    const entry = await withStore('readonly', (store) => reqToPromise(store.get(key)));
    if (!entry) {
      clearCurrentEntry(tool);
      return null;
    }
    if (isDraftExpired(entry.savedAt)) {
      // Expiry drops every tool's work, not just this one's, so it bypasses
      // deleteDraft; the cross-tab signal still goes out so a peer tab that
      // has this entry open learns it is gone, as it did before MEM-01.
      await withStore('readwrite', (store) => { store.delete(key); });
      removeRecentMeta(id);
      clearCurrentEntry(tool);
      const old = entry.work?.[tool];
      notifyDraftChange(tool, {
        kind: 'deleted', revision: (Number.isInteger(old?.revision) ? old.revision : 0) + 1,
        updatedAt: Date.now(), writerId: getTabWriterId(),
      });
      return null;
    }
    const work = entry.work?.[tool] || {};
    if (entry.fileBytes) {
      return {
        fileName: entry.fileName, fileType: entry.fileType, fileBytes: entry.fileBytes,
        sourceId: id, savedAt: entry.savedAt, ...work,
      };
    }
    // Merge's multi-file shape: usable only if every file still carries its
    // bytes. A `files: []` or a file missing `fileBytes` is corrupt in the
    // same sense a single-file entry with no `fileBytes` is - treat it as no
    // entry rather than hand a tool a record it cannot restore from. Only
    // this tool's pointer is at fault here, not the entry itself (another
    // tool's work on it may be fine), so drop the pointer without touching
    // the stored record.
    if (Array.isArray(entry.files) && entry.files.length > 0 && entry.files.every((file) => file?.fileBytes)) {
      return {
        fileName: entry.fileName, fileType: entry.fileType, files: entry.files,
        sourceId: id, savedAt: entry.savedAt, ...work,
      };
    }
    clearCurrentEntry(tool);
    return null;
  } catch (e) {
    console.error('draftStore.loadDraft failed:', e);
    clearCurrentEntry(tool);
    return null;
  }
}

/**
 * Clear `tool`'s work on the entry it currently points at, and drop the
 * pointer. The entry itself, its bytes, and every *other* tool's work on it
 * stay in recents - this no longer removes any file from the memory space,
 * unlike the old per-tool delete it replaces (Replace file used to mean
 * "this file is gone"; now it only ever means "I'm not editing it right now").
 * @param {string} tool
 * @returns {Promise<boolean>}
 */
export async function deleteDraft(tool) {
  if (!hasIndexedDB()) return false;
  await ensureMigrated();
  const id = readCurrentEntryId(tool);
  if (!id) {
    clearCurrentEntry(tool);
    return true;
  }
  const writerId = getTabWriterId();
  const key = recentFileKey(id);
  let change = null;
  let remainingWorkKeys = null;
  try {
    await withStore('readwrite', (store) => {
      const request = store.get(key);
      request.onsuccess = () => {
        const entry = request.result;
        if (!entry?.work || !(tool in entry.work)) return;
        const oldToolWork = entry.work[tool];
        const { [tool]: _removed, ...restWork } = entry.work;
        store.put({ ...entry, work: restWork });
        remainingWorkKeys = Object.keys(restWork);
        change = {
          kind: 'deleted',
          revision: (Number.isInteger(oldToolWork?.revision) ? oldToolWork.revision : 0) + 1,
          updatedAt: Date.now(),
          writerId,
        };
      };
    });
  } catch (e) {
    console.error('draftStore.deleteDraft failed:', e);
    return false;
  }
  if (remainingWorkKeys) updateIndexHasWork(id, remainingWorkKeys);
  clearCurrentEntry(tool);
  if (change) notifyDraftChange(tool, change);
  return true;
}

// Legacy keys from the pre-MEM-01 schema (one draft record per tool, keyed
// literally by tool name, plus these two localStorage keys for its
// pre-paint hint). Kept only so migrateLegacyDraft can find and clear them -
// nothing in this file writes them again.
const LEGACY_DRAFT_HINT_PREFIX = 'pdf-toolkit:workspace:has-draft:';
const LEGACY_DRAFT_META_PREFIX = 'pdf-toolkit:workspace:draft-meta:';
const LEGACY_TOOLS = ['sign', 'redact', 'merge'];

function clearLegacyLocalStorage(tool) {
  try { localStorage.removeItem(LEGACY_DRAFT_HINT_PREFIX + tool); } catch { /* best-effort */ }
  try { localStorage.removeItem(LEGACY_DRAFT_META_PREFIX + tool); } catch { /* best-effort */ }
}

let migratedPromise = null;

// Runs the fold-in exactly once per module lifetime (memoised, not per call).
// Every other async export awaits this first, so a legacy record can never
// shadow or race a write already made under the new schema. Synchronous
// reads (hasDraftHint, readDraftMeta, readRecentFiles) do not wait on it:
// they are already best-effort/advisory, and gating a synchronous API on an
// async migration would defeat the reason they are synchronous at all - a
// pre-migration read just sees fewer entries until the fold-in lands.
function ensureMigrated() {
  if (!hasIndexedDB()) return Promise.resolve();
  if (!migratedPromise) {
    // Sequential, not Promise.all: each migration reads-then-writes the
    // same localStorage index, and running the three concurrently would let
    // one overwrite another's update with a snapshot taken before it landed.
    migratedPromise = (async () => {
      for (const tool of LEGACY_TOOLS) {
        // eslint-disable-next-line no-await-in-loop -- deliberately sequential, see above
        await migrateLegacyDraft(tool);
      }
    })().catch((e) => {
      console.error('draftStore.migrateLegacyDrafts failed:', e);
    });
  }
  return migratedPromise;
}

// Folds one legacy per-tool draft (keyed literally by 'sign' | 'redact' |
// 'merge', the schema this file used before MEM-01) into its recents entry:
// attaches `work[tool]` to the entry if one already exists for this content,
// otherwise creates the entry from the legacy record's own bytes/files and
// fileName. Sets the pointer for `tool` and deletes the legacy record and its
// localStorage hint either way. An expired legacy record, or one whose
// content cannot be addressed, is simply deleted (MEM-01's ticket: "Legacy
// records that are expired are simply deleted").
async function migrateLegacyDraft(tool) {
  let legacy;
  try {
    legacy = await withStore('readonly', (store) => reqToPromise(store.get(tool)));
  } catch (e) {
    console.error('draftStore.migrateLegacyDraft failed to read:', e);
    return;
  }
  if (!legacy) return;
  clearLegacyLocalStorage(tool);
  if (isDraftExpired(legacy.savedAt)) {
    try {
      await withStore('readwrite', (store) => { store.delete(tool); });
    } catch (e) {
      console.error('draftStore.migrateLegacyDraft failed to delete an expired record:', e);
    }
    return;
  }
  const isMulti = Array.isArray(legacy.files);
  const id = isMulti
    ? await sourceIdForFiles(legacy.files).catch(() => null)
    : await sourceIdForBytes(legacy.fileBytes).catch(() => null);
  if (!id) {
    // Cannot safely address this record's bytes - drop it rather than leak
    // it forever, the same refusal saveDraft itself would make on a fresh write.
    try {
      await withStore('readwrite', (store) => { store.delete(tool); });
    } catch (e) {
      console.error('draftStore.migrateLegacyDraft failed to delete an unaddressable record:', e);
    }
    return;
  }
  const {
    tool: _legacyKey, fileBytes, files, savedAt, revision, updatedAt, writerId,
    sourceId: _sourceId, fileName: _fileName, fileType: _fileType, ...toolFields
  } = legacy;
  // Carries the legacy revision/updatedAt/writerId over as-is: this is a
  // straight fold-in, not a new save, so nothing here bumps the revision.
  const toolWork = {
    ...toolFields,
    revision: Number.isInteger(revision) ? revision : 1,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : savedAt,
    writerId: writerId || 'legacy',
  };
  const key = recentFileKey(id);
  let committedEntry = null;
  try {
    await withStore('readwrite', (store) => {
      store.delete(tool);
      const request = store.get(key);
      request.onsuccess = () => {
        const existing = request.result;
        const work = { ...(existing?.work || {}), [tool]: toolWork };
        const entry = existing
          ? { ...existing, work, savedAt: Math.max(existing.savedAt, savedAt) }
          : {
              tool: key,
              id,
              fileName: legacy.fileName || 'Untitled document',
              fileType: legacy.fileType || 'application/pdf',
              ...(isMulti ? { files } : { fileBytes }),
              savedAt,
              work,
            };
        store.put(entry);
        committedEntry = entry;
      };
    });
  } catch (e) {
    console.error('draftStore.migrateLegacyDraft failed to write:', e);
    return;
  }
  if (!committedEntry) return;
  const kept = upsertIndexEntry({
    id,
    tool,
    fileName: committedEntry.fileName,
    fileType: committedEntry.fileType,
    savedAt: committedEntry.savedAt,
    pageCount: toolFields.pageCount,
    fileCount: toolFields.fileCount,
    hasWork: Object.keys(committedEntry.work),
  });
  await pruneOrphans(kept);
  setCurrentEntry(tool, id);
}
