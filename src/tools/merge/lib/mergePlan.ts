/**
 * MERGE-09: a pure, framework-free model of "what the merge output will look
 * like" - the ordered list of source pages (which file, which page, what
 * rotation, skipped or not) that the Merge island's drag-and-drop UI edits
 * and that merge.js's mergePdfs() eventually executes against real files.
 *
 * Deliberately has no Preact import and no pdf-lib import: everything here
 * is array bookkeeping over plain objects, so the reorder/regroup/rotate
 * logic the UI depends on can be unit-tested (and reasoned about) without a
 * DOM, a PDF, or SortableJS. src/tools/merge/lib/merge.js imports the two name-building
 * helpers from here so the "what do we call the merged file" rule lives in
 * one place next to the plan it is named after; it does not import anything
 * else exported here.
 *
 * Every function returns a new array/object and never mutates its
 * arguments - the island's state setters (and these unit tests) rely on
 * that to treat a plan like any other piece of Preact state.
 */

import { sanitizeOutputName } from '#lib/output/sanitizeOutputName.ts';
import { outputName, withAffixes } from '#lib/output/outputName.ts';
import { clampIndex, planForFile, type PlanEntry } from '#lib/pages/pagePlan.ts';
import { sortEntries } from '#lib/pages/pageOrder.js';
import type { FileEntry, Model, SortMode } from './mergeModel.ts';
export interface MergeMapEntry {
  fileIndex: number;
  pageIndex: number;
  rotation: number;
  skipped: boolean;
}

// MERGE-03 (2026-09-13, Shlomi - reversal, see backlog/tasks/MERGE-03.md's
// history): back to a `merged_` prefix after all, the same shape as Sign's
// `signed_` and Redact's `redacted_` - every other tool marks its output
// with the tool's name on the source file's own name, and `<first> + N more`
// broke that shape for no real gain. One file gets the same treatment
// (`merged_<name>.pdf`); there is no more single-file special case. A first
// file that already carries another tool's prefix chains rather than
// collapsing (`signed_form.pdf` -> `merged_signed_form.pdf`). The prefix is
// deliberately the same, un-translated, on the Hebrew edition - Sign does
// the same with `signed_` - so files produced by either edition sort
// together in a folder. With an LTR prefix and no composed sentence around
// it, there is nothing left to bidi-isolate: `merged_`, then the name in its
// own direction, then `.pdf`, renders correctly in Finder, in Files, and in
// the document heading, for a Hebrew or Arabic first file same as a Latin
// one.
export const MERGED_FILE_NAME_PREFIX = 'merged_';

// Distinct file ids in the order they first appear in the plan - the file
// list order the UI shows above the page grid, derived from the plan rather
// than tracked separately so the two can never drift apart.
export function fileOrder(plan: PlanEntry[]): number[] {
  const seen = new Set<number>();
  const order: number[] = [];
  for (const entry of plan) {
    if (!seen.has(entry.fileId)) {
      seen.add(entry.fileId);
      order.push(entry.fileId);
    }
  }
  return order;
}

// True when every file's pages sit in one contiguous run - i.e. the plan
// still looks like "file A's pages, then file B's pages, ..." rather than an
// interleaving produced by dragging individual pages across file
// boundaries. moveFileBlock (dragging a whole file's thumbnail strip) is
// only meaningful while this holds; the UI uses it to decide whether
// "reorder by file" controls still make sense.
export function isGrouped(plan: PlanEntry[]): boolean {
  const startIndexOfFile = new Map<number, number>();
  const lastFileSeenAt = new Map<number, number>();
  for (let i = 0; i < plan.length; i += 1) {
    const { fileId } = plan[i];
    if (!startIndexOfFile.has(fileId)) {
      startIndexOfFile.set(fileId, i);
    } else {
      // A later entry with a fileId that isn't the immediately preceding
      // entry's fileId, and isn't a return to the entry right before it,
      // means that file's run was interrupted by another file's page.
      const prevFileId = plan[i - 1].fileId;
      if (prevFileId !== fileId && lastFileSeenAt.has(fileId)) {
        return false;
      }
    }
    lastFileSeenAt.set(fileId, i);
  }
  return true;
}

// True when the plan is grouped AND its file blocks appear in exactly the
// order fileIds lists them (restricted to the files that actually have plan
// entries - a file whose page count is still unknown has no entries yet and
// is ignored, not treated as a mismatch). Exists so the rail's "Files, in
// order" list and the grid's output order can never silently disagree: the
// rail is drawn from fileIds while the grid is drawn from the plan, and
// without this check a drag that reordered one but not the other would look
// fine in both places while producing a merged PDF nobody asked for.
export function isInListOrder(plan: PlanEntry[], fileIds: number[]): boolean {
  if (!isGrouped(plan)) return false;
  const planOrder = fileOrder(plan);
  const planIds = new Set(planOrder);
  const restricted = fileIds.filter((fileId) => planIds.has(fileId));
  if (restricted.length !== planOrder.length) return false;
  return restricted.every((fileId, index) => fileId === planOrder[index]);
}

// Rebuilds the plan grouped by file, in the given file order, keeping each
// file's own entries in their existing relative order (only the blocks
// move, never the pages within a block). Any file present in the plan but
// missing from `fileIds` keeps its block's relative position after all the
// listed files, rather than being dropped.
export function regroupPlan(plan: PlanEntry[], fileIds: number[]): PlanEntry[] {
  const byFile = new Map<number, PlanEntry[]>();
  for (const entry of plan) {
    const bucket = byFile.get(entry.fileId);
    if (bucket) bucket.push(entry);
    else byFile.set(entry.fileId, [entry]);
  }

  const order = [...fileIds];
  for (const fileId of fileOrder(plan)) {
    if (!order.includes(fileId)) order.push(fileId);
  }

  const result: PlanEntry[] = [];
  for (const fileId of order) {
    const bucket = byFile.get(fileId);
    if (bucket) result.push(...bucket);
  }
  return result;
}

// Reorders whole file blocks (dragging a file's thumbnail strip among other
// files), moving fileId's block to sit at file-order position toPosition.
// Only meaningful when isGrouped(plan) is true; called on an ungrouped plan
// it still produces a plan grouped by the new file order (each file's
// entries collapse back into one block), since regroupPlan is what actually
// does the work.
export function moveFileBlock(plan: PlanEntry[], fileId: number, toPosition: number): PlanEntry[] {
  const order = fileOrder(plan);
  const fromPosition = order.indexOf(fileId);
  if (fromPosition === -1) return [...plan];

  const reordered = [...order];
  reordered.splice(fromPosition, 1);
  const clampedTo = clampIndex(toPosition, reordered.length);
  reordered.splice(clampedTo, 0, fileId);

  return regroupPlan(plan, reordered);
}

// Splices a run of new entries (typically a freshly planForFile()'d file)
// into the plan at atIndex, e.g. when a file is dropped onto the grid
// between two existing pages rather than appended.
export function insertPages(plan: PlanEntry[], entries: PlanEntry[], atIndex: number): PlanEntry[] {
  const at = clampIndex(atIndex, plan.length);
  const next = [...plan];
  next.splice(at, 0, ...entries);
  return next;
}

// Drops every entry belonging to fileId (removing a file from the merge
// entirely, as opposed to skipping its pages individually).
export function removeFile(plan: PlanEntry[], fileId: number): PlanEntry[] {
  return plan.filter((entry) => entry.fileId !== fileId);
}

// Translates the plan's stable fileIds into the positional fileIndex shape
// mergePdfs() consumes, against fileIds: the ordered array of File objects
// the island is about to hand to mergePdfs. Throws if the plan references a
// fileId that array doesn't contain, since that would silently merge the
// wrong file's pages.
export function toMergeMap(plan: PlanEntry[], fileIds: number[]): MergeMapEntry[] {
  return plan.map((entry) => {
    const fileIndex = fileIds.indexOf(entry.fileId);
    if (fileIndex === -1) {
      throw new Error(`toMergeMap: plan entry references unknown fileId ${entry.fileId}`);
    }
    return { fileIndex, pageIndex: entry.pageIndex, rotation: entry.rotation, skipped: entry.skipped };
  });
}

// Builds the merged file's display title (no '.pdf' suffix): `merged_`
// ahead of the first file's own base name, exactly the way `signed_`/
// `redacted_` are built beside the source name in Sign and Redact - no
// count, no connector, no template, so there is nothing for a locale to
// phrase differently (see the MERGE_FILE_NAME_PREFIX comment above).
export function mergedTitle(firstFileName: string): string {
  // The derived name goes through the same sanitiser as a typed one, so a
  // source called "a+b.pdf" never puts a "+" in the merged name either.
  // Strips exactly the final extension, the way a Finder/Explorer "name" column would
  // ('Invoice 2024-03-01.pdf' -> 'Invoice 2024-03-01'); a dotfile-style name keeps its leading dot.
  return outputName(firstFileName, { prefix: MERGED_FILE_NAME_PREFIX, strip: 'extension-keep-dotfile', sanitize: true, fallback: 'merged', ext: null });
}

// Same as mergedTitle, with the '.pdf' extension the download actually needs.
export function mergedFileName(firstFileName: string): string {
  return withAffixes(mergedTitle(firstFileName));
}

// The sanitiser moved to src/lib so the shared shell OutputName can use it too.
export { sanitizeOutputName };

/* ---- Island bookkeeping: pure functions from state to the next state ---- */

/* Where a file's pages go in the plan once its page count arrives: before
   the first plan entry of any file that comes later in the list, so a file
   inserted between two others lands between their pages even when its
   count resolves after theirs. */
export function planInsertionIndex(plan: PlanEntry[], entries: FileEntry[], fileId: number): number {
  const position = entries.findIndex((e) => e.id === fileId);
  const laterIds = new Set(entries.slice(position + 1).map((e) => e.id));
  const index = plan.findIndex((entry) => laterIds.has(entry.fileId));
  return index === -1 ? plan.length : index;
}

export interface Inspection {
  pageCount: number;
  encrypted: boolean;
  creationDate?: number | null;
}

/* What a finished inspection does to one snapshot of the document: the entry
   gets its count, date and lock state, and (unless it is locked or already
   has pages) its pages enter the plan at the recorded drop position, else
   where its place in the list says. `recordedIndex` is the grid position the
   file was dropped at, if any. Runs on every undo/redo snapshot, so it must
   stay pure and idempotent per snapshot. */
export function applyInspection(snapshot: Model, entryId: number, result: Inspection, recordedIndex: number | null | undefined): Model {
  if (!snapshot.entries.some((e) => e.id === entryId)) return snapshot;
  const nextEntries = snapshot.entries.map((e) =>
    e.id === entryId
      ? { ...e, pageCount: result.pageCount, pdfCreationDate: result.creationDate ?? null, error: result.encrypted ? ('encrypted' as const) : null }
      : e,
  );
  if (result.encrypted || snapshot.plan.some((p) => p.fileId === entryId)) return { ...snapshot, entries: nextEntries };
  const at = recordedIndex == null
    ? planInsertionIndex(snapshot.plan, nextEntries, entryId)
    : Math.min(recordedIndex, snapshot.plan.length);
  return { ...snapshot, entries: nextEntries, plan: insertPages(snapshot.plan, planForFile(entryId, result.pageCount), at) };
}

/* Files dropped on the grid together record one plan index each (MERGE-10).
   Returns the map with the settled file's record dropped and, when it placed
   pages, every record at or past it moved past those pages. */
export function settlePendingPlanIndexes(
  pending: ReadonlyMap<number, number>,
  entryId: number,
  result: Pick<Inspection, 'pageCount' | 'encrypted'>,
): Map<number, number> {
  const next = new Map(pending);
  const recorded = next.get(entryId);
  if (recorded == null) return next;
  next.delete(entryId);
  if (!result.encrypted) {
    for (const [id, index] of next) {
      if (index >= recorded) next.set(id, index + result.pageCount);
    }
  }
  return next;
}

/* Records the grid position every new entry was dropped at. */
export function recordPendingPlanIndexes(pending: ReadonlyMap<number, number>, entryIds: number[], planIndex: number): Map<number, number> {
  const next = new Map(pending);
  for (const id of entryIds) next.set(id, planIndex);
  return next;
}

/* The file-list position a grid drop at `planIndex` implies. At a file
   boundary the file itself slots in between; inside another file's pages
   (or past the end) the list appends it (-1) and the plan interleaves. */
export function fileIndexForPlanDrop(plan: PlanEntry[], entries: FileEntry[], planIndex: number): number {
  const owner = plan[planIndex];
  const boundary = !owner || planIndex === 0 || plan[planIndex - 1].fileId !== owner.fileId;
  return owner && boundary ? entries.findIndex((e) => e.id === owner.fileId) : -1;
}

/* New entries go at atIndex; an index outside the list appends. */
export function insertEntriesAt(entries: FileEntry[], added: FileEntry[], atIndex: number): FileEntry[] {
  const next = [...entries];
  const index = atIndex < 0 || atIndex > next.length ? next.length : atIndex;
  next.splice(index, 0, ...added);
  return next;
}

/* One entry moved from oldIndex to newIndex. */
export function moveEntryTo(entries: FileEntry[], oldIndex: number, newIndex: number): FileEntry[] {
  const next = [...entries];
  const [moved] = next.splice(oldIndex, 1);
  next.splice(newIndex, 0, moved);
  return next;
}

/* The file order a Sort menu choice produces. 'reversed' flips the current
   order, 'added' restores the order files arrived in (their ids), the rest
   sort by name or date. */
export function sortFiles(entries: FileEntry[], mode: SortMode): FileEntry[] {
  if (mode === 'reversed') return [...entries].reverse();
  if (mode === 'added') return [...entries].sort((a, b) => a.id - b.id);
  return sortEntries(entries, mode);
}

/* The Model after the files take a new order: the plan regroups around it. */
export function withFileOrder(current: Model, files: FileEntry[], mode: SortMode): Model {
  return { entries: files, plan: regroupPlan(current.plan, files.map((e) => e.id)), sortMode: mode };
}
