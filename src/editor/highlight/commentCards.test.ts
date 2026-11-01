import { describe, it, expect } from 'vitest';
import { commentCards, commentCount, hasCommentCards, stackCards } from './commentCards.ts';
import type { CommentElement, EditorElement, HighlightElement } from '../model/editorModel.ts';

const passage = (over: Partial<CommentElement>): CommentElement => ({
  id: 'p', type: 'comment', pageIndex: 0, left: 10, top: 20, width: 50, height: 10, comment: 'note',
  anchor: { kind: 'passage', bands: [{ left: 0, top: 0, width: 100, height: 50 }, { left: 0, top: 50, width: 40, height: 50 }] }, ...over,
});
const pin = (over: Partial<CommentElement>): CommentElement => ({
  id: 'pin', type: 'comment', pageIndex: 0, left: 30, top: 40, width: 2, height: 2, comment: 'note', anchor: { kind: 'point' }, ...over,
});
const highlight = (over: Partial<HighlightElement> = {}): HighlightElement => ({
  id: 'h', type: 'highlight', pageIndex: 0, left: 5, top: 70, width: 20, height: 4, color: '#FFF34D', bands: [], ...over,
});

describe('commentCards', () => {
  it('lists comments on the page in reading order, plus the active one just opened', () => {
    const elements: EditorElement[] = [
      passage({ id: 'low', top: 60 }),
      passage({ id: 'high', top: 5 }),
      passage({ id: 'blank', top: 30, comment: '  ' }),
      highlight({ id: 'none', top: 40 }),
      passage({ id: 'other', pageIndex: 1 }),
      pin({ id: 'opened', top: 50, comment: '' }),
    ];
    expect(commentCards(elements, 0, null).map((c) => c.id)).toEqual(['high', 'low']);
    const cards = commentCards(elements, 0, 'opened');
    expect(cards.map((c) => c.id)).toEqual(['high', 'opened', 'low']);
    expect(cards[1].isNew).toBe(true);
    expect(cards[0].isNew).toBe(false);
    expect(cards[0].firstBand).toEqual({ left: 10, top: 5, width: 50, height: 5 });
  });
  it('takes the direction from a passage anchor, the box for a pin, and the target for an element comment', () => {
    const rtl = passage({ id: 'r', anchor: { kind: 'passage', bands: [{ left: 0, top: 0, width: 100, height: 100 }], direction: 'rtl' } });
    const onHighlight = pin({ id: 'e', top: 0, left: 0, anchor: { kind: 'element', elementId: 'h' } });
    const cards = commentCards([rtl, pin({ id: 'pin' }), highlight(), onHighlight], 0, null);
    expect(cards.find((c) => c.id === 'r')!.direction).toBe('rtl');
    expect(cards.find((c) => c.id === 'pin')!.direction).toBe('ltr');
    expect(cards.find((c) => c.id === 'pin')!.firstBand).toEqual({ left: 30, top: 40, width: 2, height: 2 });
    expect(cards.find((c) => c.id === 'e')!.firstBand).toEqual({ left: 5, top: 70, width: 20, height: 4 });
  });
  it('drops an element comment whose target is gone', () => {
    expect(commentCards([pin({ anchor: { kind: 'element', elementId: 'gone' } })], 0, null)).toEqual([]);
  });
  it('counts only non-blank comments on the page', () => {
    expect(commentCount([pin({}), pin({ id: 'b', comment: ' ' }), pin({ id: 'c', pageIndex: 2 })], 0)).toBe(1);
  });
});

describe('stackCards', () => {
  it('keeps the wanted top when there is room and pushes an overlapping card down', () => {
    const tops = stackCards([{ id: 'a', want: 100, height: 80 }, { id: 'b', want: 120, height: 40 }, { id: 'c', want: 400, height: 10 }], 8);
    expect([...tops.entries()]).toEqual([['a', 100], ['b', 188], ['c', 400]]);
  });
});
describe('hasCommentCards', () => {
  it('is false for highlights alone and blank comments, so highlighting never opens the rail', () => {
    expect(hasCommentCards([highlight(), pin({ comment: '  ' })], null)).toBe(false);
  });
  it('is true once any page has a comment, or the active comment was just opened', () => {
    expect(hasCommentCards([highlight(), pin({ pageIndex: 3, comment: 'Why?' })], null)).toBe(true);
    expect(hasCommentCards([pin({ comment: '' })], 'pin')).toBe(true);
  });
  it('is false for the active comment while it is still being placed (empty box), so the rail never reflows under a swipe', () => {
    const placing = pin({ comment: '', left: 0, top: 0, width: 0, height: 0 });
    expect(hasCommentCards([placing], 'pin')).toBe(false);
    expect(commentCards([placing], 0, 'pin')).toEqual([]);
  });
  it('is true for the same empty comment once the gesture gives it a box', () => {
    const placed = pin({ comment: '', left: 0, top: 0, width: 3, height: 3 });
    expect(hasCommentCards([placed], 'pin')).toBe(true);
    expect(commentCards([placed], 0, 'pin')).toHaveLength(1);
  });
});
