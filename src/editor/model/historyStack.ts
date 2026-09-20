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
/**
 * Inputs are `readonly` because these functions never mutate what they are
 * given; the results are plain mutable arrays because every one of them is
 * freshly built here. Returning them as `readonly` only forced each caller to
 * copy an array that was already its own.
 */
export interface HistoryStack<TElement extends HistoryElement> {
  past: ActionHistoryEntry<TElement>[];
  future: ActionHistoryEntry<TElement>[];
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
 * Reverting a named set of commands, wherever they sit in `past`.
 *
 * Whether a redo can survive it is decided here, by looking at the stack,
 * rather than by each caller declaring its intent. The three callers that
 * revert (the keyboard's single step, the "Undo changes" dialog's checklist,
 * and Redact's five-second chip) used to say up front whether their revert
 * was redoable, and they were guessing about a fact that is only knowable at
 * the moment of the revert.
 *
 * The rule is narrower than "a checklist revert is never redoable", which is
 * what it replaced. What makes redo unsafe is reverting from the *middle* of
 * the stack: a later, still-live command's snapshot never accounted for the
 * element coming back. Reverting the newest command, or the newest few
 * together, is simply undo, and redo can mirror it exactly.
 *
 * That distinction is load bearing on a phone. There is no Cmd+Z there, so
 * the dialog's checklist is the only undo a touch user has; under the old
 * blunt rule their redo stack was always empty and the Redo control could
 * never do anything at all.
 *
 * `future` is newest-undone-first, and a contiguous top run is reversed into
 * it so that redoing twice replays the two undos in the order a person would
 * have done them one at a time.
 */
export function revertCommands<TElement extends HistoryElement>(
  past: readonly ActionHistoryEntry<TElement>[],
  future: readonly ActionHistoryEntry<TElement>[],
  ids: ReadonlySet<string>,
): HistoryStack<TElement> {
  const topRun = past.slice(0, ids.size);
  const isContiguousTop = ids.size > 0
    && topRun.length === ids.size
    && topRun.every((entry) => ids.has(entry.id));

  if (isContiguousTop) {
    return { past: past.slice(ids.size), future: [...topRun].reverse().concat(future) };
  }
  return { past: past.filter((entry) => !ids.has(entry.id)), future: [] };
}
