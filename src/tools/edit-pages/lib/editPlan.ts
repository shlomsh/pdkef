import type { PlanEntry } from '../../../lib/pages/pagePlan.ts';

/* Edit Pages' half of the shared page plan: what editPages.js reads out of it.
   The bulk updaters (Include all / Skip all / Invert) live in lib/pages/pagePlan.ts. */

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
