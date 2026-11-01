import { describe, expect, it } from 'vitest';
import type { CommentElement, EditorElement, HighlightElement } from '#editor/model/editorModel.ts';
import { printNotes } from './printNotes.ts';

const pages = [{ width: 600, height: 800 }, { width: 500, height: 700 }];
const band = { left: 0, top: 0, width: 100, height: 100 };
const highlight = (id: string, pageIndex: number, top: number): HighlightElement =>
  ({ id, type: 'highlight', pageIndex, color: '#fde047', left: 10, top, width: 50, height: 5, bands: [band] });
const comment = (id: string, pageIndex: number, anchor: CommentElement['anchor']): CommentElement =>
  ({ id, type: 'comment', pageIndex, left: 0, top: 0, width: 0, height: 0, comment: `note ${id}`, anchor });
const onElement = (elementId: string) => ({ kind: 'element' as const, elementId });

describe('printNotes', () => {
  it('turns a highlight comment into a note at the highlight top, in points', () => {
    const els: EditorElement[] = [highlight('h', 0, 25), comment('c', 0, onElement('h'))];
    expect(printNotes(els, pages)).toEqual([{ id: 'c', page: 0, anchorTop: 200 }]);
  });

  it('drops a comment whose highlight is gone', () => {
    expect(printNotes([comment('c', 0, onElement('gone'))], pages)).toEqual([]);
  });

  it('drops a comment anchored to something other than a highlight', () => {
    const text = { id: 't', type: 'text', pageIndex: 0, left: 1, top: 1, text: 'x' } as unknown as EditorElement;
    const els: EditorElement[] = [
      text,
      comment('on-text', 0, onElement('t')),
      comment('passage', 0, { kind: 'passage', bands: [band] }),
      comment('point', 0, { kind: 'point' }),
    ];
    expect(printNotes(els, pages)).toEqual([]);
  });

  it('orders by page, then by anchor top', () => {
    const els: EditorElement[] = [
      highlight('h1', 1, 10), highlight('h2', 0, 50), highlight('h3', 0, 20),
      comment('c1', 1, onElement('h1')), comment('c2', 0, onElement('h2')), comment('c3', 0, onElement('h3')),
    ];
    expect(printNotes(els, pages).map((n) => [n.id, n.page, n.anchorTop])).toEqual([['c3', 0, 160], ['c2', 0, 400], ['c1', 1, 70]]);
  });
});
