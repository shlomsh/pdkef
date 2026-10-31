import { describe, expect, it } from 'vitest';
import type { CommentElement, EditorElement, HighlightElement, TextElement } from '#editor/model/editorModel.ts';
import { commentMarkers, commentsAnchoredTo, deletedWith, isComment, resolveCommentBoxes } from './anchors.ts';

const highlight: HighlightElement = {
  id: 'h-1', type: 'highlight', pageIndex: 2, left: 10, top: 20, width: 30, height: 4, color: '#FFF34D',
  bands: [{ left: 0, top: 0, width: 100, height: 100 }],
};
const text: TextElement = { id: 't-1', type: 'text', pageIndex: 0, left: 5, top: 6, text: 'x' };
const onHighlight: CommentElement = {
  id: 'c-1', type: 'comment', pageIndex: 0, left: 0, top: 0, width: 1, height: 1, comment: 'a',
  anchor: { kind: 'element', elementId: 'h-1' },
};
const pin: CommentElement = {
  id: 'c-2', type: 'comment', pageIndex: 1, left: 50, top: 60, width: 2, height: 2, comment: 'b', anchor: { kind: 'point' },
};

describe('comment anchors', () => {
  it('tells a comment from other elements', () => {
    expect(isComment(pin)).toBe(true);
    expect(isComment(highlight)).toBe(false);
  });

  it('finds the comments anchored to an element id', () => {
    const all: EditorElement[] = [highlight, text, onHighlight, pin];
    expect(commentsAnchoredTo(all, 'h-1')).toEqual([onHighlight]);
    expect(commentsAnchoredTo(all, 't-1')).toEqual([]);
  });

  it('deletedWith matches the id and the comments anchored to it', () => {
    const matches = deletedWith('h-1');
    expect([highlight, text, onHighlight, pin].filter(matches)).toEqual([highlight, onHighlight]);
  });

  it('gives an element comment its target box and page', () => {
    const resolved = resolveCommentBoxes([highlight, onHighlight, pin]);
    expect(resolved[1]).toMatchObject({ id: 'c-1', pageIndex: 2, left: 10, top: 20, width: 30, height: 4 });
    expect(resolved[2]).toBe(pin);
  });

  it('drops a comment whose target is gone', () => {
    expect(resolveCommentBoxes([text, onHighlight, pin])).toEqual([text, pin]);
  });

  it('resolves a comment on a line from its endpoints', () => {
    const line: EditorElement = { id: 'l-1', type: 'line', pageIndex: 0, x1: 10, y1: 50, x2: 30, y2: 20 };
    const c: CommentElement = { ...onHighlight, anchor: { kind: 'element', elementId: 'l-1' } };
    expect(resolveCommentBoxes([line, c])[1]).toMatchObject({ left: 10, top: 20, width: 20, height: 30 });
  });
});

describe('commentMarkers', () => {
  const twoLines = [{ left: 0, top: 0, width: 100, height: 40 }, { left: 30, top: 60, width: 70, height: 40 }];
  const passage = (direction?: 'rtl'): CommentElement => ({
    ...pin, id: 'p', anchor: { kind: 'passage', bands: twoLines, ...(direction ? { direction } : {}) },
  });

  it('puts a passage marker at the end of its last line in reading order', () => {
    expect(commentMarkers([passage()]).get('p')).toEqual({ left: 100, top: 80, direction: 'ltr' });
    expect(commentMarkers([passage('rtl')]).get('p')).toEqual({ left: 30, top: 80, direction: 'rtl' });
  });

  it('puts a comment on a highlight at the highlight passage end, in its direction', () => {
    const rtl: HighlightElement = { ...highlight, bands: twoLines, direction: 'rtl' };
    expect(commentMarkers([rtl, onHighlight]).get('c-1')).toEqual({ left: 30, top: 80, direction: 'rtl' });
  });

  it('puts a comment on any other element at its top right corner', () => {
    const onText: CommentElement = { ...onHighlight, anchor: { kind: 'element', elementId: 't-1' } };
    expect(commentMarkers([text, onText]).get('c-1')).toEqual({ left: 100, top: 0, direction: 'ltr' });
  });

  it('gives a pin no marker: the pin is its own', () => {
    expect(commentMarkers([pin]).has('c-2')).toBe(false);
  });
});
