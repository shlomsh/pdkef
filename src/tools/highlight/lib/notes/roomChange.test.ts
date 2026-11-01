import { describe, expect, it } from 'vitest';
import type { CommentElement, HighlightElement } from '#editor/model/editorModel.ts';
import { affectsNotes, roomChange } from './roomChange.ts';

const mark = (id: string): HighlightElement => ({
  id, type: 'highlight', pageIndex: 0, left: 10, top: 20, width: 30, height: 4,
  color: '#FFF34D', bands: [{ left: 0, top: 0, width: 100, height: 100 }],
});
const comment = (id: string, on: string, text: string): CommentElement => ({
  id, type: 'comment', pageIndex: 0, left: 10, top: 20, width: 30, height: 4,
  comment: text, anchor: { kind: 'element', elementId: on },
});
const state = (elements: (HighlightElement | CommentElement)[], activeElementId: string | null = null) => ({ elements, activeElementId });

describe('roomChange', () => {
  it('the first card makes room, passage on the mark it is anchored to', () => {
    const before = state([mark('h1')]);
    const after = state([mark('h1'), comment('c1', 'h1', '')], 'c1');
    expect(roomChange(before, after, true)).toEqual({ noted: true, markId: 'h1' });
  });

  it('the last card going gives the room back, passage on the mark it was anchored to', () => {
    const before = state([mark('h1'), comment('c1', 'h1', '')], 'c1');
    expect(roomChange(before, state([mark('h1'), comment('c1', 'h1', '')], null), true)).toEqual({ noted: false, markId: 'h1' });
  });

  it('deleting the mark that holds the only saved note gives the room back', () => {
    const before = state([mark('h1'), comment('c1', 'h1', 'Check this')]);
    expect(roomChange(before, state([]), true)).toEqual({ noted: false, markId: 'h1' });
  });

  it('a card that is still there, or another one arriving, changes nothing', () => {
    const saved = [mark('h1'), comment('c1', 'h1', 'Check this')];
    expect(roomChange(state(saved), state(saved, 'c1'), true)).toBeNull();
    expect(roomChange(state(saved), state([...saved, mark('h2'), comment('c2', 'h2', '')], 'c2'), true)).toBeNull();
    expect(roomChange(state(saved, 'c1'), state([saved[0]]), true)).toEqual({ noted: false, markId: 'h1' });
  });

  it('a blank comment that is not active is not a card', () => {
    const blank = [mark('h1'), comment('c1', 'h1', '')];
    expect(roomChange(state(blank), state(blank), true)).toBeNull();
  });

  it('with no rail to show (a narrow screen uses the sheet) nothing makes room', () => {
    expect(roomChange(state([mark('h1')]), state([mark('h1'), comment('c1', 'h1', '')], 'c1'), false)).toBeNull();
  });
});

describe('roomChange through history', () => {
  it('undoing the only saved note finds the mark in the before state, and redoing it in the after state', () => {
    const withNote = state([mark('h1'), comment('c1', 'h1', 'Check this')]);
    const without = state([mark('h1')]);
    expect(roomChange(withNote, without, true)).toEqual({ noted: false, markId: 'h1' });
    expect(roomChange(without, withNote, true)).toEqual({ noted: true, markId: 'h1' });
  });
});

describe('affectsNotes', () => {
  it('names the actions that can open or close a card', () => {
    expect(affectsNotes({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null })).toBe(true);
    expect(affectsNotes({ type: 'DELETE_ELEMENT', payload: 'h1' })).toBe(true);
    expect(affectsNotes({ type: 'ADD_ELEMENT', payload: comment('c1', 'h1', '') })).toBe(true);
  });

  it('counts undo and redo, which can bring a note back or take the last one away', () => {
    expect(affectsNotes({ type: 'UNDO' })).toBe(true);
    expect(affectsNotes({ type: 'REDO' })).toBe(true);
  });

  it('leaves every swipe, edit and history action alone', () => {
    expect(affectsNotes({ type: 'ADD_ELEMENT', payload: mark('h1') })).toBe(false);
    expect(affectsNotes({ type: 'UPDATE_ELEMENT', payload: { id: 'h1', changes: {} } })).toBe(false);
    expect(affectsNotes({ type: 'ADD_ACTION_HISTORY' } as never)).toBe(false);
  });
});
