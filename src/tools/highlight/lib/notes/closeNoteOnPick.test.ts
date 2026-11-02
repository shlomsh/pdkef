import { describe, expect, it } from 'vitest';
import type { CommentElement, EditorElement, HighlightElement } from '#editor/model/editorModel.ts';
import { closesNoteOnPick } from './closeNoteOnPick.ts';

const mark = (id: string): HighlightElement => ({ id, type: 'highlight', pageIndex: 0, left: 10, top: 20, width: 30, height: 4, color: '#FFF34D', bands: [] });
const note = (id: string, on: string): CommentElement => ({ id, type: 'comment', pageIndex: 0, left: 10, top: 20, width: 30, height: 4, comment: 'hi', anchor: { kind: 'element', elementId: on } });
const elements: EditorElement[] = [mark('m1'), mark('m2'), note('c1', 'm1')];

describe('closesNoteOnPick', () => {
  it('picking another mark closes the note that is open on the first one', () => {
    expect(closesNoteOnPick(elements, 'c1', 'm2')).toBe(true);
  });

  it('picking the mark the open note belongs to leaves it open', () => {
    expect(closesNoteOnPick(elements, 'c1', 'm1')).toBe(false);
  });

  it('closes nothing when no note is open, or the active element is not a note', () => {
    expect(closesNoteOnPick(elements, null, 'm2')).toBe(false);
    expect(closesNoteOnPick(elements, 'm1', 'm2')).toBe(false);
  });
});
