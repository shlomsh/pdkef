import { describe, expect, it } from 'vitest';
import type { EditorElement } from './editorModel.ts';
import { captureAddedElement, createActionEntry, type ActionHistoryEntry } from './actionHistory.ts';
import { dropCommands, pushCommand, redoStep, undoStep } from './historyStack.ts';

const shape: EditorElement = {
  id: 'shape', type: 'rectangle', pageIndex: 0, left: 10, top: 10, width: 20, height: 20,
};

function makeEntry(id: string): ActionHistoryEntry<EditorElement> {
  return {
    ...createActionEntry({
      operation: 'add', type: 'ADD_SHAPE', pageIndex: 0, description: id,
      elements: [captureAddedElement(shape, 0)],
    }),
    id,
  };
}

describe('historyStack', () => {
  it('pushCommand puts the new entry newest-first and always empties future', () => {
    const first = makeEntry('a');
    const second = makeEntry('b');

    const afterFirst = pushCommand([], [], first);
    expect(afterFirst).toEqual({ past: [first], future: [] });

    // Pushing while a future exists (from a prior undo) discards it: new work
    // makes any undone-and-not-yet-redone command stale.
    const afterSecond = pushCommand(afterFirst.past, [makeEntry('stale-redo')], second);
    expect(afterSecond).toEqual({ past: [second, first], future: [] });
  });

  it('undoStep moves the most recent past entry to the front of future', () => {
    const a = makeEntry('a');
    const b = makeEntry('b');

    const step = undoStep([b, a], []);
    expect(step).toEqual({ past: [a], future: [b], entry: b });
  });

  it('undoStep returns null when past is empty', () => {
    expect(undoStep([], [])).toBeNull();
  });

  it('redoStep moves the most recently undone entry back onto past', () => {
    const a = makeEntry('a');
    const b = makeEntry('b');

    const step = redoStep([a], [b]);
    expect(step).toEqual({ past: [b, a], future: [], entry: b });
  });

  it('redoStep returns null when future is empty', () => {
    expect(redoStep([makeEntry('a')], [])).toBeNull();
  });

  it('undo then redo is a lossless round trip that preserves exact stacking order', () => {
    const a = makeEntry('a');
    const b = makeEntry('b');
    const c = makeEntry('c');
    const past = [c, b, a];

    const undone = undoStep(past, []);
    expect(undone).not.toBeNull();
    const redone = redoStep(undone!.past, undone!.future);
    expect(redone).not.toBeNull();
    expect(redone!.past).toEqual(past);
    expect(redone!.future).toEqual([]);
  });

  it('dropCommands removes commands identified by id from anywhere in past and always empties future', () => {
    const a = makeEntry('a');
    const b = makeEntry('b');
    const c = makeEntry('c');

    // b sits in the middle of the stack - selective revert, not a plain undo.
    const result = dropCommands([c, b, a], [makeEntry('stale-redo')], new Set(['b']));
    expect(result).toEqual({ past: [c, a], future: [] });
  });

  it('dropCommands empties future even when nothing in past actually matched', () => {
    const a = makeEntry('a');
    const result = dropCommands([a], [makeEntry('stale-redo')], new Set(['not-present']));
    expect(result).toEqual({ past: [a], future: [] });
  });
});
