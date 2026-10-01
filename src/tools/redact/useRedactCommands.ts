/**
 * RED-14: the one way an edit reaches the Redact document. Every handler in
 * the island used to repeat the same steps: change `elements`, mark the
 * document edited, drop a removed box from the selection, push one history
 * entry, and for a removal show the undo chip. Handlers now only decide what
 * changes; these three commands do the rest, so no two of them can drift.
 */
import {
  captureAddedElement,
  captureElementSnapshots,
  captureElementUpdate,
  createActionEntry,
  type ActionHistoryEntry,
} from '../../editor/model/actionHistory.ts';
import { pushCommand, type HistoryStack } from '../../editor/model/historyStack.ts';
import { createUpdateEntry, type ElementUpdateKind } from '../../editor/model/updateKind.ts';

export interface RedactCommandDeps<T extends { id: string; pageIndex: number }> {
  elements: readonly T[];
  setElements: (update: (prev: T[]) => T[]) => void;
  setHistory: (update: (current: HistoryStack<T>) => HistoryStack<T>) => void;
  markDocumentEdited: () => void;
  /** Clears the active and selected box when it is one of `ids`. */
  forgetSelection: (ids: ReadonlySet<string>) => void;
  /** Shows the undo chip and announces `message` (the island's registerUndo). */
  registerUndo: (message: string, entry: ActionHistoryEntry<T>, extra?: UndoExtra) => void;
  /** Resolves update descriptions the way the island does today (describeRedactUpdate). */
  describeUpdate: (kind: ElementUpdateKind, element: T) => string;
}

/** A second button on the undo chip, shown before Undo. */
export interface UndoExtra {
  label: string;
  onSelect: () => void;
}

export interface AddOptions {
  /** History type, e.g. 'FIND_AND_REDACT', 'REPEAT_ON_EVERY_PAGE'. */
  type: string;
  description: string;
  /** Show the undo chip and announce, as repeat-on-every-page does today. */
  undoChip?: boolean;
  /** RED-26: a second chip action, e.g. "Every page". Only with `undoChip`. */
  undoExtra?: UndoExtra;
  /** The chip's message when it differs from `description`. */
  chipMessage?: string;
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
  const { elements, setElements, setHistory, markDocumentEdited, forgetSelection, registerUndo, describeUpdate } = deps;

  const add = (additions: readonly T[], options: AddOptions) => {
    if (additions.length === 0) return;
    const baseIndex = elements.length;
    setElements((prev) => [...prev, ...additions]);
    markDocumentEdited();
    const entry = createActionEntry<T>({
      operation: 'add',
      type: options.type,
      pageIndex: additions[0].pageIndex,
      description: options.description,
      elements: additions.map((el, i) => captureAddedElement(el, baseIndex + i)),
    });
    setHistory((current) => pushCommand(current.past, current.future, entry));
    if (options.undoChip) registerUndo(options.chipMessage ?? options.description, entry, options.undoExtra);
  };

  const remove = (ids: ReadonlySet<string>, options: RemoveOptions) => {
    const snapshots = captureElementSnapshots(elements, (el) => ids.has(el.id));
    if (snapshots.length === 0) return;
    setElements((prev) => prev.filter((el) => !ids.has(el.id)));
    markDocumentEdited();
    forgetSelection(ids);
    const entry = createActionEntry<T>({
      operation: 'delete',
      type: options.type,
      pageIndex: options.pageIndex,
      description: options.description,
      elements: snapshots,
    });
    setHistory((current) => pushCommand(current.past, current.future, entry));
    registerUndo(options.chipMessage ?? options.description, entry);
  };

  const update = (
    id: string,
    perBox: readonly { id: string; changes: Partial<T> }[],
    options?: { describe?: (kind: ElementUpdateKind) => string },
  ) => {
    const element = elements.find((el) => el.id === id);
    if (!element) return;
    setElements((prev) => {
      const changesById = new Map(perBox.map(({ id: boxId, changes: boxChanges }) => [boxId, boxChanges]));
      return prev.map((el) => {
        const boxChanges = changesById.get(el.id);
        return boxChanges ? { ...el, ...boxChanges } : el;
      });
    });
    markDocumentEdited();
    const changes = perBox.find(({ id: boxId }) => boxId === id)?.changes ?? {};
    const describe = options?.describe ?? ((kind: ElementUpdateKind) => describeUpdate(kind, element));
    const entry = createUpdateEntry(element, changes, describe);
    if (!entry) return;
    const otherUpdates = perBox
      .filter(({ id: boxId }) => boxId !== id)
      .flatMap(({ id: boxId, changes: boxChanges }) => {
        const boxElement = elements.find((el) => el.id === boxId);
        const boxUpdate = boxElement && captureElementUpdate(boxElement, boxChanges);
        return boxUpdate ? [boxUpdate] : [];
      });
    const fullEntry = otherUpdates.length === 0 ? entry : { ...entry, updates: [...entry.updates, ...otherUpdates] };
    setHistory((current) => pushCommand(current.past, current.future, fullEntry));
  };

  return { add, remove, update };
}
