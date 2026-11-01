import { captureElementSnapshots, type HistoryLogger } from '#editor/model/actionHistory.ts';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { deletedWith, type ElementsAction } from '#editor/model/elementsReducer.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import { signElementTypeLabel } from '#editor/registry/signLabels.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';

/**
 * Deletes an element and the comments anchored to it as one undo step (R27): the snapshot is taken before the
 * delete, the selection is cleared, and one history entry holds the element and its comments together.
 * Returns false, doing nothing, when the id is not in the document.
 */
export function deleteWithComments(
  elements: readonly EditorElement[],
  id: string,
  messages: SignMessages,
  { dispatch, logAction }: { dispatch: (action: ElementsAction) => void; logAction: HistoryLogger<EditorElement> },
): boolean {
  const element = elements.find((el) => el.id === id);
  if (!element) return false;
  const snapshots = captureElementSnapshots(elements, deletedWith(id));
  dispatch({ type: 'DELETE_ELEMENT', payload: id });
  dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
  logAction('delete', 'DELETE_ELEMENT', element.pageIndex, formatMessage(messages.deletedElementDescriptionTemplate, { label: signElementTypeLabel(messages, element.type) }), snapshots);
  return true;
}
