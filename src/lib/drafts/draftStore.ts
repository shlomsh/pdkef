import { createDraftRetention, isDraftExpired } from './draftPolicy.js';
import { markHandoffPending } from '../handoff/handoffPending.ts';
import { RECENT_FILES_META_KEY } from './recentFilesKey.js';
import { parseDraftRecord, parseHandoff, parseStoredEntry } from './draftRecords.ts';
import type {
  DraftEntry, DraftFile, DraftRecord, DraftSaveRecord, HandoffFile, HandoffRecord,
  RecentFileRecord, StoredEntry, ToolWork,
} from './draftRecords.ts';
import { hasIndexedDB, reportStoreError, reqToPromise, withStore } from './draftIdb.ts';
import { DRAFT_CHANGE_PREFIX, getTabWriterId, notifyDraftChange } from './draftChanges.ts';
import type { DraftChange } from './draftChanges.ts';
import { clearCurrentEntry, pruneOrphans, readCurrentEntryId, readIndexEntries, recentFileKey, removeRecentMeta, setCurrentEntry, upsertIndexEntry, updateIndexHasWork, writeRecentFiles } from './draftRecentIndex.ts';
import { sourceIdForBytes, sourceIdForFiles } from './draftSourceId.ts';
import { ensureMigrated } from './draftMigration.ts';

export type {
  DraftEntry, DraftFile, DraftRecord, DraftSaveRecord, HandoffFile, HandoffRecord, RecentFileRecord,
  StoredEntry, ToolWork,
} from './draftRecords.ts';
export { parseDraftRecord, parseHandoff, parseStoredEntry } from './draftRecords.ts';
// Moved out for size (ARCH-107); the public surface of this module is unchanged.
export { sourceIdForBytes, sourceIdForFiles } from './draftSourceId.ts';
export { MAX_RECENT_FILES, clearCurrentEntry, readCurrentEntryId, setCurrentEntry } from './draftRecentIndex.ts';

type DraftChangeEvent = { revision: number; kind: 'saved' | 'deleted'; conflictPolicy: 'last-writer-wins' };


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
// the store must not rank them. Age expiry stays at 28 days for every entry
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



/**
 * Subscribe to another tab saving or deleting this tool's work on its current
 * entry. A live editor intentionally keeps its own edits open; callers use
 * this as an explicit conflict warning, and the next local save deterministically wins.
 */
export function subscribeToDraftChanges(tool: string, listener: (change: DraftChangeEvent) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const key = DRAFT_CHANGE_PREFIX + tool;
  const onStorage = (event: StorageEvent) => {
    if (event.key !== key || !event.newValue) return;
    try {
      const change = JSON.parse(event.newValue);
      if (!change || change.writerId === getTabWriterId()
        || !Number.isInteger(change.revision) || change.revision < 0
        || (change.kind !== 'saved' && change.kind !== 'deleted')) return;
      listener({ revision: change.revision, kind: change.kind, conflictPolicy: 'last-writer-wins' });
    } catch {
      // expected: Ignore a corrupt advisory record. IndexedDB remains authoritative.
    }
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}


/** Starting point for the Merge tool's entry size limit (MERGE-13). A merge
 * entry holds every source file's bytes at once, unlike Sign/Redact's single
 * file, so it can approach IndexedDB quota much sooner. 200 MB is a starting
 * number, not a measured ceiling - iOS Safari's real-world quota for this
 * origin needs measuring on-device before this is trusted as a safe default. */
export const MERGE_DRAFT_MAX_BYTES = 200 * 1024 * 1024;


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
const handoffKey = (tool: string) => `handoff:${tool}`;
// One file, or (SITE-42) a non-empty `files` list where every entry has its bytes.
const isValidHandoff = (record: HandoffRecord) =>
  Array.isArray(record.files)
    ? record.files.length > 0 && record.files.every((f) => f && f.fileBytes)
    : Boolean(record.fileBytes);

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
 * one file, or (SITE-42, the home page's launcher handing several picked files to
 * Merge or Image to PDF) a `files` list in pick order.
 *
 * `tool` is 'sign' | 'redact' | 'compress' | 'split' (the target tool's key).
 * `from` names the sending tool when the hand-off is a detour the person will come back from:
 * Redact sends a protected file to Unlock with `from: 'redact'`, and Unlock leads back there
 * (docs/ux-design-guidelines.md section 13). Receivers that do not use it ignore it.
 * Resolves true if written.
 */
export async function saveHandoff(
  tool: string,
  record:
    | { fileName: string; fileType?: string; fileBytes: ArrayBuffer; from?: string }
    | { files: HandoffFile[]; from?: string },
): Promise<boolean> {
  if (!hasIndexedDB()) return false;
  try {
    await withStore('readwrite', (store) => {
      store.put({ ...record, tool: handoffKey(tool), savedAt: Date.now() });
    });
    // The page this hand-off opens reads this before it paints (handoffPending.ts).
    markHandoffPending(tool);
    return true;
  } catch (e) {
    reportStoreError('handoff', e, 'save_handoff');
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
 * Returns the record only if it is a valid single record (has `fileBytes`) or a valid
 * multi record (a non-empty `files` list, every entry with `fileBytes`). A multi record
 * reaches only tools that take several files (Merge, Image to PDF) or the hooks in
 * useHandoffIntake.ts.
 *
 * `tool` is the target tool's own key, e.g. 'sign' when Merge (MERGE-14) hands its output there.
 * `accept`, when given, leaves a valid record it returns false for in place, not consumed
 * (src/lib/handoff/handoffKinds.ts: one key, two pages).
 */
export async function takeHandoff(tool: string, accept?: (record: HandoffRecord) => boolean): Promise<HandoffRecord | null> {
  if (!hasIndexedDB()) return null;
  const key = handoffKey(tool);
  try {
    const stored = await withStore('readonly', (store) => reqToPromise(store.get(key)));
    if (!stored) return null;
    // Stored but not an object: an invalid record, consumed below like any other.
    const record = parseHandoff(stored) ?? {};
    const fresh = !(typeof record.savedAt === 'number' && Date.now() - record.savedAt > HANDOFF_MAX_AGE_MS);
    // A valid record the asker does not take stays for the page it is meant for (one key can open
    // two pages, e.g. Compress and Compress Image); it still ages out through the check above.
    if (fresh && isValidHandoff(record) && accept && !accept(record)) return null;
    await withStore('readwrite', (store) => {
      store.delete(key);
    });
    return fresh && isValidHandoff(record) ? record : null;
  } catch (e) {
    reportStoreError('handoff', e, 'take_handoff');
    console.error('draftStore.takeHandoff failed:', e);
    return null;
  }
}


/** Synchronous metadata read for the home page. File bytes are never copied
 * into localStorage; they are loaded only after a person chooses an entry. */
export function readRecentFiles(): DraftEntry[] {
  return readIndexEntries();
}


/**
 * Save a source PDF in the bounded recents cache without touching any tool's
 * work on it. Content hashes make a repeated open of the same PDF update one
 * entry instead of consuming another of the six slots; an entry that already
 * carries work from another tool keeps it untouched.
 */
export async function cacheRecentFile(tool: string, record: DraftSaveRecord | null | undefined): Promise<boolean> {
  if (!hasIndexedDB() || !record?.fileBytes) return false;
  await ensureMigrated();
  // expected: crypto.subtle missing, returns false
  const id = await sourceIdForBytes(record.fileBytes).catch(() => null);
  if (!id) return false;
  const savedAt = Date.now();
  const key = recentFileKey(id);
  let committedEntry: StoredEntry | null = null;
  try {
    await withStore('readwrite', (store) => {
      const oldRequest = store.get(key);
      oldRequest.onsuccess = () => {
        const old = parseStoredEntry(oldRequest.result);
        const entry: StoredEntry = {
          tool: key,
          id,
          fileName: record!.fileName || old?.fileName || 'Untitled document',
          fileType: record!.fileType || old?.fileType || 'application/pdf',
          fileBytes: record!.fileBytes,
          savedAt,
          work: old?.work || {},
        };
        store.put(entry);
        committedEntry = entry;
      };
    });
  } catch (e) {
    reportStoreError('drafts', e, 'cache_recent_file');
    console.error('draftStore.cacheRecentFile failed:', e);
    return false;
  }
  const entry = committedEntry as unknown as StoredEntry;
  const kept = upsertIndexEntry({
    id,
    tool,
    fileName: entry.fileName,
    fileType: entry.fileType,
    savedAt,
    preview: record.preview,
    hasWork: Object.keys(entry.work || {}),
  });
  await pruneOrphans(kept);
  setCurrentEntry(tool, id);
  return true;
}

/** Load (without consuming) a recent source PDF selected on the home page. The
 * returned record now includes `work`, since an entry is no longer just a
 * cached source - see this file's header comment. */
export async function loadRecentFile(id: unknown): Promise<RecentFileRecord | null> {
  if (!hasIndexedDB() || typeof id !== 'string') return null;
  await ensureMigrated();
  const meta = readIndexEntries().find((item) => item.id === id);
  if (!meta) return null;
  const key = recentFileKey(id);
  try {
    const record = parseStoredEntry(await withStore('readonly', (store) => reqToPromise(store.get(key))));
    const usable = record && (
      record.fileBytes
      || (Array.isArray(record.files) && record.files.length > 0 && record.files.every((file) => file?.fileBytes))
    );
    if (!record || !usable || isDraftExpired(record.savedAt)) {
      await withStore('readwrite', (store) => { store.delete(key); });
      removeRecentMeta(id);
      return null;
    }
    return { ...record, tool: meta.tool };
  } catch (e) {
    reportStoreError('drafts', e, 'load_recent_file');
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
 * `tool` is 'sign' | 'redact' | 'merge'; `preview` is a data URL. Returns true if an entry existed and was updated.
 */
export function attachDraftPreview(tool: string, preview: string): boolean {
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
    // expected: Same bargain as upsertIndexEntry: a quota error here costs a thumbnail,
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
 */
export function readDraftMeta(
  tool: string,
): { fileName?: string; savedAt?: number; preview?: string; pageCount?: number; fileCount?: number } | null {
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
    // expected: sync best-effort read
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
 */
export function hasDraftHint(tool: string): boolean {
  try {
    const id = readCurrentEntryId(tool);
    if (!id) return false;
    if (!indexIsParseable()) return true;
    return readIndexEntries().some((entry) => entry.id === id);
  } catch {
    // expected: sync best-effort read
    return false;
  }
}

function indexIsParseable() {
  try {
    JSON.parse(localStorage.getItem(RECENT_FILES_META_KEY) || '[]');
    return true;
  } catch {
    // expected: parse probe, an unparseable index means no hint
    return false;
  }
}

// Ask the browser to stop treating this origin's storage as disposable.
//
// Without this, everything here is "best-effort": the browser may evict the
// whole database whenever it likes, and the person is never told. That is not
// theoretical. It was reported from an installed iOS home-screen app where the
// "Draft saved" line had appeared - the write had genuinely succeeded, and the
// work was gone on reopening anyway, because saving and *keeping* are two
// different promises and we had only ever made the first.
//
// Fires on the first successful `saveDraft`, not on every `openDb` (this used
// to live there). Two reasons: `openDb` also runs for a plain read -
// `loadDraft`, `cacheRecentFile`, the legacy migration - so a visitor who
// never saves anything would trigger a permission request for nothing; and on
// a browser that does show a prompt for this, it now appears immediately
// after the app has just said it saved something, which is the one moment
// this is self-explanatory rather than random.
//
// Deliberately fire-and-forget, and deliberately not awaited by any caller:
// a save must never wait on a permission prompt, and a browser that refuses
// (or has no Storage API at all) must lose nothing but the guarantee. Runs
// once per module lifetime, so it costs nothing beyond the first successful
// save. Note Safari decides this by its own heuristics rather than by asking,
// so a `false` here is normal and not an error worth reporting - it means the
// same best-effort storage we already had.
let persistenceRequested = false;
function requestStoragePersistence() {
  if (persistenceRequested) return;
  persistenceRequested = true;
  try {
    // expected: optional browser API, false is normal
    navigator?.storage?.persist?.().catch(() => {});
  } catch {
    // expected: No Storage API, or a browser that throws on it. Nothing to do: the
    // tools keep working on best-effort storage exactly as before.
  }
}

/**
 * Whether this origin's storage is actually guaranteed to survive eviction,
 * to the extent the browser will say - defensively, so an absent Storage
 * API, a throw, or a rejected promise all resolve to the string `'unknown'`
 * rather than crashing or reading as either answer. `'unknown'` must never be
 * treated as "not persisted": a browser that cannot tell us is not evidence
 * of anything, and useDraftPersistence.js's warning gate only ever acts on a
 * definite `false`.
 *
 */
export async function isStoragePersisted(): Promise<boolean | 'unknown'> {
  try {
    const result = await navigator?.storage?.persisted?.();
    return typeof result === 'boolean' ? result : 'unknown';
  } catch {
    // expected: optional browser API, returns 'unknown'
    return 'unknown';
  }
}

// Shared by saveDraft and the legacy migration: given the work currently
// committed for this tool on an entry (or undefined/null if there is none
// yet), compute the next revision/updatedAt/writerId triple. Pulled out as a
// pure function, not a behaviour change, so every place that assigns a
// revision cannot drift on how - the actual read-then-put still happens
// inside each caller's own single transaction.
function nextDraftRevision(old: Partial<ToolWork> | null | undefined, writerId: string): Pick<ToolWork, 'revision' | 'updatedAt' | 'writerId'> {
  const oldMeta = old && Number.isInteger(old.revision)
    ? { revision: old.revision as number, updatedAt: old.updatedAt || 0, writerId: old.writerId || 'legacy' }
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
 * `tool` is 'sign' | 'redact' | 'merge'. Resolves true if written.
 */
export async function saveDraft(tool: string, record: DraftSaveRecord): Promise<boolean> {
  if (!hasIndexedDB()) return false;
  await ensureMigrated();
  const recordFiles = record.files;
  const isMulti = Array.isArray(recordFiles);
  if (isMulti) {
    // Nothing to merge, nothing to resume: refuse rather than write a
    // partial entry.
    if (recordFiles.length === 0) return false;
    // A merge entry holds every source file's bytes at once, so it can
    // approach IndexedDB quota far sooner than a single-document entry ever
    // could (MERGE-13's honest limit).
    const totalBytes = recordFiles.reduce((sum, file) => sum + (file?.fileBytes?.byteLength || 0), 0);
    if (totalBytes > MERGE_DRAFT_MAX_BYTES) return false;
  }
  // `preview` is display metadata for the home page, not part of an entry's
  // work: it lives in the recency index (see upsertIndexEntry) because it
  // has to be readable synchronously, and keeping it out of `work[tool]`
  // avoids storing the same image twice.
  const { preview, fileBytes, files, fileName, fileType, ...toolFields } = record;
  const id = isMulti
    // expected: crypto.subtle missing, save skipped
    ? await sourceIdForFiles(files as DraftFile[]).catch(() => null)
    // expected: crypto.subtle missing, save skipped
    : await sourceIdForBytes(fileBytes).catch(() => null);
  if (!id) return false;
  const { savedAt } = createDraftRetention();
  const writerId = getTabWriterId();
  const key = recentFileKey(id);
  let committedEntry: StoredEntry | null = null;
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
        const old = parseStoredEntry(oldRequest.result);
        const oldWork = old?.work || {};
        const metadata = nextDraftRevision(oldWork[tool], writerId);
        const toolWork = { ...toolFields, ...metadata };
        const entry: StoredEntry = {
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
    reportStoreError('drafts', e, 'save_draft');
    console.error('draftStore.saveDraft failed:', e);
    return false;
  }
  // First real save, this module lifetime: exactly the moment to ask the
  // browser to keep this origin (see requestStoragePersistence's comment).
  requestStoragePersistence();
  const committed = committedEntry as unknown as StoredEntry;
  const kept = upsertIndexEntry({
    id,
    tool,
    fileName: committed.fileName,
    fileType: committed.fileType,
    savedAt,
    preview,
    pageCount: toolFields.pageCount as number | undefined,
    fileCount: toolFields.fileCount as number | undefined,
    hasWork: Object.keys(committed.work || {}),
  });
  await pruneOrphans(kept);
  setCurrentEntry(tool, id);
  // A prior file or edit may have completed after this write started. Obtain
  // the persisted work's own metadata rather than trusting what we just
  // built, and only notify if it is still current - the same guard the
  // single-transaction serialization above makes meaningful.
  try {
    const latest = parseStoredEntry(await withStore('readonly', (store) => reqToPromise(store.get(key))));
    const latestWork = latest?.work?.[tool];
    if (latestWork?.writerId === writerId) {
      notifyDraftChange(tool, { kind: 'saved', revision: latestWork.revision, updatedAt: latestWork.updatedAt, writerId });
    }
  } catch {
    // expected: Notification is advisory; a failed re-read must not undo an
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
 * Resolves `{ fileName, fileType, fileBytes|files, sourceId, savedAt, ...work[tool] }` if there is a
 * current entry, even one with no work[tool] yet (a file that was opened but never edited is still
 * the tool's current file); null otherwise.
 */
export async function loadDraft(tool: string): Promise<DraftRecord | null> {
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
    const stored = await withStore('readonly', (store) => reqToPromise(store.get(key)));
    if (!stored) {
      clearCurrentEntry(tool);
      return null;
    }
    // Stored but not an object: no usable `savedAt`, so it expires and is deleted below.
    const entry = parseStoredEntry(stored) ?? ({} as StoredEntry);
    if (isDraftExpired(entry.savedAt)) {
      // Expiry drops every tool's work, not just this one's, so it bypasses
      // deleteDraft; the cross-tab signal still goes out so a peer tab that
      // has this entry open learns it is gone, as it did before MEM-01.
      await withStore('readwrite', (store) => { store.delete(key); });
      removeRecentMeta(id);
      clearCurrentEntry(tool);
      const old = entry.work?.[tool];
      notifyDraftChange(tool, {
        kind: 'deleted', revision: (Number.isInteger(old?.revision) ? (old as ToolWork).revision : 0) + 1,
        updatedAt: Date.now(), writerId: getTabWriterId(),
      });
      return null;
    }
    // A single-file entry with `fileBytes`, or Merge's multi-file shape with every file still carrying its
    // bytes. A `files: []` or a file missing `fileBytes` is corrupt in the same sense a single-file entry
    // with no `fileBytes` is - treat it as no entry rather than hand a tool a record it cannot restore
    // from. Only this tool's pointer is at fault here, not the entry itself (another tool's work on it
    // may be fine), so drop the pointer without touching the stored record.
    const record = parseDraftRecord(entry, tool, id);
    if (record) return record;
    clearCurrentEntry(tool);
    return null;
  } catch (e) {
    reportStoreError('drafts', e, 'load_draft');
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
 */
export async function deleteDraft(tool: string): Promise<boolean> {
  if (!hasIndexedDB()) return false;
  await ensureMigrated();
  const id = readCurrentEntryId(tool);
  if (!id) {
    clearCurrentEntry(tool);
    return true;
  }
  const writerId = getTabWriterId();
  const key = recentFileKey(id);
  let change: DraftChange | null = null;
  let remainingWorkKeys: string[] | null = null;
  try {
    await withStore('readwrite', (store) => {
      const request = store.get(key);
      request.onsuccess = () => {
        const entry = parseStoredEntry(request.result);
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
    reportStoreError('drafts', e, 'delete_draft');
    console.error('draftStore.deleteDraft failed:', e);
    return false;
  }
  if (remainingWorkKeys) updateIndexHasWork(id, remainingWorkKeys);
  clearCurrentEntry(tool);
  if (change) notifyDraftChange(tool, change);
  return true;
}

