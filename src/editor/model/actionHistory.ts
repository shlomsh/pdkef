import { uniqueId } from './ids.ts';

/** Minimum identity required by the shared undo command model. */
export interface HistoryElement {
  id: string;
  pageIndex: number;
}

/**
 * An immutable element capture at its original position in the editor's flat
 * paint-order array. Lower indexes paint first; restoring at this index
 * therefore restores the original stacking order as well as the element.
 */
export interface HistoryElementSnapshot<TElement extends HistoryElement = HistoryElement> {
  element: TElement;
  index: number;
}

export type HistoryOperation = 'add' | 'delete';

/**
 * One atomic, reversible editor command. Both add and delete retain complete
 * snapshots so persisted history is self-contained and can later support redo
 * without reconstructing an element from live editor state.
 */
export interface ActionHistoryEntry<TElement extends HistoryElement = HistoryElement> {
  id: string;
  type: string;
  operation: HistoryOperation;
  pageIndex: number;
  description: string;
  timestamp: number;
  elements: HistoryElementSnapshot<TElement>[];
}

export type NewActionHistoryEntry<TElement extends HistoryElement> = Omit<
  ActionHistoryEntry<TElement>,
  'id' | 'timestamp'
>;

export type HistoryLogger<TElement extends HistoryElement> = (
  operation: HistoryOperation,
  type: string,
  pageIndex: number,
  description: string,
  elements: HistoryElementSnapshot<TElement>[],
) => void;

/** Captures selected elements without retaining mutable live-state objects. */
export function captureElementSnapshots<TElement extends HistoryElement>(
  elements: readonly TElement[],
  include: (element: TElement) => boolean,
): HistoryElementSnapshot<TElement>[] {
  return elements.flatMap((element, index) => (
    include(element) ? [{ element: { ...element }, index }] : []
  ));
}

/** Captures a newly-created element at the index where it was appended. */
export function captureAddedElement<TElement extends HistoryElement>(
  element: TElement,
  index: number,
): HistoryElementSnapshot<TElement> {
  return { element: { ...element }, index };
}

export function createActionEntry<TElement extends HistoryElement>(
  entry: NewActionHistoryEntry<TElement>,
): ActionHistoryEntry<TElement> {
  return { id: uniqueId(), timestamp: Date.now(), ...entry };
}

/** Runtime guard used at the persisted-draft boundary. */
export function isActionHistoryEntry<TElement extends HistoryElement>(
  value: unknown,
  isElement: (candidate: unknown) => candidate is TElement,
): value is ActionHistoryEntry<TElement> {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== 'string' || !entry.id) return false;
  if (typeof entry.type !== 'string' || !entry.type) return false;
  if (entry.operation !== 'add' && entry.operation !== 'delete') return false;
  if (!Number.isInteger(entry.pageIndex) || (entry.pageIndex as number) < 0) return false;
  if (typeof entry.description !== 'string') return false;
  if (typeof entry.timestamp !== 'number' || !Number.isFinite(entry.timestamp)) return false;
  if (!Array.isArray(entry.elements) || entry.elements.length === 0) return false;

  const seenIds = new Set<string>();
  return entry.elements.every((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const snapshot = candidate as Record<string, unknown>;
    if (!Number.isInteger(snapshot.index) || (snapshot.index as number) < 0) return false;
    if (!isElement(snapshot.element)) return false;
    if (snapshot.element.pageIndex !== entry.pageIndex || seenIds.has(snapshot.element.id)) return false;
    seenIds.add(snapshot.element.id);
    return true;
  });
}

function restoreSnapshots<TElement extends HistoryElement>(
  elements: readonly TElement[],
  snapshots: readonly HistoryElementSnapshot<TElement>[],
): TElement[] {
  const restored = [...elements];
  const ordered = [...snapshots].sort((a, b) => a.index - b.index);
  for (const { element, index } of ordered) {
    if (restored.some((current) => current.id === element.id)) continue;
    restored.splice(Math.min(index, restored.length), 0, { ...element });
  }
  return restored;
}

/**
 * Reverts commands in the order supplied. History is newest-first, so passing
 * a filtered history array gives selective undo the same deterministic order
 * as repeatedly pressing Cmd/Ctrl+Z.
 */
export function revertHistoryEntries<TElement extends HistoryElement>(
  elements: readonly TElement[],
  entries: readonly ActionHistoryEntry<TElement>[],
): TElement[] {
  return entries.reduce<TElement[]>((current, entry) => {
    if (entry.operation === 'add') {
      const addedIds = new Set(entry.elements.map(({ element }) => element.id));
      return current.filter((element) => !addedIds.has(element.id));
    }
    return restoreSnapshots(current, entry.elements);
  }, [...elements]);
}
