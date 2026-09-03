import { describe, expect, it } from 'vitest';
import type { EditorElement } from '../../editor/model/editorModel.ts';
import {
  captureAddedElement,
  captureElementSnapshots,
  createActionEntry,
} from '../../editor/model/actionHistory.ts';
import { reducer, type SignToolState } from './SignToolContext.tsx';

const back: EditorElement = { id: 'back', type: 'text', pageIndex: 0, left: 5, top: 5, text: 'Back' };
const front: EditorElement = { id: 'front', type: 'ellipse', pageIndex: 0, left: 15, top: 15, width: 20, height: 20 };
const added: EditorElement = { id: 'added', type: 'rectangle', pageIndex: 0, left: 10, top: 10, width: 20, height: 20 };

const baseState = (elements: EditorElement[]): SignToolState => ({
  selectedTool: null,
  toolLocked: false,
  elements,
  activeElementId: null,
  editingElementId: null,
  actionHistory: [],
  documentRevision: 0,
});

describe('SignTool dependable undo', () => {
  it('undoes a delete followed by its originating add without losing the baseline stack', () => {
    let state = baseState([back, front]);
    state = reducer(state, { type: 'ADD_ELEMENT', payload: added });
    state = reducer(state, {
      type: 'ADD_ACTION_HISTORY',
      payload: createActionEntry({
        operation: 'add', type: 'ADD_SHAPE', pageIndex: 0, description: 'Added rectangle',
        elements: [captureAddedElement(added, 2)],
      }),
    });

    const deleteSnapshots = captureElementSnapshots(state.elements, (element) => element.id === added.id);
    state = reducer(state, { type: 'DELETE_ELEMENT', payload: added.id });
    state = reducer(state, {
      type: 'ADD_ACTION_HISTORY',
      payload: createActionEntry({
        operation: 'delete', type: 'DELETE_ELEMENT', pageIndex: 0, description: 'Deleted rectangle',
        elements: deleteSnapshots,
      }),
    });

    state = reducer(state, { type: 'UNDO' });
    expect(state.elements.map((element) => element.id)).toEqual(['back', 'front', 'added']);
    expect(state.elements[2]).toEqual(added);

    state = reducer(state, { type: 'UNDO' });
    expect(state.elements.map((element) => element.id)).toEqual(['back', 'front']);
    expect(state.actionHistory).toEqual([]);
  });

  it('restores a deleted middle layer between its original neighbors', () => {
    let state = baseState([back, added, front]);
    const snapshots = captureElementSnapshots(state.elements, (element) => element.id === added.id);
    state = reducer(state, { type: 'DELETE_ELEMENT', payload: added.id });
    state = reducer(state, {
      type: 'ADD_ACTION_HISTORY',
      payload: createActionEntry({
        operation: 'delete', type: 'DELETE_ELEMENT', pageIndex: 0, description: 'Deleted rectangle',
        elements: snapshots,
      }),
    });

    state = reducer(state, { type: 'UNDO' });
    expect(state.elements.map((element) => element.id)).toEqual(['back', 'added', 'front']);
  });
});
