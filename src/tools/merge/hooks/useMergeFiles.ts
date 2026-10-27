import { useCallback, useRef } from 'preact/hooks';
import type { Dispatch } from 'preact/hooks';
import { reportEdit } from '../../../lib/productAnalytics.ts';
import { recordAction } from '../../../lib/actionTrail.ts';
import { deriveFileKind } from '../../../lib/fileKind.js';
import { moveEntry } from '../../../lib/pageOrder.js';
import { planForFile } from '../../../lib/pagePlan.ts';
import { renderThumbnail } from '../../../lib/thumbnails.js';
import { formatMessage } from '../../../lib/formatMessage';
import { reportError } from '../../../lib/errorReport.ts';
import { inspectPdf } from '../lib/merge.js';
import { reportableCause } from '../lib/reportableCause.ts';
import { toEntry, type FileEntry, type Model, type SortMode } from '../lib/mergeModel.ts';
import {
  applyInspection,
  fileIndexForPlanDrop,
  insertEntriesAt,
  moveEntryTo,
  recordPendingPlanIndexes,
  regroupPlan,
  removeFile,
  settlePendingPlanIndexes,
  sortFiles,
  withFileOrder,
} from '../lib/mergePlan.ts';
import type { MergeAction } from '../state/mergeState.ts';
import type { MergeMessages } from '../messages';

interface Options {
  model: Model;
  commitModel: (update: (current: Model) => Model) => void;
  amendModel: (update: (snapshot: Model) => Model) => void;
  dispatch: Dispatch<MergeAction>;
  announce: (message: string) => void;
  /** Reads (and clears) where a native file drag last pointed. */
  takeDropPosition: () => { fileIndex: number; planIndex: number };
  t: MergeMessages;
}

/**
 * Every way the file list changes: adding, inspecting, removing, reordering
 * and sorting. Document edits go through the history stack: a user edit is a
 * `commit`, a late arrival (a count or thumbnail resolving, files coming in)
 * is an `amend`, so Undo can never take it away. The decisions themselves
 * are pure functions in mergePlan.ts.
 */
export function useMergeFiles({ model, commitModel, amendModel, dispatch, announce, takeDropPosition, t }: Options) {
  const { entries, plan } = model;
  /* MERGE-10: the plan index a file dropped onto the grid wants, recorded per
     new entry and consumed when its page count arrives, because the pages
     cannot be placed before the count is known. The ref only holds the Map;
     every change replaces it with the next one (mergePlan). */
  const pendingPlanIndexRef = useRef(new Map<number, number>());

  // Everything inspectEntry writes is a late arrival, not a user edit: it is
  // amended into the present and every undo/redo snapshot, so a count or a
  // thumbnail that lands after an edit survives undoing past that edit (and a
  // file removed before its count arrived still gets its pages on Undo).
  const inspectEntry = useCallback((entry: FileEntry) => {
    const inspection = inspectPdf(entry.file)
      .then((result) => {
        // Read once: the mapper below runs on every snapshot, and the bookkeeping
        // for files dropped together must happen exactly once.
        const recorded = pendingPlanIndexRef.current.get(entry.id);
        amendModel((snapshot) => applyInspection(snapshot, entry.id, result, recorded));
        pendingPlanIndexRef.current = settlePendingPlanIndexes(pendingPlanIndexRef.current, entry.id, result);
      })
      .catch((err) => {
        // Every failure is reported, whoever's file it turns out to be: a valid PDF the library
        // cannot parse is ours, and only the report can tell it from a broken one.
        const cause = reportableCause(err);
        if (cause) reportError('pdf_tool_run', cause, 'inspect_pdf');
        amendModel((snapshot) => ({
          ...snapshot,
          entries: snapshot.entries.map((e) => (e.id === entry.id ? { ...e, error: 'unreadable' as const } : e)),
        }));
      });
    // Thumbnails are nice-to-have, not blocking: render as they resolve
    // instead of waiting before the file appears.
    const thumbnail = renderThumbnail(entry.file)
      .then((thumbnail) => {
        amendModel((snapshot) => ({
          ...snapshot,
          entries: snapshot.entries.map((e) => (e.id === entry.id ? { ...e, thumbnail } : e)),
        }));
      })
      // expected: the thumbnail is decoration, encrypted or malformed user PDFs fail pdf.js by design
      .catch(() => {});
    return Promise.all([inspection, thumbnail]).then(() => undefined);
  }, [amendModel]);

  // Adding files is not an undo step (amend): Undo takes back edits, never a
  // file the person just brought in.
  const insertEntries = useCallback((newEntries: FileEntry[], atIndex: number) => {
    amendModel((snapshot) => ({ ...snapshot, entries: insertEntriesAt(snapshot.entries, newEntries, atIndex) }));
    for (const entry of newEntries) inspectEntry(entry);
  }, [amendModel, inspectEntry]);

  const addFiles = useCallback((fileList: FileList | File[], options: { force?: boolean; fresh?: boolean } = {}) => {
    const incoming = Array.from(fileList);
    // MERGE-02, MERGE-22: classify through deriveFileKind, which falls back to the
    // extension when a drag source or picker hands over a File with an
    // empty `type` - the exact case Compress already accepts.
    const known = incoming.filter((f) => deriveFileKind(f) !== null);
    const rejected = incoming.filter((f) => deriveFileKind(f) === null);

    // MERGE-07: a file with the same name and size as one already in the
    // list is almost always the same file picked twice; nudge, do not refuse.
    let accepted = known;
    let duplicates: File[] = [];
    if (!options.force) {
      duplicates = known.filter((f) => entries.some((e) => e.file.name === f.name && e.file.size === f.size));
      accepted = known.filter((f) => !duplicates.includes(f));
    }
    dispatch({ type: 'FILES_OFFERED', rejected: rejected.map((f) => f.name), duplicates });
    if (accepted.length === 0) return;

    const newEntries = accepted.map(toEntry);
    // MERGE-07: dropped onto the list, files go where they were dropped;
    // every other route appends.
    const drop = takeDropPosition();
    let atIndex = drop.fileIndex;
    const { planIndex } = drop;
    // MERGE-10: dropped onto the grid, the pages go at that position. At a
    // file boundary the file itself slots in between; inside another file's
    // pages the list appends it and the plan interleaves (pages rearranged).
    if (planIndex >= 0) {
      atIndex = fileIndexForPlanDrop(plan, entries, planIndex);
      pendingPlanIndexRef.current = recordPendingPlanIndexes(pendingPlanIndexRef.current, newEntries.map((e) => e.id), planIndex);
    }
    insertEntries(newEntries, atIndex);
    // DEBT-58: the first files into an empty list are the file arriving, not an edit.
    if (entries.length > 0 && !options.fresh) reportEdit('merge');
    recordAction('add_files');
    announce(newEntries.length === 1 ? t.filesAddedOne : formatMessage(t.filesAddedMany, { count: newEntries.length }));
  }, [entries, plan, insertEntries, dispatch, announce, takeDropPosition, t.filesAddedOne, t.filesAddedMany]);

  // One undo step: the snapshot restores the file and its pages where they
  // were, so a page order rearranged across files survives remove-and-undo.
  const removeEntry = useCallback((id: number) => {
    commitModel((current) => {
      const entry = current.entries.find((e) => e.id === id);
      if (!entry) return current;
      announce(formatMessage(t.fileRemoved, { name: entry.file.name }));
      return { ...current, entries: current.entries.filter((e) => e.id !== id), plan: removeFile(current.plan, id) };
    });
    recordAction('remove_file');
    reportEdit('merge');
  }, [commitModel, announce, t.fileRemoved]);

  // Reordering a file regroups the plan around the new file order (MERGE-09).
  const applyFileReorder = useCallback((oldIndex: number, newIndex: number) => {
    if (oldIndex === newIndex) return;
    commitModel((current) => withFileOrder(current, moveEntryTo(current.entries, oldIndex, newIndex), 'added'));
    recordAction('reorder');
    reportEdit('merge');
  }, [commitModel]);

  const moveFileEntry = useCallback((id: number, delta: number) => {
    commitModel((current) => {
      const next: FileEntry[] = moveEntry(current.entries, id, delta);
      if (next === current.entries) return current;
      const newIndex = next.findIndex((e) => e.id === id);
      const moved = next[newIndex];
      announce(formatMessage(t.fileMovedTo, { name: moved.file.name, position: newIndex + 1, total: next.length }));
      return withFileOrder(current, next, 'added');
    });
    recordAction('reorder');
    reportEdit('merge');
  }, [commitModel, announce, t.fileMovedTo]);

  const onSortChange = useCallback((value: string) => {
    const mode = value as SortMode;
    commitModel((current) => withFileOrder(current, sortFiles(entries, mode), mode));
    announce(t.filesReordered);
    reportEdit('merge');
    recordAction('sort');
  }, [entries, commitModel, announce, t.filesReordered]);

  const resetPageOrder = useCallback(() => {
    commitModel((current) => ({ ...current, plan: regroupPlan(current.plan, current.entries.map((e) => e.id)) }));
    announce(t.filesReordered);
    recordAction('sort');
    reportEdit('merge');
  }, [commitModel, announce, t.filesReordered]);

  /** Forgets files still waiting for a grid position (Clear all, hand-off). */
  const forgetPendingPlanIndexes = useCallback(() => {
    pendingPlanIndexRef.current = new Map();
  }, []);

  return {
    inspectEntry, addFiles, removeEntry, applyFileReorder, moveFileEntry, onSortChange, resetPageOrder, forgetPendingPlanIndexes,
  };
}
