import { captureAddedElement, type HistoryLogger } from '#editor/model/actionHistory.ts';
import type { EditorElement, EditorElementPatch } from '#editor/model/editorModel.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import { signElementTypeLabel } from '#editor/registry/signLabels.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { isComment } from '../lib/comments/anchors.ts';
import type { WorkspaceGestureAction } from './useWorkspaceGestures.ts';

interface CommentActionDeps {
  elements: readonly EditorElement[];
  dispatch: (action: WorkspaceGestureAction) => void;
  logAction: HistoryLogger<EditorElement>;
  messages: SignMessages;
  /** The workspace's delete: history, announcement, selection. */
  deleteElement: (id: string) => void;
  /** The workspace's normal update path for an element. */
  makeOnChange: (id: string) => (fields: EditorElementPatch) => void;
}

/**
 * What the comment cards call. A new comment (stored text '') is recorded as one `add` on its first
 * save, since creating it wrote no history; an existing one is an ordinary update. Plain functions of
 * the workspace's own state: nothing here holds state, so there is nothing to memoise.
 */
export function useCommentActions({ elements, dispatch, logAction, messages: t, deleteElement, makeOnChange }: CommentActionDeps) {
  return {
    onSave: (id: string, patch: { comment: string; commentedAt: number }) => {
      const index = elements.findIndex((el) => el.id === id);
      const current = elements[index];
      if (!current || !isComment(current) || current.comment !== '') return makeOnChange(id)(patch);
      dispatch({ type: 'UPDATE_ELEMENT', payload: { id, changes: patch } });
      const label = signElementTypeLabel(t, 'comment');
      logAction('add', 'ADD_SHAPE', current.pageIndex, formatMessage(t.addedShapeDescriptionTemplate, { label }), [captureAddedElement({ ...current, ...patch }, index)]);
    },
    onDelete: deleteElement,
    onDiscard: (id: string) => {
      dispatch({ type: 'DELETE_ELEMENT', payload: id });
      dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
    },
  };
}
