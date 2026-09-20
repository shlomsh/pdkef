import type { ActionHistoryEntry, HistoryElement } from './actionHistory.ts';

/**
 * Pure undo/redo stack bookkeeping over the existing ActionHistoryEntry shape.
 * This deliberately does NOT introduce a new persisted structure: `past` is
 * exactly today's `actionHistory` array (newest-first), unchanged, so the
 * draft record's persisted shape (`useEditorDraftPersistence.ts`'s
 * `extra: { actionHistory }`, validated by `draftValidation.ts`) is untouched.
 * `future` (newest-undone-first) is in-memory only and is never persisted -
 * callers simply do not save it, the same way it is never read back on
 * restore.
 *
 * The invariant every function here exists to encode: **the redo stack is
 * strictly linear and is cleared by any new command, and by any selective
 * revert.** A normal undo/redo pair is safe because it only ever moves the
 * single most recent command back and forth between the two stacks. But the
 * shared UndoHistoryModal can revert an arbitrary *checked set* from the
 * middle of the stack - selective undo, not "undo the last thing." If a
 * surviving `future` entry were kept after that, redoing it could re-insert
 * an element a still-live *later* command assumed was already gone (e.g. redo
 * re-adds a shape that a later, not-reverted "clear page" command's snapshot
 * never accounted for), silently corrupting stacking order or resurrecting
 * elements a later command deleted. Clearing `future` on every command and on
 * every selective revert is what keeps undo -> redo a lossless round trip
 * with exact z-order preserved: that guarantee is a *consequence* of always
 * starting redo from an empty, contiguous run at the top of `past`, not
 * something proven independently of it.
 */
export interface HistoryStack<TElement extends HistoryElement> {
  past: readonly ActionHistoryEntry<TElement>[];
  future: readonly ActionHistoryEntry<TElement>[];
}

export interface HistoryStep<TElement extends HistoryElement> extends HistoryStack<TElement> {
  entry: ActionHistoryEntry<TElement>;
}

/** Logs a new command. Always clears `future`: seeing new work committed makes any undone-and-not-yet-redone command stale. */
export function pushCommand<TElement extends HistoryElement>(
  past: readonly ActionHistoryEntry<TElement>[],
  _future: readonly ActionHistoryEntry<TElement>[],
  entry: ActionHistoryEntry<TElement>,
): HistoryStack<TElement> {
  return { past: [entry, ...past], future: [] };
}

/**
 * Moves the single most recent command from `past` to the front of `future`.
 * Returns null when there is nothing to undo. Applying `entry` with
 * `revertHistoryEntries` is the caller's job (this module holds no editor
 * element state); this only manages which array `entry` lives in.
 */
export function undoStep<TElement extends HistoryElement>(
  past: readonly ActionHistoryEntry<TElement>[],
  future: readonly ActionHistoryEntry<TElement>[],
): HistoryStep<TElement> | null {
  const [entry, ...rest] = past;
  if (!entry) return null;
  return { past: rest, future: [entry, ...future], entry };
}

/**
 * Moves the single most recently undone command from the front of `future`
 * back onto `past`. Returns null when there is nothing to redo. Applying
 * `entry` with `applyHistoryEntries` is the caller's job.
 */
export function redoStep<TElement extends HistoryElement>(
  past: readonly ActionHistoryEntry<TElement>[],
  future: readonly ActionHistoryEntry<TElement>[],
): HistoryStep<TElement> | null {
  const [entry, ...rest] = future;
  if (!entry) return null;
  return { past: [entry, ...past], future: rest, entry };
}

/**
 * Selective revert: drops the commands identified by `ids` out of `past`
 * wherever they sit (not necessarily at the top), same as today's
 * `actionHistory.filter(...)` call sites. Always returns an empty `future` -
 * see this module's doc comment for why a revert from the middle of the
 * stack cannot leave a safe redo behind.
 */
export function dropCommands<TElement extends HistoryElement>(
  past: readonly ActionHistoryEntry<TElement>[],
  _future: readonly ActionHistoryEntry<TElement>[],
  ids: ReadonlySet<string>,
): HistoryStack<TElement> {
  return { past: past.filter((entry) => !ids.has(entry.id)), future: [] };
}
