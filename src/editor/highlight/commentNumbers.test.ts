import { describe, expect, it } from 'vitest';
import { commentNumbers } from './commentNumbers.ts';
import type { CommentAnchor, CommentElement, EditorElement, HighlightElement } from '../model/editorModel.ts';

const comment = (id: string, pageIndex: number, top: number, left: number, text: string, anchor: CommentAnchor = { kind: 'point' }): CommentElement => ({
  id, type: 'comment', pageIndex, left, top, width: 2, height: 2, comment: text, anchor,
});
const highlight = (id: string, pageIndex: number, top: number, left: number): HighlightElement => ({
  id, type: 'highlight', pageIndex, left, top, width: 20, height: 10, color: '#FFF34D', bands: [],
});

describe('commentNumbers', () => {
  it('numbers comment ids in reading order: page, then box top, then box left', () => {
    const elements: EditorElement[] = [
      comment('c', 1, 5, 10, 'third'),
      comment('b2', 0, 40, 30, 'fourth-ish'),
      comment('b', 0, 40, 10, 'second'),
      comment('a', 0, 10, 50, 'first'),
    ];
    expect([...commentNumbers(elements)]).toEqual([['a', 1], ['b', 2], ['b2', 3], ['c', 4]]);
  });

  it('places an element comment at its target, and drops one whose target is gone', () => {
    const elements: EditorElement[] = [
      highlight('h', 0, 70, 0),
      comment('on-h', 0, 0, 0, 'x', { kind: 'element', elementId: 'h' }),
      comment('pin', 0, 30, 0, 'y'),
      comment('lost', 0, 1, 0, 'z', { kind: 'element', elementId: 'gone' }),
    ];
    expect([...commentNumbers(elements)]).toEqual([['pin', 1], ['on-h', 2]]);
  });

  it('skips blank comments and other element types', () => {
    const elements: EditorElement[] = [
      comment('blank', 0, 2, 0, '  \n '),
      comment('new', 0, 2, 0, ''),
      highlight('h', 0, 1, 0),
      comment('kept', 0, 3, 0, 'note'),
    ];
    expect([...commentNumbers(elements)]).toEqual([['kept', 1]]);
  });
});
