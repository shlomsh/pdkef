import { describe, expect, it } from 'vitest';
import type { EditorElement } from './editorModel.ts';
import { captureAddedElement, createActionEntry, type ActionHistoryEntry } from './actionHistory.ts';
import { pushCommand, redoStep, revertCommands, undoStep } from './historyStack.ts';

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

  it('revertCommands drops a command from the middle of past and empties future', () => {
    const [a, b, c] = [makeEntry('a'), makeEntry('b'), makeEntry('c')];
    const result = revertCommands([c, b, a], [makeEntry('stale-redo')], new Set(['b']));
    expect(result.past).toEqual([c, a]);
    expect(result.future).toEqual([]);
  });

  it('revertCommands empties future even when nothing in past actually matched', () => {
    const a = makeEntry('a');
    const result = revertCommands([a], [makeEntry('stale-redo')], new Set(['not-present']));
    expect(result.past).toEqual([a]);
    expect(result.future).toEqual([]);
  });

  // Redact's undo chip reverts one named entry, and while that entry is still
  // the newest, that is a plain undo - so it has to leave a redo exactly as
  // Cmd+Z would.
  it('revertCommands keeps a redo when the newest command is the one reverted', () => {
    const [a, b, c] = [makeEntry('a'), makeEntry('b'), makeEntry('c')];
    const result = revertCommands([c, b, a], [], new Set(['c']));
    expect(result.past).toEqual([b, a]);
    expect(result.future).toEqual([c]);
  });

  // Reverting the newest few together is several undos at once, so redoing
  // twice must replay them in the order they would have been done singly.
  it('revertCommands keeps a redo for a contiguous run at the top, oldest replayed first', () => {
    const [a, b, c] = [makeEntry('a'), makeEntry('b'), makeEntry('c')];
    const result = revertCommands([c, b, a], [], new Set(['c', 'b']));
    expect(result.past).toEqual([a]);
    expect(result.future).toEqual([b, c]);

    const first = redoStep(result.past, result.future);
    expect(first?.entry).toBe(b);
    const second = redoStep(first!.past, first!.future);
    expect(second?.entry).toBe(c);
    expect(second?.past).toEqual([c, b, a]);
  });

  it('revertCommands drops the future when the run includes a command below the top', () => {
    const [a, b, c] = [makeEntry('a'), makeEntry('b'), makeEntry('c')];
    const result = revertCommands([c, b, a], [], new Set(['c', 'a']));
    expect(result.past).toEqual([b]);
    expect(result.future).toEqual([]);
  });
});
