/**
 * MERGE-09: a pure, framework-free model of "what the merge output will look
 * like" - the ordered list of source pages (which file, which page, what
 * rotation, skipped or not) that the Merge island's drag-and-drop UI edits
 * and that merge.js's mergePdfs() eventually executes against real files.
 *
 * Deliberately has no Preact import and no pdf-lib import: everything here
 * is array bookkeeping over plain objects, so the reorder/regroup/rotate
 * logic the UI depends on can be unit-tested (and reasoned about) without a
 * DOM, a PDF, or SortableJS. src/lib/merge.js imports the two name-building
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

// The same naming shape as the other tools (signed_<name>, redacted_<name>):
// a tool prefix on the first file's name. `{count}` stays available to a
// locale template that wants to mention the other files.
export const DEFAULT_OUTPUT_NAME_TEMPLATE = 'merged_{name}';

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

// Builds the merged file's display title (no '.pdf' suffix): the tool prefix
// on the first file's own name. `template` lets a locale phrase this
// differently and may also use `{count}`, how many other files were folded
// in; a single file keeps its own name untouched. This function does not
// validate the template - it just substitutes.
export function mergedTitle(
  firstFileName: string,
  otherCount: number,
  template: string = DEFAULT_OUTPUT_NAME_TEMPLATE,
): string {
  const name = baseName(firstFileName) || firstFileName || 'merged';
  if (otherCount <= 0) return name || 'merged';
  const title = template.replace('{name}', name).replace('{count}', String(otherCount));
  return title || 'merged';
}

// Same as mergedTitle, with the '.pdf' extension the download actually needs.
export function mergedFileName(
  firstFileName: string,
  otherCount: number,
  template: string = DEFAULT_OUTPUT_NAME_TEMPLATE,
): string {
  return `${mergedTitle(firstFileName, otherCount, template)}.pdf`;
}
