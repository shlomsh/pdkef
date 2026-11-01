import { describe, it, expect } from 'vitest';
import type { ActionHistoryEntry } from '#editor/model/actionHistory.ts';
import type {
  EditorElement,
  RectangleElement,
  TextElement,
} from '#editor/model/editorModel.ts';
import {
  elementsReducer as reducer,
  type ElementsAction as SignToolAction,
  type ElementsState as SignToolState,
} from './elementsReducer.ts';

const textElement = (id: string, overrides: Partial<TextElement> = {}): TextElement => ({
  id,
  type: 'text',
  pageIndex: 0,
  left: 0,
  top: 0,
  text: '',
  ...overrides,
});

const rectangleElement = (id: string, overrides: Partial<RectangleElement> = {}): RectangleElement => ({
  id,
  type: 'rectangle',
  pageIndex: 0,
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  ...overrides,
});

const addHistory = (
  id: string,
  type: string,
  element: EditorElement,
  index = 0,
): ActionHistoryEntry<EditorElement> => ({
  id,
  type,
  operation: 'add',
  pageIndex: element.pageIndex || 0,
  description: type,
  timestamp: 1,
  elements: [{ element, index }],
});

describe('elementsReducer', () => {
  const initialState: SignToolState = {
    elements: [],
    activeElementId: null,
    editingElementId: null,
    actionHistory: [],
    redoHistory: [],
    documentRevision: 0,
  };

  it('SET_ELEMENTS replaces the elements array', () => {
    const elements = [textElement('1')];
    const action = { type: 'SET_ELEMENTS', payload: elements } satisfies SignToolAction;
    const nextState = reducer(initialState, action);
    expect(nextState.elements).toEqual(elements);
  });

  it('treats a loaded or restored document as the autosave baseline', () => {
    const elements = [textElement('restored-1')];
    const history = [addHistory('history-1', 'ADD_TEXT', elements[0])];
    const state = { ...initialState, documentRevision: 7 };
    const loaded = reducer(state, { type: 'LOAD_DOCUMENT', payload: { elements, actionHistory: history } });

    expect(loaded.elements).toEqual(elements);
    expect(loaded.actionHistory).toEqual(history);
    expect(loaded.documentRevision).toBe(8);
    expect(loaded.draftBaselineRevision).toBe(8);
    expect(reducer(loaded, { type: 'UPDATE_ELEMENT', payload: { id: 'restored-1', changes: { text: 'Edited' } } }).documentRevision).toBe(9);
  });

  it('increments the document revision for every change that can invalidate an export', () => {
    const withRevision: SignToolState = { ...initialState, documentRevision: 7, elements: [textElement('el-1')] };
    expect(reducer(withRevision, { type: 'UPDATE_ELEMENT', payload: { id: 'el-1', changes: { text: 'Changed' } } }).documentRevision).toBe(8);
    expect(reducer(withRevision, { type: 'ADD_ELEMENT', payload: textElement('el-2') }).documentRevision).toBe(8);
    expect(reducer(withRevision, { type: 'DELETE_ELEMENT', payload: 'el-1' }).documentRevision).toBe(8);
    expect(reducer(withRevision, { type: 'SET_ELEMENTS', payload: [] }).documentRevision).toBe(8);
  });

  it('ADD_ELEMENT correctly modifies the array', () => {
    const newElement = textElement('el-1', { text: 'Hello' });
    const action = { type: 'ADD_ELEMENT', payload: newElement } satisfies SignToolAction;
    
    const state1 = reducer(initialState, action);
    expect(state1.elements).toHaveLength(1);
    expect(state1.elements[0]).toEqual(newElement);
    
    // Test that it does not automatically modify history (that is done via ADD_ACTION_HISTORY)
    expect(state1.actionHistory).toEqual([]);
  });

  it('UPDATE_ELEMENT modifies a specific element in the array', () => {
    const state: SignToolState = {
      ...initialState,
      elements: [
        textElement('el-1', { text: 'Hello' }),
        rectangleElement('el-2', { width: 10 })
      ]
    };
    const action = {
      type: 'UPDATE_ELEMENT',
      payload: { id: 'el-1', changes: { text: 'Updated' } }
    } satisfies SignToolAction;
    const nextState = reducer(state, action);
    expect((nextState.elements[0] as TextElement).text).toBe('Updated');
    expect((nextState.elements[1] as RectangleElement).width).toBe(10);
  });

  it('DELETE_ELEMENT removes the element', () => {
    const state: SignToolState = {
      ...initialState,
      elements: [
        textElement('el-1'),
        rectangleElement('el-2')
      ]
    };
    const action = { type: 'DELETE_ELEMENT', payload: 'el-1' } satisfies SignToolAction;
    const nextState = reducer(state, action);
    expect(nextState.elements).toHaveLength(1);
    expect(nextState.elements[0].id).toBe('el-2');
  });

  it('DELETE_ELEMENT also removes the comments anchored to the element', () => {
    const comment = (id: string, anchor: object) => ({ id, type: 'comment', pageIndex: 0, left: 0, top: 0, width: 1, height: 1, comment: 'x', anchor }) as unknown as EditorElement;
    const state: SignToolState = {
      ...initialState,
      elements: [
        textElement('el-1'),
        comment('c-1', { kind: 'element', elementId: 'el-1' }),
        comment('c-2', { kind: 'element', elementId: 'el-2' }),
        comment('c-3', { kind: 'point' }),
        rectangleElement('el-2'),
      ],
    };
    const next = reducer(state, { type: 'DELETE_ELEMENT', payload: 'el-1' });
    expect(next.elements.map((el) => el.id)).toEqual(['c-2', 'c-3', 'el-2']);
  });

  it('SET_ACTIVE_ELEMENT_ID sets activeElementId', () => {
    const action = { type: 'SET_ACTIVE_ELEMENT_ID', payload: 'el-1' } satisfies SignToolAction;
    const nextState = reducer(initialState, action);
    expect(nextState.activeElementId).toBe('el-1');
  });

  // Selection and editing are two states, and only the reducer keeps them in
  // step: editingElementId is null or equal to activeElementId, never anything
  // else. These four cases are that invariant.
  describe('text edit sessions', () => {
    const editing: SignToolState = { ...initialState, activeElementId: 'el-1', editingElementId: 'el-1' };

    it('SET_EDITING_ELEMENT_ID opens a session on the selected element', () => {
      const selected: SignToolState = { ...initialState, activeElementId: 'el-1' };
      const next = reducer(selected, { type: 'SET_EDITING_ELEMENT_ID', payload: 'el-1' });
      expect(next.editingElementId).toBe('el-1');
    });

    it('refuses to open a session on an element that is not selected', () => {
      const selected: SignToolState = { ...initialState, activeElementId: 'el-1' };
      const next = reducer(selected, { type: 'SET_EDITING_ELEMENT_ID', payload: 'el-2' });
      expect(next.editingElementId).toBeNull();
    });

    it('selecting a different element closes the open session', () => {
      const next = reducer(editing, { type: 'SET_ACTIVE_ELEMENT_ID', payload: 'el-2' });
      expect(next.activeElementId).toBe('el-2');
      expect(next.editingElementId).toBeNull();
    });

    it('re-selecting the element being edited leaves the session open', () => {
      const next = reducer(editing, { type: 'SET_ACTIVE_ELEMENT_ID', payload: 'el-1' });
      expect(next.editingElementId).toBe('el-1');
    });

    it('replacing the document clears selection and closes the session', () => {
      const next = reducer(editing, { type: 'SET_ELEMENTS', payload: [] });
      expect(next.activeElementId).toBeNull();
      expect(next.editingElementId).toBeNull();
    });

    it.each([
      { type: 'DELETE_ELEMENT', payload: 'el-1' },
      { type: 'UNDO' }
    ] satisfies SignToolAction[])('$type closes the session when it removes the edited element', (action) => {
      const state: SignToolState = {
        ...editing,
        elements: [textElement('el-1')],
        actionHistory: [addHistory('act-1', 'ADD_TEXT', textElement('el-1'))]
      };
      const next = reducer(state, action);
      expect(next.elements).toEqual([]);
      expect(next.activeElementId).toBeNull();
      expect(next.editingElementId).toBeNull();
    });

    it.each([
      { type: 'DELETE_ELEMENT', payload: 'el-2' },
      { type: 'UNDO' }
    ] satisfies SignToolAction[])('$type preserves the session when it removes another element', (action) => {
      const state: SignToolState = {
        ...editing,
        elements: [textElement('el-1'), textElement('el-2')],
        actionHistory: [addHistory('act-2', 'ADD_TEXT', textElement('el-2'), 1)]
      };
      const next = reducer(state, action);
      expect(next.elements.map(el => el.id)).toEqual(['el-1']);
      expect(next.activeElementId).toBe('el-1');
      expect(next.editingElementId).toBe('el-1');
    });
  });

  it('ADD_ACTION_HISTORY prepends actions to history stack', () => {
    const action1 = { type: 'ADD_ACTION_HISTORY', payload: addHistory('act-1', 'ADD_TEXT', textElement('el-1')) } satisfies SignToolAction;
    const action2 = { type: 'ADD_ACTION_HISTORY', payload: addHistory('act-2', 'ADD_SHAPE', rectangleElement('el-2'), 1) } satisfies SignToolAction;
    
    let state = reducer(initialState, action1);
    expect(state.actionHistory).toHaveLength(1);
    expect(state.actionHistory[0].id).toBe('act-1');
    
    state = reducer(state, action2);
    expect(state.actionHistory).toHaveLength(2);
    expect(state.actionHistory[0].id).toBe('act-2');
    expect(state.actionHistory[1].id).toBe('act-1');
  });

  it('UNDO does nothing when history is empty', () => {
    const nextState = reducer(initialState, { type: 'UNDO' });
    expect(nextState).toEqual(initialState);
  });

  it('UNDO pops the history stack and restores elements array atomically', () => {
    const state: SignToolState = {
      ...initialState,
      elements: [
        textElement('el-1'),
        rectangleElement('el-2')
      ],
      activeElementId: 'el-2',
      actionHistory: [
        addHistory('act-2', 'ADD_SHAPE', rectangleElement('el-2'), 1),
        addHistory('act-1', 'ADD_TEXT', textElement('el-1'))
      ]
    };

    // First undo: removes el-2, pops act-2 from history, sets activeElementId to null (since it matched el-2)
    const stateAfterUndo1 = reducer(state, { type: 'UNDO' });
    expect(stateAfterUndo1.elements).toHaveLength(1);
    expect(stateAfterUndo1.elements[0].id).toBe('el-1');
    expect(stateAfterUndo1.activeElementId).toBeNull();
    expect(stateAfterUndo1.actionHistory).toHaveLength(1);
    expect(stateAfterUndo1.actionHistory[0].id).toBe('act-1');

    // Second undo: removes el-1, pops act-1, activeElementId remains null
    const stateAfterUndo2 = reducer(stateAfterUndo1, { type: 'UNDO' });
    expect(stateAfterUndo2.elements).toHaveLength(0);
    expect(stateAfterUndo2.actionHistory).toHaveLength(0);
  });

  describe('REDO', () => {
    it('does nothing when the future is empty, returning the identical state object', () => {
      const nextState = reducer(initialState, { type: 'REDO' });
      expect(nextState).toBe(initialState);
    });

    it('bumps documentRevision, mirroring UNDO', () => {
      const state: SignToolState = {
        ...initialState,
        documentRevision: 7,
        actionHistory: [addHistory('act-1', 'ADD_TEXT', textElement('el-1'))],
      };
      const undone = reducer(state, { type: 'UNDO' });
      expect(undone.documentRevision).toBe(8);

      const redone = reducer(undone, { type: 'REDO' });
      expect(redone.documentRevision).toBe(9);
      expect(redone.elements.map((el) => el.id)).toEqual(['el-1']);
    });
  });

  it('ADD_ACTION_HISTORY after an undo clears the future, so a further redo is a no-op', () => {
    const state: SignToolState = {
      ...initialState,
      actionHistory: [addHistory('act-1', 'ADD_TEXT', textElement('el-1'))],
    };
    const undone = reducer(state, { type: 'UNDO' });
    expect(undone.redoHistory).toHaveLength(1);

    const withNewAction = reducer(undone, {
      type: 'ADD_ACTION_HISTORY',
      payload: addHistory('act-2', 'ADD_SHAPE', rectangleElement('el-2')),
    });
    expect(withNewAction.redoHistory).toEqual([]);

    const redoAttempt = reducer(withNewAction, { type: 'REDO' });
    expect(redoAttempt).toBe(withNewAction);
  });

  it('LOAD_DOCUMENT clears the future', () => {
    const state: SignToolState = {
      ...initialState,
      redoHistory: [addHistory('act-1', 'ADD_TEXT', textElement('el-1'))],
    };
    const next = reducer(state, { type: 'LOAD_DOCUMENT', payload: { elements: [], actionHistory: [] } });
    expect(next.redoHistory).toEqual([]);
  });
});
