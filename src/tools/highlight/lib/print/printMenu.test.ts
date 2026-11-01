import { describe, expect, it } from 'vitest';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { hasComments, printMenuItems } from './printMenu.ts';

const labels = { printPlain: 'Print', printWithNotes: 'Print with my notes' };

const highlight = { id: 'h1', type: 'highlight', pageIndex: 0, left: 10, top: 10, width: 20, height: 5, bands: [], color: '#FFF34D' } as unknown as EditorElement;
const comment = { id: 'c1', type: 'comment', pageIndex: 0, left: 10, top: 10, width: 5, height: 5, comment: 'Look again', anchor: { kind: 'element', elementId: 'h1' } } as unknown as EditorElement;

describe('hasComments', () => {
  it('is false for a document with highlights only', () => {
    expect(hasComments([highlight])).toBe(false);
    expect(hasComments([])).toBe(false);
  });

  it('is true once the document has a comment', () => {
    expect(hasComments([highlight, comment])).toBe(true);
  });
});

describe('printMenuItems', () => {
  it('offers Print alone when there are no comments', () => {
    expect(printMenuItems(false, labels)).toEqual([{ id: 'plain', label: 'Print', withNotes: false }]);
  });

  it('adds Print with my notes when the document has a comment', () => {
    expect(printMenuItems(true, labels)).toEqual([
      { id: 'plain', label: 'Print', withNotes: false },
      { id: 'notes', label: 'Print with my notes', withNotes: true },
    ]);
  });
});
