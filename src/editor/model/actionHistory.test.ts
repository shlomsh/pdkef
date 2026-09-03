import { describe, expect, it } from 'vitest';
import type { EditorElement } from './editorModel.ts';
import {
  captureAddedElement,
  captureElementSnapshots,
  createActionEntry,
  isActionHistoryEntry,
  revertHistoryEntries,
  type ActionHistoryEntry,
} from './actionHistory.ts';

const back: EditorElement = {
  id: 'back', type: 'text', pageIndex: 0, left: 5, top: 5, text: 'Back',
};
const middle: EditorElement = {
  id: 'middle', type: 'rectangle', pageIndex: 0, left: 10, top: 10, width: 20, height: 20,
};
const front: EditorElement = {
  id: 'front', type: 'ellipse', pageIndex: 0, left: 15, top: 15, width: 20, height: 20,
};

const ids = (elements: readonly EditorElement[]) => elements.map((element) => element.id);

describe('action history commands', () => {
  it('retains a complete snapshot for additions and rejects malformed persisted commands', () => {
    const command = createActionEntry({
      operation: 'add',
      type: 'ADD_SHAPE',
      pageIndex: 0,
      description: 'Added rectangle',
      elements: [captureAddedElement(middle, 1)],
    });

    expect(command.elements).toEqual([{ element: middle, index: 1 }]);
    expect(isActionHistoryEntry(command, (value): value is EditorElement => (
      Boolean(value) && typeof value === 'object' && (value as { id?: unknown }).id === middle.id
    ))).toBe(true);
    expect(isActionHistoryEntry(
      { ...command, elements: [{ element: middle, index: '1' }] },
      (value): value is EditorElement => Boolean(value),
    )).toBe(false);
  });

  it('restores a deleted element at its original stacking position', () => {
    const beforeDelete = [back, middle, front];
    const command = createActionEntry({
      operation: 'delete',
      type: 'DELETE_ELEMENT',
      pageIndex: 0,
      description: 'Deleted rectangle',
      elements: captureElementSnapshots(beforeDelete, (element) => element.id === middle.id),
    });

    expect(ids(revertHistoryEntries([back, front], [command]))).toEqual(['back', 'middle', 'front']);
  });

  it('restores a clear-page command atomically without disturbing other pages', () => {
    const otherPage: EditorElement = {
      id: 'page-2', type: 'whiteout', pageIndex: 1, left: 1, top: 1, width: 5, height: 5,
    };
    const beforeClear = [back, otherPage, middle, front];
    const command = createActionEntry({
      operation: 'delete',
      type: 'CLEAR_PAGE',
      pageIndex: 0,
      description: 'Cleared page 1',
      elements: captureElementSnapshots(beforeClear, (element) => element.pageIndex === 0),
    });

    expect(ids(revertHistoryEntries([otherPage], [command]))).toEqual(ids(beforeClear));
  });

  it('applies selective history in newest-first order like repeated single undo', () => {
    const add = createActionEntry({
      operation: 'add', type: 'ADD_SHAPE', pageIndex: 0, description: 'Added rectangle',
      elements: [captureAddedElement(middle, 2)],
    });
    const remove = createActionEntry({
      operation: 'delete', type: 'DELETE_ELEMENT', pageIndex: 0, description: 'Deleted rectangle',
      elements: [captureAddedElement(middle, 2)],
    });

    expect(ids(revertHistoryEntries<EditorElement>([back, front], [remove, add]))).toEqual(['back', 'front']);
    expect(ids(revertHistoryEntries<EditorElement>([back, front], [remove]))).toEqual(['back', 'front', 'middle']);
  });

  it('requires stacking positions in the compile-time contract', () => {
    const invalid: ActionHistoryEntry<EditorElement> = {
      id: 'history-1',
      operation: 'add',
      type: 'ADD_TEXT',
      pageIndex: 0,
      description: 'Added text',
      timestamp: 1,
      elements: [{
        element: back,
        // @ts-expect-error persisted stacking positions are numeric indexes
        index: '0',
      }],
    };

    expect(invalid).toBeDefined();
  });
});
