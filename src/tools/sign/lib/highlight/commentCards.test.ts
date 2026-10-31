import { describe, it, expect } from 'vitest';
import { commentCards, commentCount, hasCommentCards, stackCards, passageEnd } from './commentCards.ts';
import type { EditorElement, HighlightElement } from '#editor/model/editorModel.ts';

const hl = (over: Partial<HighlightElement>): HighlightElement => ({
  id: 'h', type: 'highlight', pageIndex: 0, left: 10, top: 20, width: 50, height: 10, color: '#FFF34D',
  bands: [{ left: 0, top: 0, width: 100, height: 50 }, { left: 0, top: 50, width: 40, height: 50 }], ...over,
});

describe('commentCards', () => {
  it('lists commented highlights on the page in reading order, plus the active one just opened', () => {
    const elements: EditorElement[] = [
      hl({ id: 'low', top: 60, comment: 'b' }),
      hl({ id: 'high', top: 5, comment: 'a' }),
      hl({ id: 'blank', top: 30, comment: '  ' }),
      hl({ id: 'none', top: 40 }),
      hl({ id: 'other', pageIndex: 1, comment: 'x' }),
      hl({ id: 'opened', top: 50, comment: '' }),
    ];
    expect(commentCards(elements, 0, null).map((c) => c.id)).toEqual(['high', 'low']);
    const cards = commentCards(elements, 0, 'opened');
    expect(cards.map((c) => c.id)).toEqual(['high', 'opened', 'low']);
    expect(cards[1].isNew).toBe(true);
    expect(cards[0].isNew).toBe(false);
    expect(cards[0].firstBand).toEqual({ left: 10, top: 5, width: 50, height: 5 });
  });
  it('counts only non-blank comments on the page', () => {
    expect(commentCount([hl({ comment: 'a' }), hl({ comment: ' ' }), hl({ comment: 'b', pageIndex: 2 })], 0)).toBe(1);
  });
});

describe('stackCards', () => {
  it('keeps the wanted top when there is room and pushes an overlapping card down', () => {
    const tops = stackCards([{ id: 'a', want: 100, height: 80 }, { id: 'b', want: 120, height: 40 }, { id: 'c', want: 400, height: 10 }], 8);
    expect([...tops.entries()]).toEqual([['a', 100], ['b', 188], ['c', 400]]);
  });
});

describe('passageEnd', () => {
  it('is the right end of the last band for LTR and its left end for RTL', () => {
    expect(passageEnd(hl({}))).toEqual({ x: 30, y: 27.5 });
    expect(passageEnd(hl({ direction: 'rtl' }))).toEqual({ x: 10, y: 27.5 });
  });
});

describe('hasCommentCards', () => {
  it('is false for highlights without comments, so highlighting alone never opens the rail', () => {
    expect(hasCommentCards([hl({}), hl({ id: 'b', comment: '  ' })], null)).toBe(false);
  });
  it('is true once any page has a comment, or the active highlight just opened one', () => {
    expect(hasCommentCards([hl({}), hl({ id: 'b', pageIndex: 3, comment: 'Why?' })], null)).toBe(true);
    expect(hasCommentCards([hl({ comment: '' })], 'h')).toBe(true);
  });
});
