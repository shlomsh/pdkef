import { groupMembers, duplicateGroup, isRepeated, repeatCopies } from './repeatGroup.ts';
import { withoutFindSet } from './findSet.ts';
import { linkedChanges, linkMembers, type LinkedElement, type LinkKind } from './links.ts';
import type { RedactCommands } from './useRedactCommands.ts';
import type { ToolbarMenuItem } from '../../editor-ui/ToolbarMenu.tsx';

/** removeLinked's history type and description for each kind, by member count. */
const REMOVE_LINKED_LABEL: Record<LinkKind, (count: number) => { type: string; description: string }> = {
  repeatGroup: (count) => ({
    type: 'REMOVE_REPEAT_GROUP',
    description: `Removed the box from ${count} page${count === 1 ? '' : 's'}`,
  }),
  findSet: (count) => ({
    type: 'REMOVE_FIND_SET',
    description: `Removed ${count} boxes from this search`,
  }),
};

export interface UseLinkedBoxesDeps<T extends LinkedElement> {
  elements: readonly T[];
  numPages: number;
  uniqueId: () => string;
  commands: RedactCommands<T>;
  /** Sets selectedBoxId and activeBoxId, as duplicateElement does today. */
  select: (id: string) => void;
  /** What an edit brings with it (Redact's auto colour), applied to every box an
   * edit reaches and to every box Duplicate and Every page add. */
  derive?: (element: T, changes: Partial<T>) => Partial<T>;
}

export interface UseLinkedBoxesResult<T> {
  updateElement(id: string, changes: Partial<T>): void;
  unlinkFromGroup(id: string): void;
  removeLinked(id: string, kind: LinkKind): void;
  duplicateElement(id: string): void;
  repeatOnEveryPage(id: string): void;
  clearPage(pageIndex: number, options?: { keepRepeated?: boolean }): void;
  clearPageOptions(pageIndex: number): ToolbarMenuItem[] | undefined;
}

/**
 * RED-14: every edit that can fan out to a linked box's siblings - its repeat
 * group (repeatGroup.ts) or its find set (findSet.ts) - moved out of the
 * island wholesale. changeElementColor/changeBlurStrength stay in
 * PdfRedactTool.tsx (they also remember preferences) and call
 * `updateElement` from here.
 */
export default function useLinkedBoxes<T extends LinkedElement>(
  deps: UseLinkedBoxesDeps<T>,
): UseLinkedBoxesResult<T> {
  const { elements, numPages, uniqueId, commands, select, derive } = deps;
  const withDerived = (element: T): T => (derive ? { ...element, ...derive(element, element) } : element);

  // RED-03: a linked box's edit reaches every member of its repeat group.
  // links.ts's `linkedChanges` turns `changes` into the per-box changes the
  // edited box and each of its linked siblings get; an unlinked box or a
  // change to a non-shared field (e.g. repeatGroupId, see unlinkFromGroup
  // below) comes back as a single-box list, so `commands.update` builds a
  // plain single-update entry exactly as before - the edited box's own
  // change through describeUpdate, every other box's captured change
  // appended to that one entry's `updates`, so the whole group reverts and
  // reapplies together.
  //
  // RED-11: linkedChanges does the same for the box's find set (strength
  // only), merging both link kinds by id so a box in both contributes one
  // update, not two.
  const updateElement = (id: string, changes: Partial<T>) => {
    const linked = linkedChanges(elements, id, changes);
    if (!derive) {
      commands.update(id, linked);
      return;
    }
    const perBox = linked.map(({ id: boxId, changes: c }) => {
      const element = elements.find((el) => el.id === boxId);
      return { id: boxId, changes: element ? { ...c, ...derive(element, c) } : c };
    });
    const own = perBox.find((box) => box.id === id)?.changes ?? changes;
    if (Object.keys(own).length > Object.keys(changes).length) commands.update(id, perBox, { primary: changes });
    else commands.update(id, perBox);
  };

  // RED-03: duplicating a linked box duplicates its whole group into a new
  // set of its own (duplicateGroup, repeatGroup.ts, pure) - the toolbar's own
  // pre-built clone object is ignored (RedactBox wraps onClone to call this
  // by id instead) because the source of a linked box can't be found from
  // geometry alone once several boxes share the same offset. Selects the
  // duplicate of the box that was actually pressed, not just the first one.
  const duplicateElement = (id: string) => {
    const members = groupMembers(elements, id);
    // RED-11: a duplicate never joins the source's find set (same
    // reasoning as duplicateElement above).
    const additions = duplicateGroup(elements, id, uniqueId).map(withoutFindSet).map(withDerived);
    if (additions.length === 0) return;
    const pressedIndex = members.findIndex((member) => member.id === id);
    const duplicateId = additions[pressedIndex]?.id ?? additions[0].id;
    select(duplicateId);
    const type = additions.length === 1 ? 'DUPLICATE_ELEMENT' : 'DUPLICATE_REPEAT_GROUP';
    const description = additions.length === 1
      ? `Duplicated ${additions[0].type} box`
      : `Duplicated the box on ${additions.length} pages`;
    commands.add(additions, { type, description });
  };

  // RED-03: detaches one box from its repeat group so future edits stop
  // reaching its former siblings. `repeatGroupId` is not one of
  // linkedChanges'/updateElement's shared fields, so this is deliberately not
  // routed through updateElement's group-aware path - it must only ever
  // touch the one box, never propagate.
  const unlinkFromGroup = (id: string) => {
    const changes = { repeatGroupId: uniqueId() } as Partial<T>;
    commands.update(id, [{ id, changes }], { describe: () => 'Unlinked the box on this page' });
  };

  // RED-03/RED-11: removes every box linked to `id` by the given kind (its
  // repeat group or its find set) in one undo step. Once removeGroup and
  // removeFindSet, now one function over links.ts's `linkMembers` - the two
  // sets never shared a removal path before because nothing named what they
  // had in common.
  const removeLinked = (id: string, kind: LinkKind) => {
    const members = linkMembers(elements, id, kind);
    if (members.length === 0) return;
    const { type, description } = REMOVE_LINKED_LABEL[kind](members.length);
    commands.remove(new Set(members.map((member) => member.id)), { type, description, pageIndex: members[0].pageIndex });
  };

  // RED-03: `keepRepeated` clears only the page's own boxes and leaves any
  // box repeated on other pages in place, with its set intact.
  const clearPage = (pageIndex: number, { keepRepeated = false } = {}) => {
    const clears = (el: T) => el.pageIndex === pageIndex && !(keepRepeated && isRepeated(elements, el));
    const removed = elements.filter(clears);
    if (removed.length === 0) return;
    const description = `Cleared ${removed.length} box${removed.length === 1 ? '' : 'es'} on page ${pageIndex + 1}`;
    commands.remove(new Set(removed.map((el) => el.id)), { type: 'CLEAR_PAGE', description, pageIndex });
  };

  // RED-03: Clear page asks only when the page holds a repeated box, so a
  // copy never disappears from its set without the person choosing it.
  const clearPageOptions = (pageIndex: number): ToolbarMenuItem[] | undefined => {
    const onPage = elements.filter(el => el.pageIndex === pageIndex);
    if (!onPage.some(el => isRepeated(elements, el))) return undefined;
    const ownBoxes = onPage.some(el => !isRepeated(elements, el));
    return [
      ...(ownBoxes
        ? [{ label: 'Keep the repeated boxes', onSelect: () => clearPage(pageIndex, { keepRepeated: true }), attrs: { 'data-editor-clear-keep-repeated': true } }]
        : []),
      { label: 'Clear everything on this page', onSelect: () => clearPage(pageIndex), attrs: { 'data-editor-clear-everything': true } },
    ];
  };

  // RED-03: a selected box, copied onto every other page at the same
  // percentage position, size, color and strength - one undo step for the
  // whole batch, every copy joined to the source's repeat group so a later
  // edit, unlink or remove reaches all of them. repeatGroup.ts's
  // `repeatCopies` (pure) decides which pages get a copy, what it looks like
  // and its group id; this only appends, logs and announces, same shape as
  // clearPage above.
  const repeatOnEveryPage = (id: string) => {
    const source = elements.find(el => el.id === id);
    if (!source) return;
    // RED-11: a repeated copy never joins the source's find set (same
    // reasoning as duplicateElement above).
    const additions = repeatCopies(source, elements, numPages, uniqueId).map(withoutFindSet).map(withDerived);
    if (additions.length === 0) return;
    const description = `Added the box to ${additions.length} more page${additions.length === 1 ? '' : 's'}`;
    commands.add(additions, { type: 'REPEAT_ON_EVERY_PAGE', description, undoChip: true });
  };

  return { updateElement, unlinkFromGroup, removeLinked, duplicateElement, repeatOnEveryPage, clearPage, clearPageOptions };
}
