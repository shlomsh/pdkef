import { describe, expect, it } from 'vitest';
import type { EditorElement } from '../../../editor/model/editorModel.ts';
import {
  captureAddedElement,
  captureElementSnapshots,
  createActionEntry,
} from '../../../editor/model/actionHistory.ts';
import { createUpdateEntry } from '../../../editor/model/updateKind.ts';
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
  appStyle: {},
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

// UNDO-04: the update entries createUpdateEntry builds at PdfWorkspace.tsx's
// updateElement choke point, exercised at the reducer only (no component
// mount) - the repro that motivated the whole ticket (a move that could not
// be undone), a text edit session collapsing into one step, and the
// documentRevision bump SIGN-14 relies on.
describe('SignTool logs moves, resizes, styling and typing as update entries', () => {
  const signature: EditorElement = {
    id: 'sig', type: 'signature', pageIndex: 0, left: 10, top: 10, width: 30, height: 15,
  } as EditorElement;

  it('undoes a move back to the pre-move position, then redoes, then a second undo removes the signature', () => {
    let state = baseState([]);
    state = reducer(state, { type: 'ADD_ELEMENT', payload: signature });
    state = reducer(state, {
      type: 'ADD_ACTION_HISTORY',
      payload: createActionEntry({
        operation: 'add', type: 'ADD_SIGNATURE', pageIndex: 0, description: 'Added signature',
        elements: [captureAddedElement(signature, 0)],
      }),
    });

    const moved = { ...signature, left: 40, top: 25 };
    const updateEntry = createUpdateEntry(signature, { left: 40, top: 25 }, () => 'Moved Sign');
    state = reducer(state, { type: 'UPDATE_ELEMENT', payload: { id: signature.id, changes: { left: 40, top: 25 } } });
    state = reducer(state, { type: 'ADD_ACTION_HISTORY', payload: updateEntry! });
    expect(state.elements.find((el) => el.id === signature.id)).toEqual(moved);

    state = reducer(state, { type: 'UNDO' });
    expect(state.elements.find((el) => el.id === signature.id)).toEqual(signature);

    state = reducer(state, { type: 'REDO' });
    expect(state.elements.find((el) => el.id === signature.id)).toEqual(moved);

    state = reducer(state, { type: 'UNDO' }); // undo the move
    state = reducer(state, { type: 'UNDO' }); // undo the add
    expect(state.elements).toEqual([]);
  });

  it('collapses two text updates in the same edit session into one undo step', () => {
    const textEl: EditorElement = { id: 'txt', type: 'text', pageIndex: 0, left: 5, top: 5, text: 'A' };
    let state = baseState([textEl]);

    const session = 'session-1';
    const firstChange = { text: 'AB' };
    const firstEntry = createUpdateEntry(textEl, firstChange, () => 'Edited text', session);
    state = reducer(state, { type: 'UPDATE_ELEMENT', payload: { id: textEl.id, changes: firstChange } });
    state = reducer(state, { type: 'ADD_ACTION_HISTORY', payload: firstEntry! });

    const afterFirst = state.elements[0];
    const secondChange = { text: 'ABC' };
    const secondEntry = createUpdateEntry(afterFirst, secondChange, () => 'Edited text', session);
    state = reducer(state, { type: 'UPDATE_ELEMENT', payload: { id: textEl.id, changes: secondChange } });
    state = reducer(state, { type: 'ADD_ACTION_HISTORY', payload: secondEntry! });

    expect(state.elements[0]).toEqual({ ...textEl, text: 'ABC' });
    expect(state.actionHistory).toHaveLength(1);

    state = reducer(state, { type: 'UNDO' });
    expect(state.elements[0]).toEqual(textEl);
  });

  it('bumps documentRevision on an update entry undo and redo', () => {
    let state = baseState([signature]);
    const updateEntry = createUpdateEntry(signature, { left: 40, top: 25 }, () => 'Moved Sign');
    state = reducer(state, { type: 'UPDATE_ELEMENT', payload: { id: signature.id, changes: { left: 40, top: 25 } } });
    state = reducer(state, { type: 'ADD_ACTION_HISTORY', payload: updateEntry! });

    const revisionAfterUpdate = state.documentRevision;
    state = reducer(state, { type: 'UNDO' });
    expect(state.documentRevision).toBeGreaterThan(revisionAfterUpdate);

    const revisionAfterUndo = state.documentRevision;
    state = reducer(state, { type: 'REDO' });
    expect(state.documentRevision).toBeGreaterThan(revisionAfterUndo);
  });
});
