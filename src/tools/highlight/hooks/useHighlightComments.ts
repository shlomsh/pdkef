import type { HistoryLogger } from '#editor/model/actionHistory.ts';
import type { EditorElement, EditorElementPatch } from '#editor/model/editorModel.ts';
import type { ElementsAction, ElementsState } from '#editor/model/elementsReducer.ts';
import { createUpdateEntry } from '#editor/model/updateKind.ts';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import { signUpdateDescription } from '#editor/registry/signLabels.ts';
import type { ElementAction } from '#editor-ui/elementActions.ts';
import { useCommentActions } from '#editor-ui/comments/useCommentActions.ts';
import { useCommentsView } from '#editor-ui/comments/useCommentsView.tsx';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { deleteWithComments } from '../lib/notes/deleteElement.ts';

/**
 * Highlight's wiring of Sign's comments mechanism (R27 to R29): the same view (rail, sheet) and the same card
 * actions, over Highlight's own elements state. Typing in a card is a plain update, one undo step per save.
 */
export function useHighlightComments({ state, dispatch, logAction, announce }: {
  state: Pick<ElementsState, 'elements' | 'activeElementId'>;
  dispatch: (action: ElementsAction) => void;
  logAction: HistoryLogger<EditorElement>;
  announce(message: string): void;
}) {
  const t = englishSignMessages;
  const { elements, activeElementId } = state;

  const deleteElement = (id: string) => {
    if (!deleteWithComments(elements, id, t, { dispatch, logAction })) return;
    recordAction('delete_mark');
    announce(t.removedElement);
  };
  const makeOnChange = (id: string) => (fields: EditorElementPatch) => {
    const element = elements.find((el) => el.id === id);
    dispatch({ type: 'UPDATE_ELEMENT', payload: { id, changes: fields } });
    const entry = element && createUpdateEntry(element, fields as Partial<EditorElement>, (kind) => signUpdateDescription(t, kind, element.type));
    if (entry) dispatch({ type: 'ADD_ACTION_HISTORY', payload: entry });
  };

  // Highlight has no tool to disarm: the shared action union's DISARM_TOOL is not for it.
  const forward = (action: ElementAction) => { if (action.type !== 'DISARM_TOOL') dispatch(action); };
  const actions = useCommentActions({ elements, dispatch: forward, logAction, messages: t, deleteElement, makeOnChange });
  const view = useCommentsView({
    elements, activeElementId, messages: t,
    onSelect: (id) => dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: id }),
    ...actions,
  });
  return { ...view, actions };
}
