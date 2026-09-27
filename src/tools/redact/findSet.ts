/**
 * RED-11: boxes added by one Find action share a `findSetId`, so they can be
 * removed together and share blur strength. Unlike a repeat group
 * (repeatGroup.ts) nothing about geometry is shared: each found box covers
 * its own word. Pure logic only; PdfRedactTool.tsx owns ids and history.
 */

export interface FindSetElement {
  id: string;
  findSetId?: string;
  strength?: unknown;
}

/** Fields an edit to one found box applies to every box of its set. */
export const FIND_SET_SHARED_FIELDS: readonly (keyof FindSetElement)[] = ['strength'];

export function findSetKey(element: FindSetElement): string | null {
  const key = element.findSetId;
  return typeof key === 'string' && key ? key : null;
}

/** Every box in `id`'s find set, the box itself included; just the box when it has no set. */
export function findSetMembers<T extends FindSetElement>(elements: readonly T[], id: string): T[] {
  const target = elements.find((element) => element.id === id);
  if (!target) return [];
  const key = findSetKey(target);
  return key ? elements.filter((element) => findSetKey(element) === key) : [target];
}

/**
 * The per-box changes an edit to `id` becomes: the box gets every change, and
 * each other member of its set gets the shared fields among them.
 */
export function findSetChanges<T extends FindSetElement>(
  elements: readonly T[],
  id: string,
  changes: Partial<T>,
): { id: string; changes: Partial<T> }[] {
  const shared = Object.fromEntries(
    Object.entries(changes).filter(([key]) => FIND_SET_SHARED_FIELDS.includes(key as keyof FindSetElement)),
  ) as Partial<T>;
  const others = Object.keys(shared).length === 0
    ? []
    : findSetMembers(elements, id).filter((member) => member.id !== id);
  return [{ id, changes }, ...others.map((member) => ({ id: member.id, changes: shared }))];
}

/** A copy of a found box that belongs to no set (duplicate, repeat on every page). */
export function withoutFindSet<T extends FindSetElement>(element: T): T {
  if (!('findSetId' in element)) return element;
  const { findSetId: _dropped, ...rest } = element;
  return rest as T;
}
