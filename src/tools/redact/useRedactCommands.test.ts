// @vitest-environment jsdom
// useRedactCommands calls no Preact hooks of its own (it only wraps plain
// functions around the deps it is handed), so unlike useDeletePreviews.test.ts
// there is nothing here that needs mounting through Preact - these tests call
// the returned commands directly. SNG-08: `commit` is the island's own
// EDIT_COMMITTED, so the harness applies each commit with the real reducer
// (state/redactState.ts) and reads elements, history, the document revision
// and the selection back from it.
import { describe, expect, it, vi } from 'vitest';
import useRedactCommands, { type RedactCommandDeps } from './useRedactCommands.ts';
import { initialRedactState, redactReducer, type EditCommit } from './state/redactState.ts';
import type { ActionHistoryEntry } from '../../editor/model/actionHistory.ts';
import type { RedactElement } from './redactElements.ts';
import type { ElementUpdateKind } from '../../editor/model/updateKind.ts';

interface Box {
  id: string;
  pageIndex: number;
  type: string;
  left?: number;
  top?: number;
  color?: string;
}

function box(overrides: Partial<Box> & { id: string }): Box {
  return { pageIndex: 0, type: 'blackout', left: 0, top: 0, ...overrides };
}

function makeHarness(initialElements: Box[] = [], selectedIds: string[] = []) {
  let state = initialRedactState({ activeColor: '#ffffff', activeBlurStrength: 0.3, brush: { mode: 'box', size: 12 } });
  state = {
    ...state,
    edits: { ...state.edits, elements: initialElements as unknown as RedactElement[] },
    selection: { activeBoxId: selectedIds[0] ?? null, selectedBoxId: selectedIds[1] ?? selectedIds[0] ?? null },
  };
  const registerUndo = vi.fn();
  const describeUpdate = vi.fn((kind: ElementUpdateKind) => `describeUpdate:${kind}`);

  const deps: RedactCommandDeps<Box> = {
    get elements() { return state.edits.elements as unknown as Box[]; },
    commit: (commit) => {
      state = redactReducer(state, { type: 'EDIT_COMMITTED', ...(commit as unknown as EditCommit<RedactElement>) });
    },
    registerUndo,
    describeUpdate,
  };

  const commands = useRedactCommands(deps);
  return {
    commands,
    getElements: () => state.edits.elements as unknown as Box[],
    getHistory: () => state.edits.history as unknown as { past: ActionHistoryEntry<Box>[]; future: ActionHistoryEntry<Box>[] },
    getRevision: () => state.edits.documentRevision,
    getSelection: () => state.selection,
    registerUndo,
    describeUpdate,
  };
}

describe('useRedactCommands.add', () => {
  it('appends the additions, marks the document edited and pushes one add entry', () => {
    const h = makeHarness([box({ id: 'existing' })]);
    const addition = box({ id: 'new', pageIndex: 2 });

    h.commands.add([addition], { type: 'ADD_BLACKOUT', description: 'Added blackout box' });

    expect(h.getElements()).toEqual([box({ id: 'existing' }), addition]);
    expect(h.getRevision()).toBe(1);
    expect(h.getHistory().past).toHaveLength(1);
    const entry = h.getHistory().past[0];
    expect(entry.operation).toBe('add');
    expect(entry.type).toBe('ADD_BLACKOUT');
    expect(entry.description).toBe('Added blackout box');
    expect(entry.pageIndex).toBe(2);
    if (entry.operation !== 'add') throw new Error('expected an add entry');
    expect(entry.elements).toEqual([{ element: addition, index: 1 }]);
    expect(h.registerUndo).not.toHaveBeenCalled();
  });

  it('captures multiple additions at their stacking index, base index after any existing elements', () => {
    const h = makeHarness([box({ id: 'existing' })]);
    const additions = [box({ id: 'a', pageIndex: 0 }), box({ id: 'b', pageIndex: 1 })];

    h.commands.add(additions, { type: 'REPEAT_ON_EVERY_PAGE', description: 'Added the box to 2 more pages' });

    const entry = h.getHistory().past[0];
    if (entry.operation !== 'add') throw new Error('expected an add entry');
    expect(entry.elements).toEqual([
      { element: additions[0], index: 1 },
      { element: additions[1], index: 2 },
    ]);
  });

  it('shows the undo chip only when undoChip is requested', () => {
    const h = makeHarness();
    h.commands.add([box({ id: 'a' })], { type: 'ADD_DELETE', description: 'Marked text for deletion', undoChip: true });
    expect(h.registerUndo).toHaveBeenCalledWith('Marked text for deletion', h.getHistory().past[0], undefined);
  });

  it('is a no-op with no additions', () => {
    const h = makeHarness([box({ id: 'existing' })]);
    h.commands.add([], { type: 'ADD_BLACKOUT', description: 'Added blackout box' });
    expect(h.getElements()).toEqual([box({ id: 'existing' })]);
    expect(h.getRevision()).toBe(0);
    expect(h.getHistory().past).toHaveLength(0);
  });
});

describe('useRedactCommands.remove', () => {
  it('removes the named elements, forgets the selection and always shows the undo chip', () => {
    const kept = box({ id: 'kept' });
    const gone = box({ id: 'gone' });
    const h = makeHarness([kept, gone], ['gone']);

    h.commands.remove(new Set(['gone']), {
      type: 'DELETE_ELEMENT', description: 'Deleted blackout box', pageIndex: 0, chipMessage: 'Removed 1 box',
    });

    expect(h.getElements()).toEqual([kept]);
    expect(h.getRevision()).toBe(1);
    expect(h.getSelection()).toEqual({ activeBoxId: null, selectedBoxId: null });
    const entry = h.getHistory().past[0];
    expect(entry.operation).toBe('delete');
    expect(entry.type).toBe('DELETE_ELEMENT');
    expect(entry.description).toBe('Deleted blackout box');
    if (entry.operation !== 'delete') throw new Error('expected a delete entry');
    expect(entry.elements).toEqual([{ element: gone, index: 1 }]);
    expect(h.registerUndo).toHaveBeenCalledWith('Removed 1 box', entry);
  });

  it('falls back to the entry description when no chipMessage is given', () => {
    const h = makeHarness([box({ id: 'a' }), box({ id: 'b' })]);
    h.commands.remove(new Set(['a', 'b']), {
      type: 'REMOVE_REPEAT_GROUP', description: 'Removed the box from 2 pages', pageIndex: 0,
    });
    expect(h.registerUndo).toHaveBeenCalledWith('Removed the box from 2 pages', h.getHistory().past[0]);
  });

  it('is a no-op when none of the ids exist', () => {
    const h = makeHarness([box({ id: 'a' })], ['a']);
    h.commands.remove(new Set(['missing']), { type: 'DELETE_ELEMENT', description: 'Deleted blackout box', pageIndex: 0 });
    expect(h.getElements()).toEqual([box({ id: 'a' })]);
    expect(h.getRevision()).toBe(0);
    expect(h.getSelection()).toEqual({ activeBoxId: 'a', selectedBoxId: 'a' });
    expect(h.getHistory().past).toHaveLength(0);
    expect(h.registerUndo).not.toHaveBeenCalled();
  });
});

describe('useRedactCommands.update', () => {
  it('applies the edited box\'s own change and describes it through describeUpdate', () => {
    const h = makeHarness([box({ id: 'a', left: 0, top: 0 })]);

    h.commands.update('a', [{ id: 'a', changes: { left: 10 } }]);

    expect(h.getElements()).toEqual([box({ id: 'a', left: 10, top: 0 })]);
    expect(h.getRevision()).toBe(1);
    expect(h.describeUpdate).toHaveBeenCalledWith('move', box({ id: 'a', left: 0, top: 0 }));
    const entry = h.getHistory().past[0];
    expect(entry.operation).toBe('update');
    expect(entry.description).toBe('describeUpdate:move');
    if (entry.operation !== 'update') throw new Error('expected an update entry');
    expect(entry.updates).toEqual([{ id: 'a', before: { left: 0 }, after: { left: 10 } }]);
  });

  it('applies every linked box\'s change and appends the others to the same entry', () => {
    const a = box({ id: 'a', left: 0 });
    const copy = box({ id: 'copy', pageIndex: 1, left: 0 });
    const h = makeHarness([a, copy]);

    h.commands.update('a', [
      { id: 'a', changes: { left: 30 } },
      { id: 'copy', changes: { left: 30 } },
    ]);

    expect(h.getElements()).toEqual([box({ id: 'a', left: 30 }), box({ id: 'copy', pageIndex: 1, left: 30 })]);
    const entry = h.getHistory().past[0];
    if (entry.operation !== 'update') throw new Error('expected an update entry');
    expect(entry.updates).toEqual([
      { id: 'a', before: { left: 0 }, after: { left: 30 } },
      { id: 'copy', before: { left: 0 }, after: { left: 30 } },
    ]);
  });

  it('uses the describe override instead of describeUpdate, e.g. unlinking', () => {
    const h = makeHarness([box({ id: 'a' })]);
    h.commands.update('a', [{ id: 'a', changes: { color: '#fff' } }], { describe: () => 'Unlinked the box on this page' });
    expect(h.describeUpdate).not.toHaveBeenCalled();
    expect(h.getHistory().past[0].description).toBe('Unlinked the box on this page');
  });

  it('is a no-op when the box does not exist', () => {
    const h = makeHarness([box({ id: 'a' })]);
    h.commands.update('missing', [{ id: 'missing', changes: { left: 1 } }]);
    expect(h.getElements()).toEqual([box({ id: 'a' })]);
    expect(h.getRevision()).toBe(0);
    expect(h.getHistory().past).toHaveLength(0);
  });

  it('is a no-op when the edited box\'s own change changes nothing', () => {
    const h = makeHarness([box({ id: 'a', left: 5 })]);
    h.commands.update('a', [{ id: 'a', changes: { left: 5 } }]);
    // Elements still get remapped (a same-value overwrite), but no history
    // entry is pushed - mirrors createUpdateEntry's own null-on-no-change.
    expect(h.getRevision()).toBe(1);
    expect(h.getHistory().past).toHaveLength(0);
  });
});
