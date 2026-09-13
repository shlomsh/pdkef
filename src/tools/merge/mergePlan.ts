/**
 * MERGE-09: a pure, framework-free model of "what the merge output will look
 * like" - the ordered list of source pages (which file, which page, what
 * rotation, skipped or not) that the Merge island's drag-and-drop UI edits
 * and that merge.js's mergePdfs() eventually executes against real files.
 *
 * Deliberately has no Preact import and no pdf-lib import: everything here
 * is array bookkeeping over plain objects, so the reorder/regroup/rotate
 * logic the UI depends on can be unit-tested (and reasoned about) without a
 * DOM, a PDF, or SortableJS. src/tools/merge/merge.js imports the two name-building
 * helpers from here so the "what do we call the merged file" rule lives in
 * one place next to the plan it is named after; it does not import anything
 * else exported here.
 *
 * Every function returns a new array/object and never mutates its
 * arguments - the island's state setters (and these unit tests) rely on
 * that to treat a plan like any other piece of Preact state.
 */

export interface PlanEntry {
  key: string;
  fileId: number;
  pageIndex: number;
  rotation: number;
  skipped: boolean;
}

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

function planKey(fileId: number, pageIndex: number): string {
  return `${fileId}:${pageIndex}`;
}

// The initial plan for one freshly-added file: every one of its pages, in
// order, unrotated and unskipped.
export function planForFile(fileId: number, pageCount: number): PlanEntry[] {
  const entries: PlanEntry[] = [];
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    entries.push({ key: planKey(fileId, pageIndex), fileId, pageIndex, rotation: 0, skipped: false });
  }
  return entries;
}

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

function clampIndex(index: number, length: number): number {
  if (index < 0) return 0;
  if (index > length) return length;
  return index;
}

// Moves a single entry from one position to another (a single-page drag
// within the grid). Both indexes are clamped into range rather than
// throwing, since a UI drag can report an index one past the end.
export function moveEntry(plan: PlanEntry[], fromIndex: number, toIndex: number): PlanEntry[] {
  if (plan.length === 0) return [...plan];
  const from = clampIndex(fromIndex, plan.length - 1);
  const next = [...plan];
  const [moved] = next.splice(from, 1);
  const to = clampIndex(toIndex, next.length);
  next.splice(to, 0, moved);
  return next;
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

// Patches one entry's rotation and/or skipped flag by key, leaving every
// other entry (and every other field of this one) untouched.
export function updateEntry(
  plan: PlanEntry[],
  key: string,
  patch: Partial<Pick<PlanEntry, 'rotation' | 'skipped'>>,
): PlanEntry[] {
  return plan.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry));
}

// Adds a +-90 rotation delta to one entry, normalised into [0, 360).
export function rotateEntry(plan: PlanEntry[], key: string, delta: 90 | -90): PlanEntry[] {
  return plan.map((entry) => {
    if (entry.key !== key) return entry;
    const rotation = ((entry.rotation + delta) % 360 + 360) % 360;
    return { ...entry, rotation };
  });
}

// How many pages the merged PDF will actually have - every entry that isn't
// skipped.
export function outputPageCount(plan: PlanEntry[]): number {
  return plan.reduce((count, entry) => (entry.skipped ? count : count + 1), 0);
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

function baseName(fileName: string): string {
  // Strip exactly the final extension, the same way a Finder/Explorer
  // "name" column would: 'Invoice 2024-03-01.pdf' -> 'Invoice 2024-03-01',
  // but a dotfile-style name with no other dot ('.hidden.pdf' has one) keeps
  // its leading dot rather than being stripped down to '' - the last dot
  // must not be the first character for us to treat it as an extension
  // marker.
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0) return fileName;
  return fileName.slice(0, lastDot);
}

// Builds the merged file's display title (no '.pdf' suffix): `merged_`
// ahead of the first file's own base name, exactly the way `signed_`/
// `redacted_` are built beside the source name in Sign and Redact - no
// count, no connector, no template, so there is nothing for a locale to
// phrase differently (see the MERGE_FILE_NAME_PREFIX comment above).
export function mergedTitle(firstFileName: string): string {
  // The derived name goes through the same sanitiser as a typed one, so a
  // source called "a+b.pdf" never puts a "+" in the merged name either.
  const name = sanitizeOutputName(baseName(firstFileName)) || 'merged';
  return `${MERGED_FILE_NAME_PREFIX}${name}`;
}

// Same as mergedTitle, with the '.pdf' extension the download actually needs.
export function mergedFileName(firstFileName: string): string {
  return `${mergedTitle(firstFileName)}.pdf`;
}

// MERGE-11 (2026-09-13, Shlomi): once a person renames the merged file, it is
// theirs - sanitised on commit the way a filesystem name would be, never
// rejected outright. Path separators are stripped (they would otherwise let
// a typed name read like a directory) and control characters (there is no
// legitimate reason for one in a file name), then the result is trimmed and
// capped at 120 characters. "+" goes too (Shlomi, 2026-09-13): the retired
// "<first> + N more" template is the one thing the merged name must never
// read like again, whichever way a "+" got in, so it is dropped and the
// spaces around it collapse. Deliberately not a filesystem-reserved-character
// denylist beyond that - ":", "?", "*" and similar survive, since the
// browser's own download mechanism, not this function, is what turns the
// string into a real file on disk. Unicode is kept as typed (a Hebrew or
// Arabic name included); the cap counts code points via Array.from, not
// UTF-16 length, so it can never split a surrogate pair.
export function sanitizeOutputName(raw: string): string {
  const stripped = raw
    .replace(/[\\/+]/g, '')
    .replace(/\p{Cc}/gu, '')
    .replace(/ {2,}/g, ' ');
  const trimmed = stripped.trim();
  const codepoints = Array.from(trimmed);
  return codepoints.length > 120 ? codepoints.slice(0, 120).join('') : trimmed;
}
