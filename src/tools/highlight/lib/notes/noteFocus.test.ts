import { describe, expect, it } from 'vitest';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { noteStaysOpen } from './noteFocus.ts';

const mark = { id: 'm1', type: 'highlight' } as unknown as EditorElement;
const note = { id: 'c1', type: 'comment', anchor: { kind: 'element', elementId: 'm1' } } as unknown as EditorElement;
const freeNote = { id: 'c2', type: 'comment', anchor: { kind: 'page' } } as unknown as EditorElement;
const els = [mark, note, freeNote];
const nowhere = { cardId: null, elementId: null };

describe('noteStaysOpen', () => {
  it('has nothing to close when the active element is not a note', () => {
    expect(noteStaysOpen(els, 'm1', nowhere)).toBe(true);
    expect(noteStaysOpen(els, null, nowhere)).toBe(true);
  });
  it('stays open in its own card', () => expect(noteStaysOpen(els, 'c1', { cardId: 'c1', elementId: null })).toBe(true));
  it('stays open on its own mark', () => expect(noteStaysOpen(els, 'c1', { cardId: null, elementId: 'm1' })).toBe(true));
  it('stays open on the active element itself', () => expect(noteStaysOpen(els, 'c2', { cardId: null, elementId: 'c2' })).toBe(true));
  it('closes on another mark', () => expect(noteStaysOpen(els, 'c1', { cardId: null, elementId: 'm9' })).toBe(false));
  it('closes in another card', () => expect(noteStaysOpen(els, 'c1', { cardId: 'c9', elementId: null })).toBe(false));
  it('closes when focus lands nowhere', () => expect(noteStaysOpen(els, 'c1', nowhere)).toBe(false));
  it('a note not hung on an element has no mark to stay on', () => expect(noteStaysOpen(els, 'c2', { cardId: null, elementId: 'm1' })).toBe(false));
});
