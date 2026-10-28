import { isDraftExpired } from './draftPolicy.js';
import { RECENT_FILES_META_KEY } from './recentFilesKey.js';
import { isObject } from './draftRecords.ts';
import type { DraftEntry } from './draftRecords.ts';
import { withStore } from './draftIdb.ts';

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
export function setCurrentEntry(tool: string, id: string) {
  try {
    localStorage.setItem(CURRENT_ENTRY_PREFIX + tool, id);
  } catch {
    // expected: Best-effort, like every other localStorage write in this file.
  }
}

/** Drop `tool`'s pointer, e.g. once its work on that entry has been cleared. */
export function clearCurrentEntry(tool: string) {
  try {
    localStorage.removeItem(CURRENT_ENTRY_PREFIX + tool);
  } catch {
    // expected: best-effort like every other localStorage write in this file
  }
}

/** The entry id `tool` currently points at, or null. Synchronous, best-effort -
 * the id may point at an entry that has since expired or been evicted; callers
 * that care use hasDraftHint/loadDraft, which check against the live index. */
export function readCurrentEntryId(tool: string): string | null {
  try {
    return localStorage.getItem(CURRENT_ENTRY_PREFIX + tool) || null;
  } catch {
    // expected: blocked storage, no current-entry pointer
    return null;
  }
}

// The bounded recency cache: up to six entries' display metadata, readable
// without opening IndexedDB, which is what makes the home page's launcher
// cheap to render and makes hasDraftHint/readDraftMeta possible before first
// paint. The actual PDF bytes and `work` live only in IndexedDB; this index
// never carries them. Its key, RECENT_FILES_META_KEY, lives in recentFilesKey.js.
const RECENT_FILE_PREFIX = 'recent:';
export const MAX_RECENT_FILES = 6;

export const recentFileKey = (id: string) => `${RECENT_FILE_PREFIX}${id}`;

export function writeRecentFiles(entries: DraftEntry[]) {
  try {
    localStorage.setItem(RECENT_FILES_META_KEY, JSON.stringify(entries));
  } catch {
    // expected: Recent documents are a convenience. A quota failure must not prevent a
    // PDF from opening or interfere with a tool's own work on it.
  }
}

function validIndexEntry(entry: unknown): entry is DraftEntry {
  return isObject(entry)
    && typeof entry.id === 'string' && entry.id.length > 0
    && typeof entry.tool === 'string' && entry.tool.length > 0
    && typeof entry.fileName === 'string'
    && Number.isFinite(entry.savedAt)
    && !isDraftExpired(entry.savedAt);
}

export function readIndexEntries(): DraftEntry[] {
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
    // expected: unparseable stored index falls back to []
    return [];
  }
}

export function removeRecentMeta(id: string) {
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
export function upsertIndexEntry({ id, tool, fileName, fileType, savedAt, preview, pageCount, fileCount, hasWork }: DraftEntry): DraftEntry[] {
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
export function updateIndexHasWork(id: string, hasWorkKeys: string[]) {
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
export async function pruneOrphans(keptEntries: DraftEntry[]) {
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
    // expected: a legacy key we cannot remove is harmless and ignored, already reported with console.error
    console.error('draftStore.pruneOrphans failed:', e);
  }
}
