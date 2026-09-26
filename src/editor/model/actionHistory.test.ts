import { describe, expect, it } from 'vitest';
import type { EditorElement } from './editorModel.ts';
import {
  applyHistoryEntries,
  canCoalesce,
  captureAddedElement,
  captureElementSnapshots,
  captureElementUpdate,
  coalesceUpdates,
  createActionEntry,
  isActionHistoryEntry,
  revertHistoryEntries,
  type ActionHistoryEntry,
  type UpdateHistoryEntry,
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

  it('round-trips an add command through undo then redo, preserving exact stacking order', () => {
    const add = createActionEntry({
      operation: 'add', type: 'ADD_SHAPE', pageIndex: 0, description: 'Added rectangle',
      elements: [captureAddedElement(middle, 1)],
    });
    const beforeUndo = [back, middle, front];

    const afterUndo = revertHistoryEntries(beforeUndo, [add]);
    expect(ids(afterUndo)).toEqual(['back', 'front']);

    const afterRedo = applyHistoryEntries(afterUndo, [add]);
    expect(ids(afterRedo)).toEqual(ids(beforeUndo));

    // Re-applying an already-applied add is a no-op (restoreSnapshots skips
    // ids already present), so redo can never be dispatched twice by mistake.
    expect(ids(applyHistoryEntries(afterRedo, [add]))).toEqual(ids(afterRedo));
  });

  it('round-trips a delete command through undo then redo, preserving exact stacking order', () => {
    const beforeDelete = [back, middle, front];
    const remove = createActionEntry({
      operation: 'delete', type: 'DELETE_ELEMENT', pageIndex: 0, description: 'Deleted rectangle',
      elements: captureElementSnapshots(beforeDelete, (element) => element.id === middle.id),
    });

    const afterUndo = revertHistoryEntries([back, front], [remove]);
    expect(ids(afterUndo)).toEqual(['back', 'middle', 'front']);

    const afterRedo = applyHistoryEntries(afterUndo, [remove]);
    expect(ids(afterRedo)).toEqual(['back', 'front']);

    // Re-applying an already-applied delete is idempotent: the id is simply
    // absent already, so filtering it out again changes nothing.
    expect(ids(applyHistoryEntries(afterRedo, [remove]))).toEqual(ids(afterRedo));
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

function makeUpdateEntry(
  overrides: Partial<UpdateHistoryEntry<EditorElement>> = {},
): UpdateHistoryEntry<EditorElement> {
  return {
    ...createActionEntry<EditorElement>({
      operation: 'update',
      type: 'MOVE_ELEMENT',
      pageIndex: 0,
      description: 'Moved',
      updates: [{ id: middle.id, before: { left: 10 }, after: { left: 20 } }],
    }),
    ...overrides,
  } as UpdateHistoryEntry<EditorElement>;
}

describe('captureElementUpdate', () => {
  it('returns only the changed fields', () => {
    const update = captureElementUpdate(middle, { left: 30, top: 10, width: 25 });
    expect(update).toEqual({ id: middle.id, before: { left: 10, width: 20 }, after: { left: 30, width: 25 } });
  });

  it('sets before to undefined for a key absent on the element', () => {
    // `front` never had `color` set, unlike `middle`/`back` above.
    const update = captureElementUpdate(front, { color: '#ff0000' });
    expect(update).toEqual({ id: front.id, before: { color: undefined }, after: { color: '#ff0000' } });
  });

  it('returns null for a no-op patch', () => {
    expect(captureElementUpdate(middle, { left: middle.left, top: middle.top })).toBeNull();
  });

  it('never captures id or pageIndex even when passed in changes', () => {
    const update = captureElementUpdate(middle, { id: 'other', pageIndex: 3, left: 99 });
    expect(update).toEqual({ id: middle.id, before: { left: 10 }, after: { left: 99 } });
  });
});

describe('revertHistoryEntries / applyHistoryEntries on an update entry', () => {
  it('restores before/after in place, keeping array order unchanged', () => {
    const moved = { ...middle, left: 30 };
    const entry = makeUpdateEntry({
      updates: [{ id: middle.id, before: { left: 10 }, after: { left: 30 } }],
    });

    const reverted = revertHistoryEntries([back, moved, front], [entry]);
    expect(reverted.map((element) => element.id)).toEqual(['back', 'middle', 'front']);
    expect(reverted[1]).toEqual({ ...middle, left: 10 });

    const applied = applyHistoryEntries([back, middle, front], [entry]);
    expect(applied.map((element) => element.id)).toEqual(['back', 'middle', 'front']);
    expect(applied[1]).toEqual({ ...middle, left: 30 });
  });

  it('leaves a missing element alone', () => {
    const entry = makeUpdateEntry({
      updates: [{ id: 'not-present', before: { left: 10 }, after: { left: 30 } }],
    });
    expect(revertHistoryEntries([back, front], [entry])).toEqual([back, front]);
    expect(applyHistoryEntries([back, front], [entry])).toEqual([back, front]);
  });
});

describe('canCoalesce', () => {
  it('is true for the same element and same type within 500ms', () => {
    const top = makeUpdateEntry({ timestamp: 1000 });
    const incoming = makeUpdateEntry({ timestamp: 1500 });
    expect(canCoalesce(top, incoming)).toBe(true);
  });

  it('is false at 501ms', () => {
    const top = makeUpdateEntry({ timestamp: 1000 });
    const incoming = makeUpdateEntry({ timestamp: 1501 });
    expect(canCoalesce(top, incoming)).toBe(false);
  });

  it('is false for a different element', () => {
    const top = makeUpdateEntry({ timestamp: 1000 });
    const incoming = makeUpdateEntry({
      timestamp: 1200,
      updates: [{ id: 'other', before: { left: 10 }, after: { left: 20 } }],
    });
    expect(canCoalesce(top, incoming)).toBe(false);
  });

  it('is false for the same type touching different fields (Bold then Italic)', () => {
    const top = makeUpdateEntry({
      timestamp: 1000,
      type: 'STYLE_ELEMENT',
      updates: [{ id: middle.id, before: { fontWeight: 'normal' }, after: { fontWeight: 'bold' } }],
    });
    const incoming = makeUpdateEntry({
      timestamp: 1100,
      type: 'STYLE_ELEMENT',
      updates: [{ id: middle.id, before: { fontStyle: 'normal' }, after: { fontStyle: 'italic' } }],
    });
    expect(canCoalesce(top, incoming)).toBe(false);
  });

  it('is false for a different type', () => {
    const top = makeUpdateEntry({ timestamp: 1000, type: 'MOVE_ELEMENT' });
    const incoming = makeUpdateEntry({ timestamp: 1200, type: 'RESIZE_ELEMENT' });
    expect(canCoalesce(top, incoming)).toBe(false);
  });

  it('is false for a negative elapsed time', () => {
    const top = makeUpdateEntry({ timestamp: 1000 });
    const incoming = makeUpdateEntry({ timestamp: 999 });
    expect(canCoalesce(top, incoming)).toBe(false);
  });

  it('same group merges regardless of time', () => {
    const top = makeUpdateEntry({ timestamp: 1000, group: 'session-1' });
    const incoming = makeUpdateEntry({ timestamp: 999999, group: 'session-1' });
    expect(canCoalesce(top, incoming)).toBe(true);
  });

  it('different groups do not merge', () => {
    const top = makeUpdateEntry({ timestamp: 1000, group: 'session-1' });
    const incoming = makeUpdateEntry({ timestamp: 1200, group: 'session-2' });
    expect(canCoalesce(top, incoming)).toBe(false);
  });

  it('a grouped entry never merges with an ungrouped one', () => {
    const top = makeUpdateEntry({ timestamp: 1000, group: 'session-1' });
    const incoming = makeUpdateEntry({ timestamp: 1200 });
    expect(canCoalesce(top, incoming)).toBe(false);
    expect(canCoalesce(incoming, top)).toBe(false);
  });

  it('add and delete never coalesce', () => {
    const add = createActionEntry({
      operation: 'add', type: 'ADD_SHAPE', pageIndex: 0, description: 'Added',
      elements: [captureAddedElement(middle, 0)],
    });
    const del = createActionEntry({
      operation: 'delete', type: 'DELETE_ELEMENT', pageIndex: 0, description: 'Deleted',
      elements: [captureAddedElement(middle, 0)],
    });
    expect(canCoalesce(add, del)).toBe(false);
    expect(canCoalesce(add, makeUpdateEntry())).toBe(false);
    expect(canCoalesce(makeUpdateEntry(), del)).toBe(false);
  });
});

describe('coalesceUpdates', () => {
  it('keeps the earliest before and the latest after', () => {
    const top = makeUpdateEntry({
      timestamp: 1000,
      updates: [{ id: middle.id, before: { left: 10 }, after: { left: 20 } }],
    });
    const incoming = makeUpdateEntry({
      timestamp: 1200,
      updates: [{ id: middle.id, before: { left: 20 }, after: { left: 40 } }],
    });
    const folded = coalesceUpdates(top, incoming);
    expect(folded?.updates).toEqual([{ id: middle.id, before: { left: 10 }, after: { left: 40 } }]);
  });

  it('takes the incoming description/type/timestamp and the top id', () => {
    const top = makeUpdateEntry({ id: 'top-id', timestamp: 1000, type: 'MOVE_ELEMENT', description: 'Moved' });
    const incoming = makeUpdateEntry({
      id: 'incoming-id', timestamp: 1200, type: 'RESIZE_ELEMENT', description: 'Resized',
      updates: [{ id: middle.id, before: { left: 20 }, after: { left: 30 } }],
    });
    const folded = coalesceUpdates(top, incoming);
    expect(folded?.id).toBe('top-id');
    expect(folded?.type).toBe('RESIZE_ELEMENT');
    expect(folded?.description).toBe('Resized');
    expect(folded?.timestamp).toBe(1200);
  });

  it('returns null when the net change is nothing (move right then back)', () => {
    const top = makeUpdateEntry({
      timestamp: 1000,
      updates: [{ id: middle.id, before: { left: 10 }, after: { left: 30 } }],
    });
    const incoming = makeUpdateEntry({
      timestamp: 1200,
      updates: [{ id: middle.id, before: { left: 30 }, after: { left: 10 } }],
    });
    expect(coalesceUpdates(top, incoming)).toBeNull();
  });
});

describe('isActionHistoryEntry for an update entry', () => {
  const isElement = (value: unknown): value is EditorElement => (
    Boolean(value) && typeof value === 'object'
  );

  const wellFormed = makeUpdateEntry();

  it('accepts a well-formed update', () => {
    expect(isActionHistoryEntry(wellFormed, isElement)).toBe(true);
  });

  it('rejects empty updates', () => {
    expect(isActionHistoryEntry({ ...wellFormed, updates: [] }, isElement)).toBe(false);
  });

  it('rejects before/after key sets that differ', () => {
    const bad = {
      ...wellFormed,
      updates: [{ id: middle.id, before: { left: 10, top: 5 }, after: { left: 20 } }],
    };
    expect(isActionHistoryEntry(bad, isElement)).toBe(false);
  });

  it('rejects a key "id" in after', () => {
    const bad = {
      ...wellFormed,
      updates: [{ id: middle.id, before: { id: 'a' }, after: { id: 'b' } }],
    };
    expect(isActionHistoryEntry(bad, isElement)).toBe(false);
  });

  it('rejects a key "pageIndex" in after', () => {
    const bad = {
      ...wellFormed,
      updates: [{ id: middle.id, before: { pageIndex: 0 }, after: { pageIndex: 1 } }],
    };
    expect(isActionHistoryEntry(bad, isElement)).toBe(false);
  });

  it('rejects an empty-string group', () => {
    expect(isActionHistoryEntry({ ...wellFormed, group: '' }, isElement)).toBe(false);
  });

  it('rejects duplicate update ids', () => {
    const bad = {
      ...wellFormed,
      updates: [
        { id: middle.id, before: { left: 10 }, after: { left: 20 } },
        { id: middle.id, before: { top: 5 }, after: { top: 15 } },
      ],
    };
    expect(isActionHistoryEntry(bad, isElement)).toBe(false);
  });

  it('rejects a non-object before', () => {
    const bad = {
      ...wellFormed,
      updates: [{ id: middle.id, before: 'nope', after: { left: 20 } }],
    };
    expect(isActionHistoryEntry(bad, isElement)).toBe(false);
  });
});
