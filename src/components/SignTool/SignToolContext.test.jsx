import { describe, it, expect } from 'vitest';
import { reducer } from './SignToolContext.jsx';

describe('SignToolContext Reducer', () => {
  const initialState = {
    selectedTool: null,
    elements: [],
    activeElementId: null,
    actionHistory: []
  };

  it('SET_TOOL sets selectedTool', () => {
    const action = { type: 'SET_TOOL', payload: 'text' };
    const nextState = reducer(initialState, action);
    expect(nextState.selectedTool).toBe('text');
  });

  it('SET_ELEMENTS replaces the elements array', () => {
    const elements = [{ id: '1', type: 'text' }];
    const action = { type: 'SET_ELEMENTS', payload: elements };
    const nextState = reducer(initialState, action);
    expect(nextState.elements).toEqual(elements);
  });

  it('ADD_ELEMENT correctly modifies the array', () => {
    const newElement = { id: 'el-1', type: 'text', text: 'Hello' };
    const action = { type: 'ADD_ELEMENT', payload: newElement };
    
    const state1 = reducer(initialState, action);
    expect(state1.elements).toHaveLength(1);
    expect(state1.elements[0]).toEqual(newElement);
    
    // Test that it does not automatically modify history (that is done via ADD_ACTION_HISTORY)
    expect(state1.actionHistory).toEqual([]);
  });

  it('UPDATE_ELEMENT modifies a specific element in the array', () => {
    const state = {
      ...initialState,
      elements: [
        { id: 'el-1', type: 'text', text: 'Hello' },
        { id: 'el-2', type: 'rectangle', width: 10 }
      ]
    };
    const action = {
      type: 'UPDATE_ELEMENT',
      payload: { id: 'el-1', changes: { text: 'Updated' } }
    };
    const nextState = reducer(state, action);
    expect(nextState.elements[0].text).toBe('Updated');
    expect(nextState.elements[1].width).toBe(10);
  });

  it('DELETE_ELEMENT removes the element', () => {
    const state = {
      ...initialState,
      elements: [
        { id: 'el-1', type: 'text' },
        { id: 'el-2', type: 'rectangle' }
      ]
    };
    const action = { type: 'DELETE_ELEMENT', payload: 'el-1' };
    const nextState = reducer(state, action);
    expect(nextState.elements).toHaveLength(1);
    expect(nextState.elements[0].id).toBe('el-2');
  });

  it('SET_ACTIVE_ELEMENT_ID sets activeElementId', () => {
    const action = { type: 'SET_ACTIVE_ELEMENT_ID', payload: 'el-1' };
    const nextState = reducer(initialState, action);
    expect(nextState.activeElementId).toBe('el-1');
  });

  it('ADD_ACTION_HISTORY prepends actions to history stack', () => {
    const action1 = { type: 'ADD_ACTION_HISTORY', payload: { id: 'act-1', elementId: 'el-1', type: 'ADD_TEXT' } };
    const action2 = { type: 'ADD_ACTION_HISTORY', payload: { id: 'act-2', elementId: 'el-2', type: 'ADD_SHAPE' } };
    
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
    const state = {
      selectedTool: null,
      elements: [
        { id: 'el-1', type: 'text' },
        { id: 'el-2', type: 'rectangle' }
      ],
      activeElementId: 'el-2',
      actionHistory: [
        { id: 'act-2', elementId: 'el-2', type: 'ADD_SHAPE' },
        { id: 'act-1', elementId: 'el-1', type: 'ADD_TEXT' }
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
      const state = {
        ...initialState,
        elements: [{ id: 'el-1', type: 'rectangle', width: 0.1, height: 0.1 }]
      };
      const action = {
        type: 'ENSURE_MINIMUM_SIZE',
        payload: { id: 'el-2', tool: 'rectangle', rectWidth: 100, rectHeight: 100, startLeftPercent: 50, startTopPercent: 50 }
      };
      const nextState = reducer(state, action);
      expect(nextState.elements[0].width).toBe(0.1);
    });

    it('resizes tiny lines to minimum size (diagonal < 1)', () => {
      const state = {
        ...initialState,
        elements: [{ id: 'el-1', type: 'line', x1: 50, y1: 50, x2: 50.2, y2: 50.2 }]
      };
      const action = {
        type: 'ENSURE_MINIMUM_SIZE',
        payload: { id: 'el-1', tool: 'line', startLeftPercent: 50, startTopPercent: 50 }
      };
      const nextState = reducer(state, action);
      expect(nextState.elements[0].x1).toBe(44); // 50 - 6
      expect(nextState.elements[0].x2).toBe(56); // 50 + 6
      expect(nextState.elements[0].y1).toBe(50);
      expect(nextState.elements[0].y2).toBe(50);
    });

    it('does not resize lines if already large enough (diagonal >= 1)', () => {
      const state = {
        ...initialState,
        elements: [{ id: 'el-1', type: 'line', x1: 50, y1: 50, x2: 52, y2: 52 }]
      };
      const action = {
        type: 'ENSURE_MINIMUM_SIZE',
        payload: { id: 'el-1', tool: 'line', startLeftPercent: 50, startTopPercent: 50 }
      };
      const nextState = reducer(state, action);
      expect(nextState.elements[0].x2).toBe(52);
    });

    it('resizes tiny whiteout box to default minimum dimensions', () => {
      const state = {
        ...initialState,
        elements: [{ id: 'el-1', type: 'whiteout', left: 50, top: 50, width: 0.1, height: 0.1 }]
      };
      const action = {
        type: 'ENSURE_MINIMUM_SIZE',
        payload: { id: 'el-1', tool: 'whiteout', startLeftPercent: 50, startTopPercent: 50 }
      };
      const nextState = reducer(state, action);
      const el = nextState.elements[0];
      expect(el.width).toBe(10);
      expect(el.height).toBe(4);
      expect(el.left).toBe(45); // 50 - 5
      expect(el.top).toBe(48);  // 50 - 2
    });

    it('resizes tiny shape box to responsive size based on container dimensions', () => {
      const state = {
        ...initialState,
        elements: [{ id: 'el-1', type: 'rectangle', left: 50, top: 50, width: 0.1, height: 0.1 }]
      };
      // defW = 8, defH = widthPercentToHeightPercent(8, 1, 100, 200) = 8 * 1 * (100 / 200) = 4
      const action = {
        type: 'ENSURE_MINIMUM_SIZE',
        payload: { id: 'el-1', tool: 'rectangle', rectWidth: 100, rectHeight: 200, startLeftPercent: 50, startTopPercent: 50 }
      };
      const nextState = reducer(state, action);
      const el = nextState.elements[0];
      expect(el.width).toBe(8);
      expect(el.height).toBe(4);
      expect(el.left).toBe(46); // 50 - 8/2
      expect(el.top).toBe(48); // 50 - 4/2
    });

    it('does not resize shapes if width or height are large enough', () => {
      const state = {
        ...initialState,
        elements: [{ id: 'el-1', type: 'rectangle', left: 50, top: 50, width: 5, height: 0.1 }]
      };
      const action = {
        type: 'ENSURE_MINIMUM_SIZE',
        payload: { id: 'el-1', tool: 'rectangle', rectWidth: 100, rectHeight: 100, startLeftPercent: 50, startTopPercent: 50 }
      };
      const nextState = reducer(state, action);
      expect(nextState.elements[0].width).toBe(5);
    });
  });
});
