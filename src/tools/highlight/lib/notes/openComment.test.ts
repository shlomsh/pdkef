import { describe, expect, it } from 'vitest';
import type { CommentElement, HighlightElement } from '#editor/model/editorModel.ts';
import { openCommentFor } from './openComment.ts';

const mark: HighlightElement = {
  id: 'h1', type: 'highlight', pageIndex: 0, left: 10, top: 20, width: 30, height: 4,
  color: '#FFF34D', bands: [{ left: 0, top: 0, width: 100, height: 100 }],
};
const saved: CommentElement = {
  id: 'c1', type: 'comment', pageIndex: 0, left: 10, top: 20, width: 30, height: 4,
  comment: 'Check this', anchor: { kind: 'element', elementId: 'h1' },
};

describe('openCommentFor', () => {
  it('a mark with no comment gets a blank one anchored to it, and that comment becomes active', () => {
    const { add, activeId } = openCommentFor([mark], mark, 'c9');
    expect(add).toMatchObject({ id: 'c9', type: 'comment', comment: '', anchor: { kind: 'element', elementId: 'h1' }, pageIndex: 0 });
    expect(activeId).toBe('c9');
  });

  it('a mark that has a comment adds nothing and makes that comment active', () => {
    const { add, activeId } = openCommentFor([mark, saved], mark, 'c9');
    expect(add).toBeNull();
    expect(activeId).toBe('c1');
  });

  it("only the mark asked about counts: another mark's comment does not open", () => {
    const other: HighlightElement = { ...mark, id: 'h2' };
    const { add, activeId } = openCommentFor([mark, other, saved], other, 'c9');
    expect(add?.anchor).toEqual({ kind: 'element', elementId: 'h2' });
    expect(activeId).toBe('c9');
  });
});
