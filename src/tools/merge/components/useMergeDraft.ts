import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import {
  deleteDraft, hasDraftHint, loadDraft, saveDraft, subscribeToDraftChanges,
} from '../../../lib/drafts/draftStore.js';
import { clearDraftHintAttribute, RESTORE_TIMEOUT_MS } from '../../../lib/drafts/useDraftPersistence.js';
import { outputPageCount, type PlanEntry } from '../mergePlan.ts';

// MERGE-13: draft persistence for the Merge tool, on the same shared store
// Sign and Redact already use (draftStore.js's 'merge' record shape - see its
// header comment), but shaped around a *list* of files rather than one. This
// hook is deliberately a sibling of useDraftPersistence.js, not a
// generalisation of it: the two record shapes, and what counts as "the same
// snapshot" for revision purposes, differ enough (a list of files instead of
// one, a plan instead of edit elements) that forcing them through one
// parameterised hook would read worse than the duplication. Fixed things
// reused as-is: the revision-guarded write ("a completed save only updates
// state if it's still current"), the pagehide/visibilitychange flush, the
// mount-time restore race against beforeRestore-that-never-comes, and
// RESTORE_TIMEOUT_MS/clearDraftHintAttribute themselves, imported rather than
// copied.
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
  onRestore: (restored: MergeDraftRestore) => void;
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
function parseRestorableRecord(record: any): MergeDraftRestore | null {
  if (!record || !Array.isArray(record.files) || record.files.length === 0) return null;
  if (record.schemaVersion !== MERGE_DRAFT_SCHEMA_VERSION) return null;
  if (!record.files.every((file: any) => file && file.fileBytes)) return null;
  if (!Array.isArray(record.plan) || !record.plan.every((entry: unknown) => isValidPlanEntry(entry, record.files.length))) return null;
  const files = record.files.map((file: any) => new File([file.fileBytes], file.fileName, { type: file.fileType || 'application/pdf' }));
  const options = { addPageNumbers: record.options?.addPageNumbers === true };
  const outputName = typeof record.outputName === 'string' ? record.outputName : null;
  return { files, plan: record.plan, options, outputName };
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

  const revisionRef = useRef(0);
  const snapshotRef = useRef<string | null>(null);
  const key = snapshotKey(entries, plan, options, title, outputName);
  if (snapshotRef.current !== key) {
    snapshotRef.current = key;
    revisionRef.current += 1;
  }
  const currentRevision = revisionRef.current;

  const [saveState, setSaveState] = useState<{ state: MergeDraftSaveState; revision: number }>({ state: 'idle', revision: 0 });
  const writePromisesRef = useRef(new Map<number, Promise<boolean>>());
  // A pagehide after the debounce has already persisted this exact revision
  // must not manufacture a second write/revision. Event handlers read this
  // ref rather than a render's saveState closure, which can be stale at the
  // moment a tab is being closed.
  const savedRevisionRef = useRef<number | null>(null);

  const [isRestoring, setIsRestoring] = useState(() => enabled && hasDraftHint(TOOL));
  // Restoring recreates the live entries from an already-persisted snapshot.
  // Those state updates must not be mistaken for a person changing the merge:
  // apart from a needless IndexedDB write it briefly surfaced "Saving draft"
  // and "Draft saved" on every resumed workspace. The next autosave effect
  // it is consumed once the parent has finished deriving the restored
  // workspace. Actual edits after that still take the normal path.
  const skipRestoredSnapshotAutosaveRef = useRef(false);
  // `pagehide`/`visibilitychange` can land in the tiny interval between
  // onRestore() updating the parent and the autosave effect above consuming
  // its flag. Keep that flush from writing the same restored snapshot too.
  const restoreInProgressRef = useRef(enabled);

  // A storage event never fires in the writer tab, only in its peers - see
  // draftStore.js's notifyDraftChange. Surface the conflict rather than
  // silently replacing an in-progress edit; the next local save deterministically wins.
  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeToDraftChanges(TOOL, () => {
      if (latest.current.entries.length > 0) {
        setSaveState({ state: 'conflict', revision: revisionRef.current });
      }
    });
  }, [enabled]);

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

  // Builds the multi-file record draftStore.js's saveDraft expects (see its
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
      fileType: entry.file.type || 'application/pdf',
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

  const persist = (revision: number, record: ReturnType<typeof buildRecord> extends Promise<infer T> ? T : never) => {
    if (writePromisesRef.current.has(revision)) return writePromisesRef.current.get(revision)!;
    const write = Promise.resolve()
      .then(() => saveDraft(TOOL, record))
      .then((saved) => saved === true)
      .catch(() => false)
      .then((saved) => {
        // A prior snapshot may finish writing after a newer one has already
        // started; it stays stored as a best-effort older revision, but must
        // not make the current one claim a save it never made.
        if (revision === revisionRef.current) {
          if (saved) savedRevisionRef.current = revision;
          setSaveState({ state: saved ? 'saved' : 'error', revision });
        }
        return saved;
      })
      .finally(() => {
        writePromisesRef.current.delete(revision);
      });
    writePromisesRef.current.set(revision, write);
    return write;
  };

  // Restore on mount. Runs exactly once regardless of the synchronous hint,
  // because the hint is only a pre-paint optimisation - draftStore's
  // IndexedDB record is the real source of truth (see hasDraftHint's doc
  // comment), so a hint miss must not skip the real check.
  const restoreAttempted = useRef(false);
  useEffect(() => {
    if (!enabled || restoreAttempted.current) {
      setIsRestoring(false);
      return undefined;
    }
    restoreAttempted.current = true;
    let cancelled = false;
    const stopWaiting = () => {
      if (!cancelled) {
        restoreInProgressRef.current = false;
        setIsRestoring(false);
      }
    };
    const timeoutId = setTimeout(stopWaiting, RESTORE_TIMEOUT_MS);
    (async () => {
      const record = await loadDraft(TOOL);
      if (cancelled) return;
      clearTimeout(timeoutId);
      const restore = parseRestorableRecord(record);
      if (restore) {
        skipRestoredSnapshotAutosaveRef.current = true;
        latest.current.onRestore(restore);
      } else {
        // No usable draft: draftStore already cleared the localStorage hint
        // when `record` came back null; a record that came back non-null but
        // failed *this* module's validation (an out-of-range fileId, say -
        // draftStore itself never reads the plan's shape) needs the same
        // treatment by hand, since only the caller of loadDraft knows the
        // plan is broken.
        clearDraftHintAttribute();
        if (record) await deleteDraft(TOOL);
      }
      stopWaiting();
    })();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced autosave: 700ms after any change to entries, plan or options,
  // same window useDraftPersistence.js uses. The snapshot's revision is
  // computed during render (see snapshotKey above); this effect only re-fires
  // when that revision actually moves.
  useEffect(() => {
    if (!enabled || latest.current.entries.length === 0) return undefined;
    if (skipRestoredSnapshotAutosaveRef.current) {
      if (!restoreHydrationComplete) return undefined;
      skipRestoredSnapshotAutosaveRef.current = false;
      // The stored record already represents this whole reconstructed
      // snapshot. Mark its revision settled so a later pagehide/visibility
      // flush cannot turn reopening a tab into a second write.
      savedRevisionRef.current = currentRevision;
      return undefined;
    }
    const revision = currentRevision;
    setSaveState({ state: 'pending', revision });
    const timer = setTimeout(() => {
      const { entries, plan, options, title, outputName } = latest.current;
      buildRecord(entries, plan, options, title, outputName).then((record) => persist(revision, record));
    }, autosaveDebounceMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, currentRevision, autosaveDebounceMs, restoreHydrationComplete]);

  // Best-effort immediate flush when the tab is hidden or being unloaded.
  // Continuous debounced autosave is what actually survives a crash (a
  // crashing tab fires no unload event); this is only a catch-up for clean
  // closes, exactly as useDraftPersistence.js's own flush effect documents.
  useEffect(() => {
    if (!enabled) return undefined;
    const flush = () => {
      if (restoreInProgressRef.current || skipRestoredSnapshotAutosaveRef.current) return;
      const { entries, plan, options, title, outputName } = latest.current;
      if (entries.length === 0) return;
      const revision = revisionRef.current;
      if (savedRevisionRef.current === revision) return;
      setSaveState({ state: 'pending', revision });
      buildRecord(entries, plan, options, title, outputName).then((record) => persist(revision, record));
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // The island calls this from Clear all / Start again; the hook never
  // clears the record on its own when entries drops to zero (see the module
  // doc comment on MergeDraftPersistence for why that split is deliberate).
  //
  // MEM-01/02: `deleteDraft` clears only Merge's work on the entry it is
  // currently pointed at (the plan/options for that file set) and drops the
  // pointer; the entry - its files' bytes, and any other tool's work on the
  // same content - stays in recents. Clear all is a real "start over", so
  // this is the one place in Merge that is supposed to discard work, unlike
  // adding or replacing files (see performHandoff's comment in
  // PdfMergeTool.tsx for the hand-off case this is not).
  const clearDraft = useCallback(async () => {
    revisionRef.current += 1;
    return deleteDraft(TOOL);
  }, []);

  const canPersist = enabled && entries.length > 0;
  // While restored files are being inspected, their synthetic state changes
  // deliberately have no scheduled write. Expose that honestly as idle too:
  // the revision mismatch below would otherwise render a misleading
  // "Saving draft…" chip despite the autosave/flush guards above.
  const restoredSnapshotIsClean = skipRestoredSnapshotAutosaveRef.current;
  // sourceChanged (via the revision bump above) runs during render, before an
  // in-flight write's completion can paint over it - derive pending for the
  // new snapshot until its own effect records the real state, so there is no
  // transient stale "Draft saved" chip between an edit and its own autosave.
  const draftSaveState: MergeDraftSaveState = restoredSnapshotIsClean
    ? 'idle'
    : saveState.state === 'conflict'
    ? 'conflict'
    : saveState.revision === currentRevision
    ? saveState.state
    : (canPersist ? 'pending' : 'idle');

  return { isRestoring, draftSaveState, clearDraft };
}
