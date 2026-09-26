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

export type SnapshotOperation = 'add' | 'delete';
export type HistoryOperation = SnapshotOperation | 'update';

/**
 * One element's change, as the fields that changed and nothing else: `before`
 * holds their values as they were, `after` as they became. A key that was
 * absent before is present in `before` with the value `undefined`, so
 * reverting clears it again. Only the changed fields are kept (never the
 * whole element) because a signature's image would otherwise be copied twice
 * into every persisted move.
 */
export interface ElementUpdate<TElement extends HistoryElement = HistoryElement> {
  id: string;
  before: Partial<TElement>;
  after: Partial<TElement>;
}

interface HistoryEntryBase {
  id: string;
  type: string;
  pageIndex: number;
  /** The entry's label, e.g. "Moved signature". Every entry has one. */
  description: string;
  timestamp: number;
}

/**
 * An add or a delete. Both retain complete snapshots so persisted history is
 * self-contained and redo never reconstructs an element from live editor
 * state.
 */
export interface SnapshotHistoryEntry<TElement extends HistoryElement = HistoryElement> extends HistoryEntryBase {
  operation: SnapshotOperation;
  elements: HistoryElementSnapshot<TElement>[];
}

/**
 * A move, resize, style change or text edit (UNDO-04). `group` names a text
 * edit session: consecutive entries in the same group are one step however
 * long the typing took (see `canCoalesce`).
 */
export interface UpdateHistoryEntry<TElement extends HistoryElement = HistoryElement> extends HistoryEntryBase {
  operation: 'update';
  updates: ElementUpdate<TElement>[];
  group?: string;
}

/** One atomic, reversible editor command. */
export type ActionHistoryEntry<TElement extends HistoryElement = HistoryElement> =
  | SnapshotHistoryEntry<TElement>
  | UpdateHistoryEntry<TElement>;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type NewActionHistoryEntry<TElement extends HistoryElement> = DistributiveOmit<
  ActionHistoryEntry<TElement>,
  'id' | 'timestamp'
>;

export type HistoryLogger<TElement extends HistoryElement> = (
  operation: SnapshotOperation,
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
  entry: Omit<SnapshotHistoryEntry<TElement>, 'id' | 'timestamp'>,
): SnapshotHistoryEntry<TElement>;
export function createActionEntry<TElement extends HistoryElement>(
  entry: Omit<UpdateHistoryEntry<TElement>, 'id' | 'timestamp'>,
): UpdateHistoryEntry<TElement>;
export function createActionEntry<TElement extends HistoryElement>(
  entry: NewActionHistoryEntry<TElement>,
): ActionHistoryEntry<TElement> {
  return { id: uniqueId(), timestamp: Date.now(), ...entry };
}

/** Same-element changes of one kind this close together are one step. */
export const COALESCE_WINDOW_MS = 500;

/**
 * Whether `incoming` folds into `top` rather than becoming its own step: both
 * change the same single element, and either they share a text edit session
 * (`group`), or they are the same kind of change to the same fields within
 * COALESCE_WINDOW_MS of the last one folded in (a burst of nudges, A+ presses
 * or colour picks). Bold then Italic in quick succession are both style
 * changes but touch different fields, so they stay two steps.
 */
export function canCoalesce<TElement extends HistoryElement>(
  top: ActionHistoryEntry<TElement>,
  incoming: ActionHistoryEntry<TElement>,
): boolean {
  if (top.operation !== 'update' || incoming.operation !== 'update') return false;
  if (top.updates.length !== 1 || incoming.updates.length !== 1) return false;
  if (top.updates[0].id !== incoming.updates[0].id) return false;
  if (top.group || incoming.group) return top.group === incoming.group;
  const elapsed = incoming.timestamp - top.timestamp;
  return top.type === incoming.type && elapsed >= 0 && elapsed <= COALESCE_WINDOW_MS
    && sameFields(top.updates[0].after, incoming.updates[0].after);
}

function sameFields(a: object, b: object): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => key in b);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  return typeof a === 'object' && a !== null && typeof b === 'object' && b !== null
    && JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Folds `incoming` into `top` (callers check `canCoalesce` first): the
 * earliest `before` of each field and the latest `after`, labelled and timed
 * as the latest change so a sustained burst keeps folding. Returns null when
 * the folded change is no change at all (nudged right then back), so the
 * step disappears instead of leaving an Undo that does nothing.
 */
export function coalesceUpdates<TElement extends HistoryElement>(
  top: UpdateHistoryEntry<TElement>,
  incoming: UpdateHistoryEntry<TElement>,
): UpdateHistoryEntry<TElement> | null {
  const [earlier] = top.updates;
  const [later] = incoming.updates;
  const before: Partial<TElement> = { ...later.before, ...earlier.before };
  const after: Partial<TElement> = { ...earlier.after, ...later.after };
  const changed = (Object.keys(after) as (keyof TElement)[]).filter((key) => !sameValue(before[key], after[key]));
  if (changed.length === 0) return null;
  const pick = (source: Partial<TElement>) => Object.fromEntries(
    changed.map((key) => [key, source[key]]),
  ) as Partial<TElement>;
  return {
    ...top,
    type: incoming.type,
    description: incoming.description,
    timestamp: incoming.timestamp,
    updates: [{ id: earlier.id, before: pick(before), after: pick(after) }],
  };
}

/**
 * The changed fields of one element as an ElementUpdate, or null when
 * `changes` changes nothing (a tap that ends where it started). `id` and
 * `pageIndex` are identity, never an edit, and are never captured.
 */
export function captureElementUpdate<TElement extends HistoryElement>(
  element: TElement,
  changes: Partial<TElement>,
): ElementUpdate<TElement> | null {
  const before: Partial<TElement> = {};
  const after: Partial<TElement> = {};
  for (const key of Object.keys(changes) as (keyof TElement)[]) {
    if (key === 'id' || key === 'pageIndex' || sameValue(element[key], changes[key])) continue;
    before[key] = element[key];
    after[key] = changes[key];
  }
  return Object.keys(after).length > 0 ? { id: element.id, before, after } : null;
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
  if (!Number.isInteger(entry.pageIndex) || (entry.pageIndex as number) < 0) return false;
  if (typeof entry.description !== 'string') return false;
  if (typeof entry.timestamp !== 'number' || !Number.isFinite(entry.timestamp)) return false;
  if (entry.operation === 'update') return isUpdatePayload(entry);
  if (entry.operation !== 'add' && entry.operation !== 'delete') return false;
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

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

/**
 * An update carries field changes, not whole elements, so there is nothing
 * for `isElement` to check. What can be checked is that each change is
 * well-formed: a named element, `before` and `after` over the same non-empty
 * set of fields, and never its identity (`id`, `pageIndex`).
 */
function isUpdatePayload(entry: Record<string, unknown>): boolean {
  if (entry.group !== undefined && (typeof entry.group !== 'string' || !entry.group)) return false;
  if (!Array.isArray(entry.updates) || entry.updates.length === 0) return false;
  const seenIds = new Set<string>();
  return entry.updates.every((candidate) => {
    if (!isPlainRecord(candidate)) return false;
    const { id, before, after } = candidate;
    if (typeof id !== 'string' || !id || seenIds.has(id)) return false;
    if (!isPlainRecord(before) || !isPlainRecord(after)) return false;
    const keys = Object.keys(after);
    if (keys.length === 0 || keys.length !== Object.keys(before).length) return false;
    if (!keys.every((key) => key in before && key !== 'id' && key !== 'pageIndex')) return false;
    seenIds.add(id);
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

/** Writes one side of each update back onto its element; a missing element is left alone. */
function patchElements<TElement extends HistoryElement>(
  elements: readonly TElement[],
  updates: readonly ElementUpdate<TElement>[],
  side: 'before' | 'after',
): TElement[] {
  const patches = new Map(updates.map((update) => [update.id, update[side]]));
  return elements.map((element) => {
    const patch = patches.get(element.id);
    return patch ? { ...element, ...patch } : element;
  });
}

/**
 * Reverts commands in the order supplied. History is newest-first, so passing
 * a filtered history array gives selective undo the same deterministic order
 * as repeatedly pressing Cmd/Ctrl+Z. An 'update' is reverted by writing its
 * `before` fields back, in place, so stacking order never moves.
 */
export function revertHistoryEntries<TElement extends HistoryElement>(
  elements: readonly TElement[],
  entries: readonly ActionHistoryEntry<TElement>[],
): TElement[] {
  return entries.reduce<TElement[]>((current, entry) => {
    if (entry.operation === 'update') return patchElements(current, entry.updates, 'before');
    if (entry.operation === 'add') {
      const addedIds = new Set(entry.elements.map(({ element }) => element.id));
      return current.filter((element) => !addedIds.has(element.id));
    }
    return restoreSnapshots(current, entry.elements);
  }, [...elements]);
}

/**
 * The exact mirror of revertHistoryEntries, for redo: an 'add' command is
 * reverted by removing its elements and re-applied by restoring their
 * snapshots (the same operation revert uses for 'delete'), and a 'delete'
 * command is reverted by restoring its snapshots and re-applied by removing
 * them again (the same operation revert uses for 'add'). An 'update' is
 * re-applied by writing its `after` fields. Snapshots make this safe either
 * direction without reconstructing live editor state.
 * Entries are applied in the order supplied, oldest-undone-first for a
 * multi-step redo, matching how revertHistoryEntries expects newest-first.
 */
export function applyHistoryEntries<TElement extends HistoryElement>(
  elements: readonly TElement[],
  entries: readonly ActionHistoryEntry<TElement>[],
): TElement[] {
  return entries.reduce<TElement[]>((current, entry) => {
    if (entry.operation === 'update') return patchElements(current, entry.updates, 'after');
    if (entry.operation === 'delete') {
      const removedIds = new Set(entry.elements.map(({ element }) => element.id));
      return current.filter((element) => !removedIds.has(element.id));
    }
    return restoreSnapshots(current, entry.elements);
  }, [...elements]);
}
