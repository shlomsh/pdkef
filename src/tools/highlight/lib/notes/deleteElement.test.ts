import { describe, expect, it, vi } from 'vitest';
import type { CommentElement, HighlightElement } from '#editor/model/editorModel.ts';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import { deleteWithComments } from './deleteElement.ts';

const mark: HighlightElement = {
  id: 'h1', type: 'highlight', pageIndex: 2, left: 10, top: 20, width: 30, height: 4,
  color: '#FFF34D', bands: [{ left: 0, top: 0, width: 100, height: 100 }],
};
const comment: CommentElement = {
  id: 'c1', type: 'comment', pageIndex: 2, left: 10, top: 20, width: 30, height: 4,
  comment: 'Check this', anchor: { kind: 'element', elementId: 'h1' },
};
const other: HighlightElement = { ...mark, id: 'h2' };

describe('deleteWithComments', () => {
  it('deletes the element, clears the selection and logs one entry holding the element and its comments', () => {
    const dispatch = vi.fn();
    const logAction = vi.fn();
    expect(deleteWithComments([other, mark, comment], 'h1', englishSignMessages, { dispatch, logAction })).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({ type: 'DELETE_ELEMENT', payload: 'h1' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
    expect(logAction).toHaveBeenCalledTimes(1);
    expect(logAction).toHaveBeenCalledWith('delete', 'DELETE_ELEMENT', 2, expect.stringContaining('Deleted'), [
      { element: mark, index: 1 }, { element: comment, index: 2 },
    ]);
  });

  it('a comment goes alone', () => {
    const logAction = vi.fn();
    deleteWithComments([mark, comment], 'c1', englishSignMessages, { dispatch: vi.fn(), logAction });
    expect(logAction.mock.calls[0][4]).toEqual([{ element: comment, index: 1 }]);
  });

  it('an unknown id does nothing', () => {
    const dispatch = vi.fn();
    const logAction = vi.fn();
    expect(deleteWithComments([mark], 'nope', englishSignMessages, { dispatch, logAction })).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
    expect(logAction).not.toHaveBeenCalled();
  });
});
