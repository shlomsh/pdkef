/**
 * RED-03: boxes repeated on every page stay linked. Pure logic only:
 * PdfRedactTool.tsx owns ids, history and announcements.
 *
 * A box's group is its `repeatGroupId`, or its own id when it has none, so
 * every box is a group of one until it is repeated, and a draft saved before
 * linking existed restores as independent boxes. Copies take the source's
 * group key, which means repeating never has to change the source itself:
 * every group action (repeat, edit, duplicate, unlink, remove) stays one
 * plain add, update or delete in history.
 */

export interface GroupableElement {
  id: string;
  pageIndex: number;
  type: string;
  [key: string]: unknown;
}

/** Fields an edit to one linked box applies to every box in its group. */
export const SHARED_FIELDS = ['left', 'top', 'width', 'height', 'color', 'strength'] as const;

export function groupKey(element: GroupableElement): string {
  const key = element.repeatGroupId;
  return typeof key === 'string' && key ? key : element.id;
}

/** Every box in `id`'s group, the box itself included, in stacking order. */
export function groupMembers<T extends GroupableElement>(elements: readonly T[], id: string): T[] {
  const target = elements.find((element) => element.id === id);
  if (!target) return [];
  const key = groupKey(target);
  return elements.filter((element) => groupKey(element) === key);
}

/**
 * The per-box changes an edit to `id` becomes: the box gets every change,
 * and each other member of its group gets the shared fields among them. A
 * change with no shared field (or a box on its own) touches only `id`.
 */
export function groupChanges<T extends GroupableElement>(
  elements: readonly T[],
  id: string,
  changes: Partial<T>,
): { id: string; changes: Partial<T> }[] {
  const shared = Object.fromEntries(
    Object.entries(changes).filter(([key]) => (SHARED_FIELDS as readonly string[]).includes(key)),
  ) as Partial<T>;
  const others = Object.keys(shared).length === 0
    ? []
    : groupMembers(elements, id).filter((member) => member.id !== id);
  return [{ id, changes }, ...others.map((member) => ({ id: member.id, changes: shared }))];
}

/**
 * Copies of `source` for every page that has no box of its group yet (and no
 * identical box of the same type and geometry), each joined to its group.
 */
export function repeatCopies<T extends GroupableElement>(
  source: T,
  elements: readonly T[],
  numPages: number,
  makeId: () => string,
): T[] {
  const key = groupKey(source);
  const covered = (pageIndex: number) => elements.some((element) => element.pageIndex === pageIndex && (
    groupKey(element) === key || sameBox(source, element)
  ));
  const copies: T[] = [];
  for (let pageIndex = 0; pageIndex < numPages; pageIndex += 1) {
    if (pageIndex === source.pageIndex || covered(pageIndex)) continue;
    copies.push({ ...source, id: makeId(), pageIndex, repeatGroupId: key });
  }
  return copies;
}

function sameBox(a: GroupableElement, b: GroupableElement): boolean {
  return a.type === b.type && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

/**
 * A duplicate of `id`'s whole group: one new box per member, nudged by
 * `offset`% like a single duplicate (kept on the page), sharing a new group
 * key of their own so editing the duplicate never moves the original.
 */
export function duplicateGroup<T extends GroupableElement>(
  elements: readonly T[],
  id: string,
  makeId: () => string,
  offset = 4,
): T[] {
  const members = groupMembers(elements, id);
  if (members.length === 0) return [];
  const ids = members.map(() => makeId());
  const newKey = ids[members.findIndex((member) => member.id === id)];
  return members.map((member, i) => ({
    ...member,
    id: ids[i],
    left: Math.min(90, Number(member.left) + offset),
    top: Math.min(90, Number(member.top) + offset),
    repeatGroupId: newKey,
  }));
}
