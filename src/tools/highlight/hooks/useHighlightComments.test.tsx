import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { CommentElement, HighlightElement } from '#editor/model/editorModel.ts';
import { useHighlightComments } from './useHighlightComments.ts';
import { useHighlightMarks } from './useHighlightMarks.ts';

let container: HTMLElement | null = null;
let marks: ReturnType<typeof useHighlightMarks>;
let comments: ReturnType<typeof useHighlightComments>;
let announced: string[];

function Probe() {
  marks = useHighlightMarks();
  comments = useHighlightComments({ state: marks.state, dispatch: marks.dispatch, logAction: marks.logAction, announce: (m) => announced.push(m) });
  return null;
}

const mark: HighlightElement = {
  id: 'm1', type: 'highlight', pageIndex: 0, left: 10, top: 10, width: 20, height: 2,
  color: '#FFF34D', bands: [{ left: 0, top: 0, width: 100, height: 100 }],
};
const saved: CommentElement = {
  id: 'c1', type: 'comment', pageIndex: 0, left: 10, top: 10, width: 20, height: 2,
  comment: 'Check this', anchor: { kind: 'element', elementId: 'm1' },
};

function mount(elements = [mark, saved]) {
  announced = [];
  container = document.createElement('div');
  act(() => render(<Probe />, container!));
  act(() => marks.dispatch({ type: 'LOAD_DOCUMENT', payload: { elements, actionHistory: [] } }));
}

afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

describe('useHighlightComments', () => {
  it('editing a saved comment is one update step in the history', () => {
    mount();
    act(() => comments.actions.onSave('c1', { comment: 'Changed', commentedAt: 5 }));
    expect(marks.state.elements.find((el) => el.id === 'c1')).toMatchObject({ comment: 'Changed', commentedAt: 5 });
    expect(marks.state.actionHistory).toHaveLength(1);
    act(() => marks.undo());
    expect(marks.state.elements.find((el) => el.id === 'c1')).toMatchObject({ comment: 'Check this' });
  });

  it('saving a new comment logs one add, and one undo takes it away again', () => {
    const blank: CommentElement = { ...saved, id: 'c2', comment: '' };
    mount([mark, blank]);
    act(() => comments.actions.onSave('c2', { comment: 'First', commentedAt: 7 }));
    expect(marks.state.actionHistory).toHaveLength(1);
    act(() => marks.undo());
    expect(marks.state.elements.some((el) => el.id === 'c2')).toBe(false);
  });

  it('deleting a comment from its card removes it as one undo step, clears the selection and says so', () => {
    mount();
    act(() => marks.dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: 'c1' }));
    act(() => comments.actions.onDelete('c1'));
    expect(marks.state.elements.map((el) => el.id)).toEqual(['m1']);
    expect(marks.state.activeElementId).toBeNull();
    expect(marks.state.actionHistory).toHaveLength(1);
    expect(announced).toHaveLength(1);
    act(() => marks.undo());
    expect(marks.state.elements.map((el) => el.id).sort()).toEqual(['c1', 'm1']);
  });

  it('discarding a blank comment leaves no trace in the history', () => {
    const blank: CommentElement = { ...saved, id: 'c2', comment: '' };
    mount([mark, blank]);
    act(() => comments.actions.onDiscard('c2'));
    expect(marks.state.elements.map((el) => el.id)).toEqual(['m1']);
    expect(marks.state.actionHistory).toHaveLength(0);
  });
});
