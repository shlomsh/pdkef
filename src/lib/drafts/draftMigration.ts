import { isDraftExpired } from './draftPolicy.js';
import { parseLegacyRecord, parseStoredEntry } from './draftRecords.ts';
import type { DraftFile, LegacyRecord, StoredEntry, ToolWork } from './draftRecords.ts';
import { hasIndexedDB, reportStoreError, reqToPromise, withStore } from './draftIdb.ts';
import { pruneOrphans, recentFileKey, setCurrentEntry, upsertIndexEntry } from './draftRecentIndex.ts';
import { sourceIdForBytes, sourceIdForFiles } from './draftSourceId.ts';

// Legacy keys from the pre-MEM-01 schema (one draft record per tool, keyed
// literally by tool name, plus these two localStorage keys for its
// pre-paint hint). Kept only so migrateLegacyDraft can find and clear them -
// nothing in this file writes them again.
const LEGACY_DRAFT_HINT_PREFIX = 'pdf-toolkit:workspace:has-draft:';
const LEGACY_DRAFT_META_PREFIX = 'pdf-toolkit:workspace:draft-meta:';
const LEGACY_TOOLS = ['sign', 'redact', 'merge'];

function clearLegacyLocalStorage(tool: string) {
  // expected: a legacy key we cannot remove is harmless and ignored
  try { localStorage.removeItem(LEGACY_DRAFT_HINT_PREFIX + tool); } catch { /* best-effort */ }
  // expected: a legacy key we cannot remove is harmless and ignored
  try { localStorage.removeItem(LEGACY_DRAFT_META_PREFIX + tool); } catch { /* best-effort */ }
}

let migratedPromise: Promise<void> | null = null;

// Runs the fold-in exactly once per module lifetime (memoised, not per call).
// Every other async export awaits this first, so a legacy record can never
// shadow or race a write already made under the new schema. Synchronous
// reads (hasDraftHint, readDraftMeta, readRecentFiles) do not wait on it:
// they are already best-effort/advisory, and gating a synchronous API on an
// async migration would defeat the reason they are synchronous at all - a
// pre-migration read just sees fewer entries until the fold-in lands.
export function ensureMigrated(): Promise<void> {
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
      reportStoreError('drafts', e, 'migrate_legacy_drafts');
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
async function migrateLegacyDraft(tool: string): Promise<void> {
  let legacy: LegacyRecord | null;
  try {
    const stored = await withStore('readonly', (store) => reqToPromise(store.get(tool)));
    // Stored but not an object: no usable `savedAt`, so it is cleared and deleted as expired below.
    legacy = parseLegacyRecord(stored) ?? (stored ? ({} as LegacyRecord) : null);
  } catch (e) {
    reportStoreError('drafts', e, 'read_legacy_draft');
    console.error('draftStore.migrateLegacyDraft failed to read:', e);
    return;
  }
  if (!legacy) return;
  clearLegacyLocalStorage(tool);
  if (isDraftExpired(legacy.savedAt)) {
    try {
      await withStore('readwrite', (store) => { store.delete(tool); });
    } catch (e) {
      // expected: a legacy key we cannot remove is harmless and ignored, already reported with console.error
      console.error('draftStore.migrateLegacyDraft failed to delete an expired record:', e);
    }
    return;
  }
  const isMulti = Array.isArray(legacy.files);
  const id = isMulti
    // expected: crypto.subtle missing, record dropped
    ? await sourceIdForFiles(legacy.files as DraftFile[]).catch(() => null)
    // expected: crypto.subtle missing, record dropped
    : await sourceIdForBytes(legacy.fileBytes).catch(() => null);
  if (!id) {
    // Cannot safely address this record's bytes - drop it rather than leak
    // it forever, the same refusal saveDraft itself would make on a fresh write.
    try {
      await withStore('readwrite', (store) => { store.delete(tool); });
    } catch (e) {
      // expected: a legacy key we cannot remove is harmless and ignored, already reported with console.error
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
  const toolWork: ToolWork = {
    ...toolFields,
    revision: Number.isInteger(revision) ? (revision as number) : 1,
    updatedAt: Number.isFinite(updatedAt) ? (updatedAt as number) : savedAt,
    writerId: writerId || 'legacy',
  };
  const key = recentFileKey(id);
  let committedEntry: StoredEntry | null = null;
  try {
    await withStore('readwrite', (store) => {
      store.delete(tool);
      const request = store.get(key);
      request.onsuccess = () => {
        const existing = parseStoredEntry(request.result);
        const work = { ...(existing?.work || {}), [tool]: toolWork };
        const entry: StoredEntry = existing
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
    reportStoreError('drafts', e, 'write_legacy_draft');
    console.error('draftStore.migrateLegacyDraft failed to write:', e);
    return;
  }
  if (!committedEntry) return;
  const committed = committedEntry as StoredEntry;
  const kept = upsertIndexEntry({
    id,
    tool,
    fileName: committed.fileName,
    fileType: committed.fileType,
    savedAt: committed.savedAt,
    pageCount: toolFields.pageCount as number | undefined,
    fileCount: toolFields.fileCount as number | undefined,
    hasWork: Object.keys(committed.work || {}),
  });
  await pruneOrphans(kept);
  setCurrentEntry(tool, id);
}
