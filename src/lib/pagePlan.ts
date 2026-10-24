export interface PlanEntry {
  key: string;
  fileId: number;
  pageIndex: number;
  rotation: number;
  skipped: boolean;
}

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
