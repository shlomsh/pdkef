import { describe, it, expect, vi } from 'vitest';
import { useCommentActions } from './useCommentActions.ts';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import type { CommentElement, EditorElement } from '#editor/model/editorModel.ts';

const comment = (over: Partial<CommentElement> = {}): CommentElement => ({
  id: 'c1', type: 'comment', pageIndex: 2, left: 10, top: 10, width: 5, height: 5, comment: '', anchor: { kind: 'point' }, ...over,
});
const other = { id: 'x', type: 'text', pageIndex: 0 } as unknown as EditorElement;

function setup(elements: EditorElement[]) {
  const dispatch = vi.fn();
  const logAction = vi.fn();
  const changer = vi.fn();
  const makeOnChange = vi.fn(() => changer);
  const deleteElement = vi.fn();
  const actions = useCommentActions({ elements, dispatch, logAction, messages: englishSignMessages, deleteElement, makeOnChange });
  return { actions, dispatch, logAction, changer, makeOnChange, deleteElement };
}

describe('useCommentActions', () => {
  it('saves a new comment as one add history entry carrying the saved element', () => {
    const { actions, dispatch, logAction, changer } = setup([other, comment()]);
    actions.onSave('c1', { comment: 'hi', commentedAt: 5 });
    expect(dispatch).toHaveBeenCalledWith({ type: 'UPDATE_ELEMENT', payload: { id: 'c1', changes: { comment: 'hi', commentedAt: 5 } } });
    expect(changer).not.toHaveBeenCalled();
    expect(logAction).toHaveBeenCalledTimes(1);
    const [kind, , page, , snapshots] = logAction.mock.calls[0];
    expect(kind).toBe('add');
    expect(page).toBe(2);
    expect(snapshots).toEqual([{ element: expect.objectContaining({ id: 'c1', comment: 'hi', commentedAt: 5 }), index: 1 }]);
  });
  it('saves an existing comment through the normal update path', () => {
    const { actions, makeOnChange, changer, logAction } = setup([comment({ comment: 'old' })]);
    actions.onSave('c1', { comment: 'new', commentedAt: 9 });
    expect(makeOnChange).toHaveBeenCalledWith('c1');
    expect(changer).toHaveBeenCalledWith({ comment: 'new', commentedAt: 9 });
    expect(logAction).not.toHaveBeenCalled();
  });
  it('delete is the workspace delete', () => {
    const { actions, deleteElement } = setup([comment()]);
    actions.onDelete('c1');
    expect(deleteElement).toHaveBeenCalledWith('c1');
  });
  it('discard removes the element with no history', () => {
    const { actions, dispatch, logAction } = setup([comment()]);
    actions.onDiscard('c1');
    expect(dispatch).toHaveBeenCalledWith({ type: 'DELETE_ELEMENT', payload: 'c1' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
    expect(logAction).not.toHaveBeenCalled();
  });
});
