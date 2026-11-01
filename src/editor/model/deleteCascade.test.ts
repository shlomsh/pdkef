import { describe, expect, it } from 'vitest';
import type { CommentElement, EditorElement, HighlightElement } from './editorModel.ts';
import { deletedWith } from './deleteCascade.ts';

const highlight: HighlightElement = {
  id: 'h-1', type: 'highlight', pageIndex: 2, left: 10, top: 20, width: 30, height: 4, color: '#FFF34D',
  bands: [{ left: 0, top: 0, width: 100, height: 100 }],
};
const other: HighlightElement = { ...highlight, id: 'h-2' };
const onHighlight = { id: 'c-1', type: 'comment', pageIndex: 2, text: 'note', anchor: { kind: 'element', elementId: 'h-1' } } as unknown as CommentElement;
const onOther = { ...onHighlight, id: 'c-2', anchor: { kind: 'element', elementId: 'h-2' } } as unknown as CommentElement;

describe('deletedWith', () => {
  it('matches the id and the comments anchored to it', () => {
    const all: EditorElement[] = [highlight, other, onHighlight, onOther];
    expect(all.filter(deletedWith('h-1'))).toEqual([highlight, onHighlight]);
  });
});
