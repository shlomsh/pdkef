import { canCoalesce, coalesceUpdates, type ActionHistoryEntry, type HistoryElement } from './actionHistory.ts';

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
 * strictly linear and is cleared by any new command, and by any revert that
 * is not the top of the stack.** A normal undo/redo pair is safe because it
 * only ever moves the single most recent command back and forth between the
 * two stacks. But Redact's five-second undo chip reverts the one entry it
 * named, by id, wherever that entry has ended up by the time it is clicked,
 * which may be under a newer command. If a surviving `future` entry were kept
 * after such a revert, redoing it could re-insert an element a still-live
 * *later* command assumed was already gone (e.g. redo
 * re-adds a shape that a later, not-reverted "clear page" command's snapshot
 * never accounted for), silently corrupting stacking order or resurrecting
 * elements a later command deleted. Clearing `future` on every command and on
 * every out-of-order revert is what keeps undo -> redo a lossless round trip
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

/**
 * How many steps back Undo reaches. `past` is persisted with the draft, and
 * moves and typing push far more entries through it than add and delete ever
 * did, so the oldest step falls off once this is reached.
 */
export const MAX_HISTORY_DEPTH = 100;

/**
 * Logs a new command. Always clears `future`: seeing new work committed makes
 * any undone-and-not-yet-redone command stale.
 *
 * An update that `canCoalesce` with the newest command folds into it instead
 * of becoming its own step (one text edit session, or a burst of nudges), and
 * a fold that adds up to no change removes that step. Only while nothing is
 * undone: with a non-empty `future` the newest past entry is an older step
 * the person has already walked back to, and folding into it would make one
 * Undo revert two separate things.
 */
export function pushCommand<TElement extends HistoryElement>(
  past: readonly ActionHistoryEntry<TElement>[],
  future: readonly ActionHistoryEntry<TElement>[],
  entry: ActionHistoryEntry<TElement>,
): HistoryStack<TElement> {
  const [top, ...rest] = past;
  if (future.length === 0 && top && canCoalesce(top, entry)
    && top.operation === 'update' && entry.operation === 'update') {
    const folded = coalesceUpdates(top, entry);
    return { past: folded ? [folded, ...rest] : rest, future: [] };
  }
  return { past: [entry, ...past].slice(0, MAX_HISTORY_DEPTH), future: [] };
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
 * rather than by each caller declaring its intent. The callers that revert
 * used to say up front whether their revert was redoable, and they were
 * guessing about a fact that is only knowable at the moment of the revert.
 *
 * What makes redo unsafe is reverting from the *middle* of the stack: a
 * later, still-live command's snapshot never accounted for the element coming
 * back. Reverting the newest command, or the newest few together, is simply
 * undo, and redo can mirror it exactly.
 *
 * Every live caller is Redact's, through PdfRedactTool.tsx's `applyRevert`:
 * its Undo (keyboard and toolbar), which always selects the top of the stack
 * and so is exactly `undoStep` by another name, and its five-second undo
 * chip, which names its entry by id. The chip is what this function exists
 * for: while that entry is still the newest, reverting it is a plain undo and
 * the redo survives; once a newer command has landed above it inside the
 * chip's window, the same click is a middle-of-the-stack revert and the
 * future goes. (Sign has no such chip - it undoes through `undoStep`. The
 * change-history dialog that once reverted an arbitrary checked set in both
 * tools is gone: Undo and Redo are the whole history model now.)
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
