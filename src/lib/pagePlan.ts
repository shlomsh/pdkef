export interface PlanEntry {
  key: string;
  fileId: number;
  pageIndex: number;
  rotation: number;
  skipped: boolean;
}

function entryKey(fileId: number, pageIndex: number): string {
  return `${fileId}:${pageIndex}`;
}

// The initial plan for one freshly-added file: every one of its pages, in
// order, unrotated and unskipped.
export function planForFile(fileId: number, pageCount: number): PlanEntry[] {
  const entries: PlanEntry[] = [];
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    entries.push({ key: entryKey(fileId, pageIndex), fileId, pageIndex, rotation: 0, skipped: false });
  }
  return entries;
}

export function clampIndex(index: number, length: number): number {
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

// What a prepared output is keyed on: every field of every entry that changes
// the exported file, in order.
export function planKey(plan: PlanEntry[]): string {
  return plan.map((e) => `${e.fileId}.${e.pageIndex}.${e.rotation}.${e.skipped ? 1 : 0}`).join(',');
}

/* The bulk updaters behind Include all / Skip all / Invert. They return the
   same array when nothing changes, which is the no-op contract
   useEditHistory's commit turns into "no undo step". */
function setSkipped(plan: PlanEntry[], skipped: (entry: PlanEntry) => boolean): PlanEntry[] {
  if (plan.every((entry) => entry.skipped === skipped(entry))) return plan;
  return plan.map((entry) => (entry.skipped === skipped(entry) ? entry : { ...entry, skipped: skipped(entry) }));
}

export const includeAll = (plan: PlanEntry[]): PlanEntry[] => setSkipped(plan, () => false);

export const skipAll = (plan: PlanEntry[]): PlanEntry[] => setSkipped(plan, () => true);

export const invert = (plan: PlanEntry[]): PlanEntry[] => (
  plan.length === 0 ? plan : plan.map((entry) => ({ ...entry, skipped: !entry.skipped }))
);

// The 1-based source page numbers of the kept entries, in plan order.
export function includedPageNumbers(plan: PlanEntry[]): number[] {
  return plan.filter((entry) => !entry.skipped).map((entry) => entry.pageIndex + 1);
}

// Keeps exactly the listed source pages (1-based) and skips the rest. Same
// array when nothing changes; unchanged entries keep their identity.
export function withIncludedPages(plan: PlanEntry[], pageNumbers: number[]): PlanEntry[] {
  const wanted = new Set(pageNumbers);
  return setSkipped(plan, (entry) => !wanted.has(entry.pageIndex + 1));
}

// The rotation of each kept page that has one, by 1-based source page number: what an export adds to the page's own.
export function rotationsOf(plan: PlanEntry[]): Record<number, number> {
  const rotations: Record<number, number> = {};
  for (const entry of plan) if (!entry.skipped && entry.rotation) rotations[entry.pageIndex + 1] = entry.rotation;
  return rotations;
}
