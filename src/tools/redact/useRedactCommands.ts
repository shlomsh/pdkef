/**
 * RED-14: the one way an edit reaches the Redact document. Every handler in
 * the island used to repeat the same steps: change `elements`, mark the
 * document edited, drop a removed box from the selection, push one history
 * entry, and for a removal show the undo chip. Handlers now only decide what
 * changes; these three commands do the rest, so no two of them can drift.
 *
 * CONTRACT, written before the implementation. Signatures and behaviour are
 * fixed; the body is the implementer's.
 */
import type { ActionHistoryEntry } from '../../editor/model/actionHistory.ts';
import type { HistoryStack } from '../../editor/model/historyStack.ts';
import type { ElementUpdateKind } from '../../editor/model/updateKind.ts';

export interface RedactCommandDeps<T extends { id: string; pageIndex: number }> {
  elements: readonly T[];
  setElements: (update: (prev: T[]) => T[]) => void;
  setHistory: (update: (current: HistoryStack<T>) => HistoryStack<T>) => void;
  markDocumentEdited: () => void;
  /** Clears the active and selected box when it is one of `ids`. */
  forgetSelection: (ids: ReadonlySet<string>) => void;
  /** Shows the undo chip and announces `message` (the island's registerUndo). */
  registerUndo: (message: string, entry: ActionHistoryEntry<T>) => void;
  /** Resolves update descriptions the way the island does today (describeRedactUpdate). */
  describeUpdate: (kind: ElementUpdateKind, element: T) => string;
}

export interface AddOptions {
  /** History type, e.g. 'FIND_AND_REDACT', 'REPEAT_ON_EVERY_PAGE'. */
  type: string;
  description: string;
  /** Show the undo chip and announce, as repeat-on-every-page does today. */
  undoChip?: boolean;
}

export interface RemoveOptions {
  type: string;
  /** The history entry's description. */
  description: string;
  pageIndex: number;
  /** The chip's message when it differs from `description` (a single box says "Removed 1 box"). */
  chipMessage?: string;
}

export interface RedactCommands<T> {
  /** Appends `additions` (already built, ids included) as one 'add' entry,
   * captured at their stacking index. No-op when empty. */
  add(additions: readonly T[], options: AddOptions): void;
  /** Removes every element whose id is in `ids` as one 'delete' entry with
   * snapshots, forgets them from the selection, and always shows the undo
   * chip. No-op when none of the ids exist. */
  remove(ids: ReadonlySet<string>, options: RemoveOptions): void;
  /** Applies `perBox` (the edited box first, e.g. from links.ts's
   * linkedChanges) as one update entry for the box `id`, with every other
   * box's captured update appended to that same entry, exactly as
   * updateElement does today. `describe` overrides describeUpdate for
   * entries like "Unlinked the box on this page". */
  update(
    id: string,
    perBox: readonly { id: string; changes: Partial<T> }[],
    options?: { describe?: (kind: ElementUpdateKind) => string },
  ): void;
}

export default function useRedactCommands<T extends { id: string; pageIndex: number }>(
  deps: RedactCommandDeps<T>,
): RedactCommands<T> {
  void deps;
  throw new Error('RED-14: not implemented yet');
}
