import { describe, it, expect } from 'vitest';
import type { ActionHistoryEntry } from '../../editor/model/actionHistory.ts';
import type {
  EditorElement,
  LineElement,
  RectangleElement,
  TextElement,
  WhiteoutElement,
} from '../../editor/model/editorModel.ts';
import { reducer, type SignToolAction, type SignToolState } from './SignToolContext.tsx';

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

const lineElement = (id: string, overrides: Partial<LineElement> = {}): LineElement => ({
  id,
  type: 'line',
  pageIndex: 0,
  x1: 0,
  y1: 0,
  x2: 0,
  y2: 0,
  ...overrides,
});

const whiteoutElement = (id: string, overrides: Partial<WhiteoutElement> = {}): WhiteoutElement => ({
  id,
  type: 'whiteout',
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

describe('SignToolContext Reducer', () => {
  const initialState: SignToolState = {
    selectedTool: null,
    toolLocked: false,
    elements: [],
    activeElementId: null,
    editingElementId: null,
    actionHistory: [],
    documentRevision: 0,
  };

  it('SET_TOOL sets selectedTool', () => {
    const action = { type: 'SET_TOOL', payload: 'text' } satisfies SignToolAction;
    const nextState = reducer(initialState, action);
    expect(nextState.selectedTool).toBe('text');
  });

  it('SET_ELEMENTS replaces the elements array', () => {
    const elements = [textElement('1')];
    const action = { type: 'SET_ELEMENTS', payload: elements } satisfies SignToolAction;
    const nextState = reducer(initialState, action);
    expect(nextState.elements).toEqual(elements);
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

  describe('CLEAR_PAGE', () => {
    it('removes only the elements on the given page', () => {
      const state: SignToolState = {
        ...initialState,
        elements: [
          textElement('el-1'),
          rectangleElement('el-2', { pageIndex: 1 }),
          { id: 'el-3', type: 'signature', pageIndex: 0, left: 0, top: 0, width: 0, height: 0, dataUrl: 'data:image/png;base64,test' }
        ]
      };
      const nextState = reducer(state, { type: 'CLEAR_PAGE', payload: 0 });
      expect(nextState.elements).toHaveLength(1);
      expect(nextState.elements[0].id).toBe('el-2');
    });

    it('drops the selection when the active element was on the cleared page', () => {
      const state: SignToolState = {
        ...initialState,
        elements: [textElement('el-1')],
        activeElementId: 'el-1',
        editingElementId: 'el-1'
      };
      const nextState = reducer(state, { type: 'CLEAR_PAGE', payload: 0 });
      expect(nextState.activeElementId).toBeNull();
      expect(nextState.editingElementId).toBeNull();
    });

    it('leaves the selection untouched when the active element is on a different page', () => {
      const state: SignToolState = {
        ...initialState,
        elements: [
          textElement('el-1'),
          textElement('el-2', { pageIndex: 1 })
        ],
        activeElementId: 'el-2'
      };
      const nextState = reducer(state, { type: 'CLEAR_PAGE', payload: 0 });
      expect(nextState.activeElementId).toBe('el-2');
      expect(nextState.elements).toHaveLength(1);
    });

    it('is a no-op when the page has nothing on it', () => {
      const state: SignToolState = {
        ...initialState,
        elements: [textElement('el-1', { pageIndex: 1 })]
      };
      const nextState = reducer(state, { type: 'CLEAR_PAGE', payload: 0 });
      expect(nextState).toBe(state);
    });
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

  describe('ENSURE_MINIMUM_SIZE', () => {
    it('does not modify non-matching elements', () => {
      const state: SignToolState = {
        ...initialState,
        elements: [rectangleElement('el-1', { width: 0.1, height: 0.1 })]
      };
      const action = {
        type: 'ENSURE_MINIMUM_SIZE',
        payload: { id: 'el-2', tool: 'rectangle', rectWidth: 100, rectHeight: 100, startLeftPercent: 50, startTopPercent: 50 }
      } satisfies SignToolAction;
      const nextState = reducer(state, action);
      expect((nextState.elements[0] as RectangleElement).width).toBe(0.1);
    });

    it('resizes tiny lines to minimum size (diagonal < 1)', () => {
      const state: SignToolState = {
        ...initialState,
        elements: [lineElement('el-1', { x1: 50, y1: 50, x2: 50.2, y2: 50.2 })]
      };
      const action = {
        type: 'ENSURE_MINIMUM_SIZE',
        payload: { id: 'el-1', tool: 'line', rectWidth: 100, rectHeight: 100, startLeftPercent: 50, startTopPercent: 50 }
      } satisfies SignToolAction;
      const nextState = reducer(state, action);
      const element = nextState.elements[0] as LineElement;
      expect(element.x1).toBe(44); // 50 - 6
      expect(element.x2).toBe(56); // 50 + 6
      expect(element.y1).toBe(50);
      expect(element.y2).toBe(50);
    });

    it('does not resize lines if already large enough (diagonal >= 1)', () => {
      const state: SignToolState = {
        ...initialState,
        elements: [lineElement('el-1', { x1: 50, y1: 50, x2: 52, y2: 52 })]
      };
      const action = {
        type: 'ENSURE_MINIMUM_SIZE',
        payload: { id: 'el-1', tool: 'line', rectWidth: 100, rectHeight: 100, startLeftPercent: 50, startTopPercent: 50 }
      } satisfies SignToolAction;
      const nextState = reducer(state, action);
      expect((nextState.elements[0] as LineElement).x2).toBe(52);
    });

    it('resizes tiny whiteout box to default minimum dimensions', () => {
      const state: SignToolState = {
        ...initialState,
        elements: [whiteoutElement('el-1', { left: 50, top: 50, width: 0.1, height: 0.1 })]
      };
      const action = {
        type: 'ENSURE_MINIMUM_SIZE',
        payload: { id: 'el-1', tool: 'whiteout', rectWidth: 100, rectHeight: 100, startLeftPercent: 50, startTopPercent: 50 }
      } satisfies SignToolAction;
      const nextState = reducer(state, action);
      const el = nextState.elements[0] as WhiteoutElement;
      expect(el.width).toBe(10);
      expect(el.height).toBe(4);
      expect(el.left).toBe(45); // 50 - 5
      expect(el.top).toBe(48);  // 50 - 2
    });

    it('resizes tiny shape box to responsive size based on container dimensions', () => {
      const state: SignToolState = {
        ...initialState,
        elements: [rectangleElement('el-1', { left: 50, top: 50, width: 0.1, height: 0.1 })]
      };
      // defW = 8, defH = widthPercentToHeightPercent(8, 1, 100, 200) = 8 * 1 * (100 / 200) = 4
      const action = {
        type: 'ENSURE_MINIMUM_SIZE',
        payload: { id: 'el-1', tool: 'rectangle', rectWidth: 100, rectHeight: 200, startLeftPercent: 50, startTopPercent: 50 }
      } satisfies SignToolAction;
      const nextState = reducer(state, action);
      const el = nextState.elements[0] as RectangleElement;
      expect(el.width).toBe(8);
      expect(el.height).toBe(4);
      expect(el.left).toBe(46); // 50 - 8/2
      expect(el.top).toBe(48); // 50 - 4/2
    });

    it('does not resize shapes if width or height are large enough', () => {
      const state: SignToolState = {
        ...initialState,
        elements: [rectangleElement('el-1', { left: 50, top: 50, width: 5, height: 0.1 })]
      };
      const action = {
        type: 'ENSURE_MINIMUM_SIZE',
        payload: { id: 'el-1', tool: 'rectangle', rectWidth: 100, rectHeight: 100, startLeftPercent: 50, startTopPercent: 50 }
      } satisfies SignToolAction;
      const nextState = reducer(state, action);
      expect((nextState.elements[0] as RectangleElement).width).toBe(5);
    });
  });
});
