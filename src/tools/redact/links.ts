/**
 * RED-14: a box's edit can fan out along two independent link kinds - its
 * repeat group (repeatGroup.ts) and its find set (findSet.ts). Pure logic
 * only: PdfRedactTool.tsx owns ids, history and announcements.
 *
 * `linkedChanges` is the merge PdfRedactTool.tsx used to do itself
 * (`mergeChangesById(groupChanges(...), findSetChanges(...))`), moved here so
 * it can be tested and reused without dragging in the component.
 */

import { groupChanges, groupMembers, type GroupableElement } from './repeatGroup.ts';
import { findSetChanges, findSetMembers, type FindSetElement } from './findSet.ts';

export interface LinkedElement {
  id: string;
  pageIndex: number;
  type: string;
  [key: string]: unknown;
}

export type BoxChanges<T> = { id: string; changes: Partial<T> };

/**
 * Per-box changes for an edit to `id`: its repeat-group siblings and its
 * find-set siblings, merged by id so a box in both gets one update carrying
 * both. The edited box comes first, then the rest in first-seen order.
 */
export function linkedChanges<T extends LinkedElement>(
  elements: readonly T[],
  id: string,
  changes: Partial<T>,
): BoxChanges<T>[] {
  const lists = [
    groupChanges(elements as readonly (T & GroupableElement)[], id, changes),
    findSetChanges(elements as readonly (T & FindSetElement)[], id, changes),
  ];
  const order: string[] = [];
  const merged = new Map<string, Partial<T>>();
  for (const list of lists) {
    for (const { id: boxId, changes: boxChanges } of list) {
      if (!merged.has(boxId)) order.push(boxId);
      merged.set(boxId, { ...merged.get(boxId), ...boxChanges });
    }
  }
  return order.map((boxId) => ({ id: boxId, changes: merged.get(boxId) as Partial<T> }));
}

/** Which set a removal targets. */
export type LinkKind = 'repeatGroup' | 'findSet';

/** Every box linked to `id` by the given kind, the box itself included; just the box when it has no such set. */
export function linkMembers<T extends LinkedElement>(elements: readonly T[], id: string, kind: LinkKind): T[] {
  if (kind === 'repeatGroup') return groupMembers(elements as readonly (T & GroupableElement)[], id);
  return findSetMembers(elements as readonly (T & FindSetElement)[], id);
}
