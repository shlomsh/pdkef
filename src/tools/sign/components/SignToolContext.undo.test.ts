import { describe, expect, it } from 'vitest';
import type { EditorElement } from '../../../editor/model/editorModel.ts';
import {
  captureAddedElement,
  captureElementSnapshots,
  createActionEntry,
} from '../../../editor/model/actionHistory.ts';
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
  redoHistory: [],
  documentRevision: 0,
  carried: {},
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

  it('redoes an undone add command, restoring the exact stacking order', () => {
    let state = baseState([back, front]);
    state = reducer(state, { type: 'ADD_ELEMENT', payload: added });
    state = reducer(state, {
      type: 'ADD_ACTION_HISTORY',
      payload: createActionEntry({
        operation: 'add', type: 'ADD_SHAPE', pageIndex: 0, description: 'Added rectangle',
        elements: [captureAddedElement(added, 2)],
      }),
    });

    state = reducer(state, { type: 'UNDO' });
    expect(state.elements.map((element) => element.id)).toEqual(['back', 'front']);

    state = reducer(state, { type: 'REDO' });
    expect(state.elements.map((element) => element.id)).toEqual(['back', 'front', 'added']);
    expect(state.elements[2]).toEqual(added);
    expect(state.actionHistory).toHaveLength(1);
    expect(state.redoHistory).toEqual([]);
  });

  it('redoes an undone delete command, restoring the deleted layer between its original neighbors', () => {
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

    state = reducer(state, { type: 'REDO' });
    expect(state.elements.map((element) => element.id)).toEqual(['back', 'front']);
    expect(state.redoHistory).toEqual([]);
  });
});

// Review finding: the "clear the future on any new command" invariant was
// held by call-site ordering in three cases rather than by the reducer. These
// pin it down where it is now enforced. ADD_ELEMENT is the one that mattered:
// a drag-drawn element enters the document at pointer-down and is only logged
// on commit, so a redo pressed mid-gesture used to splice a restored element
// in beneath it and leave the commit logging the drawn one at a stale index.
describe('every case that changes the document clears the redo future', () => {
  const undoneState = (): SignToolState => {
    const withHistory = reducer(baseState([added]), {
      type: 'ADD_ACTION_HISTORY',
      payload: createActionEntry<EditorElement>({
        operation: 'add',
        type: 'ADD_SHAPE',
        pageIndex: 0,
        description: 'Added rectangle',
        elements: [captureAddedElement(added, 0)],
      }),
    });
    const undone = reducer(withHistory, { type: 'UNDO' });
    expect(undone.redoHistory).toHaveLength(1);
    expect(undone.elements).toEqual([]);
    return undone;
  };

  it('ADD_ELEMENT clears it, so a mid-gesture redo cannot splice underneath', () => {
    const next = reducer(undoneState(), { type: 'ADD_ELEMENT', payload: front });
    expect(next.redoHistory).toEqual([]);
    // REDO is now inert: the drawn element keeps the index its commit will log.
    expect(reducer(next, { type: 'REDO' }).elements.map((element) => element.id)).toEqual(['front']);
  });

  it('SET_ELEMENTS clears it', () => {
    expect(reducer(undoneState(), { type: 'SET_ELEMENTS', payload: [back] }).redoHistory).toEqual([]);
  });

  it('CLEAR_PAGE clears it', () => {
    const withElement: SignToolState = { ...undoneState(), elements: [back] };
    expect(reducer(withElement, { type: 'CLEAR_PAGE', payload: 0 }).redoHistory).toEqual([]);
  });
});
