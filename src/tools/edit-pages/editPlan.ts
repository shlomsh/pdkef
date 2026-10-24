import type { PlanEntry } from '../../lib/pagePlan.ts';

/* Edit Pages' half of the shared page plan: what editPages.js reads out of it,
   and the three bulk updaters behind Include all / Skip all / Invert. The
   updaters return the same array when nothing changes, which is the no-op
   contract useEditHistory's commit turns into "no undo step". */

export interface EditOptions {
  /** Final order, as 1-based original page numbers (skipped pages included; removedPageNums drops them). */
  pageOrder: number[];
  removedPageNums: Set<number>;
  /** 1-based page number to the degrees added to that page. */
  rotations: Record<number, number>;
}

export function editOptionsFromPlan(plan: PlanEntry[]): EditOptions {
  const removedPageNums = new Set<number>();
  const rotations: Record<number, number> = {};
  const pageOrder = plan.map((entry) => {
    const pageNum = entry.pageIndex + 1;
    if (entry.skipped) removedPageNums.add(pageNum);
    if (entry.rotation !== 0) rotations[pageNum] = entry.rotation;
    return pageNum;
  });
  return { pageOrder, removedPageNums, rotations };
}

function setSkipped(plan: PlanEntry[], skipped: (entry: PlanEntry) => boolean): PlanEntry[] {
  if (plan.every((entry) => entry.skipped === skipped(entry))) return plan;
  return plan.map((entry) => (entry.skipped === skipped(entry) ? entry : { ...entry, skipped: skipped(entry) }));
}

export const includeAll = (plan: PlanEntry[]): PlanEntry[] => setSkipped(plan, () => false);

export const skipAll = (plan: PlanEntry[]): PlanEntry[] => setSkipped(plan, () => true);

export const invert = (plan: PlanEntry[]): PlanEntry[] => (
  plan.length === 0 ? plan : plan.map((entry) => ({ ...entry, skipped: !entry.skipped }))
);
