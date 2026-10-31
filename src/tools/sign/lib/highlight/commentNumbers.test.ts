import { describe, expect, it } from 'vitest';
import { commentNumbers } from './commentNumbers.ts';
import type { EditorElement, HighlightElement } from '#editor/model/editorModel.ts';

const highlight = (id: string, pageIndex: number, top: number, left: number, comment?: string, bandTop = 0): HighlightElement => ({
  id, type: 'highlight', pageIndex, left, top, width: 20, height: 10, color: '#FFF34D',
  bands: [{ left: 0, top: bandTop, width: 100, height: 50 }], ...(comment === undefined ? {} : { comment }),
});

describe('commentNumbers', () => {
  it('numbers commented highlights in reading order: page, then from the top of the first band', () => {
    const elements: EditorElement[] = [
      highlight('c', 1, 5, 10, 'third'),
      highlight('b', 0, 40, 10, 'second'),
      highlight('a', 0, 10, 50, 'first'),
    ];
    expect([...commentNumbers(elements)]).toEqual([['a', 1], ['b', 2], ['c', 3]]);
  });

  it('uses the first band, not the box top, so a passage starting lower in its box sorts by where it starts', () => {
    const elements = [highlight('late', 0, 10, 0, 'x', 80), highlight('early', 0, 15, 0, 'y')];
    expect(commentNumbers(elements).get('early')).toBe(1);
    expect(commentNumbers(elements).get('late')).toBe(2);
  });

  it('skips highlights without a comment, a blank comment, and other element types', () => {
    const elements: EditorElement[] = [
      highlight('none', 0, 1, 0),
      highlight('blank', 0, 2, 0, '  \n '),
      { id: 't', type: 'text', pageIndex: 0, left: 0, top: 0, text: 'hello' } as EditorElement,
      highlight('kept', 0, 3, 0, 'note'),
    ];
    expect([...commentNumbers(elements)]).toEqual([['kept', 1]]);
  });
});
