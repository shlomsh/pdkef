import { hasCommentCards } from '#editor/highlight/commentCards.ts';
import { isComment } from '#editor/comments/anchors.ts';
import type { EditorElement } from '#editor/model/editorModel.ts';
import type { ElementsAction } from '#editor/model/elementsReducer.ts';

interface NotesState {
  elements: readonly EditorElement[];
  activeElementId: string | null;
}

/** Whether the notes column should now be there (`noted`), and the mark whose passage must stay put while it moves. */
type RoomChange = { noted: boolean; markId: string } | null;

/** The mark a state's card is anchored to: the open comment's, else the first saved note's. */
function cardMark({ elements, activeElementId }: NotesState): string | null {
  const comments = elements.filter(isComment).filter((c) => c.anchor.kind === 'element');
  const open = comments.find((c) => c.id === activeElementId);
  const card = open ?? comments.find((c) => c.comment.trim() !== '');
  return card && card.anchor.kind === 'element' ? card.anchor.elementId : null;
}

/**
 * R28: the first card appearing makes room for the notes column, the last one going gives it back, and nothing
 * else about a note moves the page. `wide` is whether the rail would show at all (a narrow screen uses the sheet).
 * Null when the page stays as it is, or when there is no mark to keep in place.
 */
export function roomChange(before: NotesState, after: NotesState, wide: boolean): RoomChange {
  if (!wide) return null;
  const had = hasCommentCards(before.elements, before.activeElementId);
  const has = hasCommentCards(after.elements, after.activeElementId);
  if (had === has) return null;
  const markId = cardMark(has ? after : before);
  return markId === null ? null : { noted: has, markId };
}

/** The actions that can open or close a card, undo and redo among them; every swipe and edit is not one. */
export function affectsNotes(action: ElementsAction): boolean {
  if (action.type === 'ADD_ELEMENT') return action.payload.type === 'comment';
  return action.type === 'SET_ACTIVE_ELEMENT_ID' || action.type === 'DELETE_ELEMENT' || action.type === 'UNDO' || action.type === 'REDO';
}
