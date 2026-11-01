import { describe, expect, it } from 'vitest';
import type { CommentElement, EditorElement, HighlightElement } from '#editor/model/editorModel.ts';
import { notedPages } from './notedPages.ts';

const band = { left: 0, top: 0, width: 100, height: 100 };
const highlight = (id: string, pageIndex: number): HighlightElement =>
  ({ id, type: 'highlight', pageIndex, color: '#fde047', left: 10, top: 10, width: 50, height: 5, bands: [band] });
const comment = (id: string, anchor: CommentElement['anchor']): CommentElement =>
  ({ id, type: 'comment', pageIndex: 0, left: 0, top: 0, width: 0, height: 0, comment: `note ${id}`, anchor });
const onElement = (elementId: string) => ({ kind: 'element' as const, elementId });

describe('notedPages', () => {
  it('is the pages of the highlights that carry a comment, once each', () => {
    const els: EditorElement[] = [highlight('a', 1), highlight('b', 1), highlight('c', 3), highlight('d', 0),
      comment('x', onElement('a')), comment('y', onElement('b')), comment('z', onElement('c'))];
    expect([...notedPages(els)].sort()).toEqual([1, 3]);
  });

  it('leaves out a comment whose highlight is gone', () => {
    expect(notedPages([comment('x', onElement('gone'))]).size).toBe(0);
  });
});
