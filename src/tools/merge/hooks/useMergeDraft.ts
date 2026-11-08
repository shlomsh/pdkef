import { useCallback, useEffect, useRef } from 'preact/hooks';
import { deleteDraft, loadDraft, saveDraft } from '#lib/drafts/draftStore.ts';
import { useDraftRestore, useDraftSave } from '#lib/drafts/useDraftLifecycle.ts';
import { mimeTypeOf } from '#lib/handoff/fileKind.js';
import { outputPageCount, type PlanEntry } from '#lib/pages/pagePlan.ts';

// MERGE-13: draft persistence for the Merge tool, on the shared store (draftStore.ts's 'merge'
// record shape, a list of files). The lifecycle is the shared core (ARCH-134, useDraftLifecycle.ts);
// this hook keeps the Merge record shape, snapshot key and clean-restore rule.
export const MERGE_DRAFT_SCHEMA_VERSION = 1;

// Tests shorten the wait; the tool never passes it - same precedent as
// usePreparedMerge.ts's PREPARE_DEBOUNCE_MS/debounceMs.
export const AUTOSAVE_DEBOUNCE_MS = 700;

export interface MergeDraftEntry {
  id: number;
  file: File;
  /** From inspectPdf; null until read, same as PdfMergeTool's FileEntry. */
  pageCount: number | null;
  thumbnail: string | null;
  error: 'encrypted' | 'unreadable' | null;
}

export interface MergeDraftRestore {
  files: File[];
  /** fileId is already an index into `files` here, not the stable entry id a
   * live plan uses - see the module comment on saveDraft's format below. The
   * caller mints fresh entry ids for the restored files and is free to reuse
   * the array index as that id, since the two line up one-to-one on restore. */
  plan: PlanEntry[];
  options: { addPageNumbers: boolean };
  /** MERGE-11: null when the output name is still the automatic one (derived
   * from the file list); a string once a person has renamed it. Restored as
   * given, with no re-sanitising - the value saved was already sanitised on
   * commit. */
  outputName: string | null;
}

export interface UseMergeDraftOptions {
  /** Master switch, default true - mirrors useDraftPersistence's `enabled`. */
  enabled?: boolean;
  entries: MergeDraftEntry[];
  plan: PlanEntry[];
  options: { addPageNumbers: boolean };
  /** Display name for the hint/resume card, e.g. 'merged_Invoice' - the
   * automatic name OR the person's own edited one, whichever is current. */
  title: string;
  /** MERGE-11: null while the title above is still the automatic one; the
   * sanitised, person-typed name once they have renamed the output. Tracked
   * separately from `title` so a restore can tell "never renamed" (regenerate
   * from the restored file list) apart from "renamed to something that
   * happens to equal the automatic name". */
  outputName: string | null;
  /** False while the parent is deriving page counts and thumbnails for a
   * restored set. Those derived values are not a user edit and must not
   * replay the autosave/status cycle. */
  restoreHydrationComplete?: boolean;
  /** `source` (DEBT-58): whether a recent tile asked for it; Merge marks it only if it applies the restore. */
  onRestore: (restored: MergeDraftRestore, source: 'restore' | 'recent') => void;
  /** Tests shorten the wait; the tool never passes it. */
  autosaveDebounceMs?: number;
}

export type MergeDraftSaveState = 'idle' | 'pending' | 'saved' | 'error' | 'conflict';

export interface UseMergeDraftResult {
  isRestoring: boolean;
  draftSaveState: MergeDraftSaveState;
  clearDraft: () => Promise<boolean>;
}

const TOOL = 'merge';

function isValidPlanEntry(entry: unknown, filesLength: number): entry is PlanEntry {
  if (!entry || typeof entry !== 'object') return false;
  const candidate = entry as Partial<PlanEntry>;
  return (
    typeof candidate.key === 'string'
    && Number.isInteger(candidate.fileId) && (candidate.fileId as number) >= 0 && (candidate.fileId as number) < filesLength
    && Number.isInteger(candidate.pageIndex) && (candidate.pageIndex as number) >= 0
    && (candidate.rotation === 0 || candidate.rotation === 90 || candidate.rotation === 180 || candidate.rotation === 270)
    && typeof candidate.skipped === 'boolean'
  );
}

// A record that fails this is treated as if there were no draft at all - see
// the restore effect below, which deletes it rather than hand the caller
// something it cannot safely rehydrate from.
interface StoredMergeFile { fileBytes?: BlobPart; fileName: string; fileType?: string }
interface StoredMergeRecord {
  schemaVersion?: unknown;
  files?: unknown;
  plan?: unknown;
  options?: { addPageNumbers?: unknown };
  outputName?: unknown;
}

function parseRestorableRecord(stored: unknown): MergeDraftRestore | null {
  const record = stored as StoredMergeRecord | null | undefined;
  if (!record || !Array.isArray(record.files) || record.files.length === 0) return null;
  if (record.schemaVersion !== MERGE_DRAFT_SCHEMA_VERSION) return null;
  const storedFiles = record.files as StoredMergeFile[];
  if (!storedFiles.every((file) => file && file.fileBytes)) return null;
  if (!Array.isArray(record.plan) || !record.plan.every((entry: unknown) => isValidPlanEntry(entry, storedFiles.length))) return null;
  const files = storedFiles.map((file) => new File([file.fileBytes as BlobPart], file.fileName, { type: file.fileType || 'application/pdf' }));
  const options = { addPageNumbers: record.options?.addPageNumbers === true };
  const outputName = typeof record.outputName === 'string' ? record.outputName : null;
  return { files, plan: record.plan as PlanEntry[], options, outputName };
}

// One signature string per distinct snapshot of entries/plan/options/title.
// Built from primitive fields rather than compared by reference, because the
// caller (a renderless wrapper around this hook - see MergeDraftPersistence)
// is expected to pass fresh array/object literals most renders regardless of
// whether anything actually changed; comparing those by identity would bump
// the revision, and therefore reschedule the autosave debounce, on every
// render instead of only on a real edit.
function snapshotKey(
  entries: MergeDraftEntry[],
  plan: PlanEntry[],
  options: { addPageNumbers: boolean },
  title: string,
  outputName: string | null,
): string {
  const entriesPart = entries.map((e) => `${e.id}:${e.pageCount ?? ''}:${e.error ?? ''}:${e.thumbnail ? 1 : 0}`).join(',');
  const planPart = plan.map((p) => `${p.key}:${p.fileId}:${p.pageIndex}:${p.rotation}:${p.skipped ? 1 : 0}`).join(',');
  return `${entriesPart}|${planPart}|${options.addPageNumbers ? 1 : 0}|${title}|${outputName ?? ''}`;
}

export function useMergeDraft({
  enabled = true,
  entries,
  plan,
  options,
  title,
  outputName,
  restoreHydrationComplete = true,
  onRestore,
  autosaveDebounceMs = AUTOSAVE_DEBOUNCE_MS,
}: UseMergeDraftOptions): UseMergeDraftResult {
  // Keep the latest values addressable from event listeners and the async
  // restore effect without re-binding them - same pattern as
  // useDraftPersistence.js's `latest` ref.
  const latest = useRef({ enabled, entries, plan, options, title, outputName, onRestore });
  latest.current = { enabled, entries, plan, options, title, outputName, onRestore };

  // file.arrayBuffer() is only ever called once per File object, for the life
  // of that object: an autosave firing every 700ms while typing must not
  // re-read a 50MB source file on every tick. Keyed by the File itself (a
  // WeakMap, so a removed file's bytes go with it) rather than the entry id:
  // ids come from a module-level counter in PdfMergeTool.tsx, and the dev
  // server's HMR resets that counter while this hook's cache lives on, which
  // once saved another file's bytes under a new file's name (2026-09-13).
  const bufferCacheRef = useRef(new WeakMap<File, Promise<ArrayBuffer>>());

  const key = snapshotKey(entries, plan, options, title, outputName);

  // Holds the restored files rather than a bare boolean: a restored set is clean (already stored)
  // only while the live entries are still that set. A restore the island declined or a set that
  // replaced it is a new snapshot with no stored record, so it must save normally.
  const restoredFilesRef = useRef<File[] | null>(null);
  const isRestoredSet = (list: MergeDraftEntry[]) => (
    restoredFilesRef.current !== null
    && list.length > 0
    && list.every((entry) => restoredFilesRef.current!.includes(entry.file))
  );

  // Reads (and caches) one entry's source bytes exactly once. Called from
  // buildRecord just before a write, not eagerly on every entries change -
  // most snapshot changes only touch the plan or options, so there is no
  // reason to read bytes again for files nothing happened to.
  const getFileBytes = (entry: MergeDraftEntry): Promise<ArrayBuffer> => {
    const cache = bufferCacheRef.current;
    let cached = cache.get(entry.file);
    if (!cached) {
      cached = entry.file.arrayBuffer();
      cache.set(entry.file, cached);
    }
    return cached;
  };

  // Builds the multi-file record draftStore.ts's saveDraft expects (see its
  // header comment): the plan's stable per-entry fileId is translated into a
  // plain index into the `files` array being saved, since that is all a
  // restored session needs to reconstruct the same plan against freshly
  // rebuilt File objects.
  const buildRecord = async (
    entries: MergeDraftEntry[],
    plan: PlanEntry[],
    options: { addPageNumbers: boolean },
    title: string,
    outputName: string | null,
  ) => {
    const files = await Promise.all(entries.map(async (entry) => ({
      fileName: entry.file.name,
      fileType: mimeTypeOf(entry.file) ?? 'application/pdf',
      fileBytes: await getFileBytes(entry),
    })));
    const indexOfEntryId = new Map(entries.map((entry, index) => [entry.id, index]));
    const outPlan = plan
      .map((entry) => ({ ...entry, fileId: indexOfEntryId.get(entry.fileId) }))
      // A plan entry whose file was already removed from `entries` (a remove
      // and an autosave racing) has nothing to point at; drop it rather than
      // write a dangling index a restore could not validate against.
      .filter((entry): entry is PlanEntry => typeof entry.fileId === 'number');
    return {
      files,
      plan: outPlan,
      options,
      fileName: title,
      outputName,
      pageCount: outputPageCount(plan),
      fileCount: entries.length,
      preview: entries[0]?.thumbnail || undefined,
      schemaVersion: MERGE_DRAFT_SCHEMA_VERSION,
    };
  };

  const { checking, settled } = useDraftRestore({
    tool: TOOL,
    enabled,
    run: async (source, isCancelled) => {
      const record = await loadDraft(TOOL);
      if (isCancelled()) return true;
      const restore = parseRestorableRecord(record);
      if (restore) {
        restoredFilesRef.current = restore.files;
        latest.current.onRestore(restore, source);
        return true;
      }
      // A record that loaded but failed this module's validation (an out-of-range fileId, say)
      // needs deleting by hand: only this module knows the plan is broken.
      if (record) await deleteDraft(TOOL);
      return false;
    },
  });

  const restoredClean = isRestoredSet(entries);
  const save = useDraftSave({
    tool: TOOL,
    enabled,
    snapshot: [key],
    canSave: enabled && entries.length > 0 && settled && !restoredClean,
    build: () => {
      const { entries: e, plan: p, options: o, title: t, outputName: n } = latest.current;
      return e.length === 0 ? null : buildRecord(e, p, o, t, n);
    },
    write: (record) => saveDraft(TOOL, record).then((saved) => saved === true),
    errorStep: 'autosave_merge_draft',
    watchConflicts: true,
    debounceMs: autosaveDebounceMs,
  });

  // A restored set is the stored record itself: once the parent has derived its pages, mark it
  // saved. Any other live set drops the restore note so later edits save normally.
  useEffect(() => {
    if (!isRestoredSet(latest.current.entries)) {
      restoredFilesRef.current = null;
    } else if (restoreHydrationComplete) {
      restoredFilesRef.current = null;
      save.markSaved();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, restoreHydrationComplete]);

  // The island calls this from Clear all / Start again; the hook never clears the record on its own
  // when entries drops to zero. MEM-01/02: deleteDraft clears only Merge's work on the entry it points
  // at and drops the pointer; the entry and other tools' work stay in recents.
  const clearDraft = useCallback(async () => {
    save.invalidate();
    return deleteDraft(TOOL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isRestoring: checking, draftSaveState: save.state, clearDraft };
}
