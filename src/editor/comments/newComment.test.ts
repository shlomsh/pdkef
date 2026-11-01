import { describe, expect, it } from 'vitest';
import type { EditorElement } from '../model/editorModel.ts';
import { newElementComment } from './newComment.ts';

describe('newElementComment', () => {
  it('anchors a blank comment to the target, on its page, with its box', () => {
    const target = { id: 'r1', type: 'rectangle', pageIndex: 2, left: 10, top: 20, width: 30, height: 5 } as EditorElement;
    expect(newElementComment(target, 'c1')).toEqual({
      id: 'c1', type: 'comment', pageIndex: 2, left: 10, top: 20, width: 30, height: 5, comment: '',
      anchor: { kind: 'element', elementId: 'r1' },
    });
  });
  it('takes a line target\'s endpoint box', () => {
    const target = { id: 'l1', type: 'line', pageIndex: 0, x1: 50, y1: 10, x2: 20, y2: 40 } as EditorElement;
    expect(newElementComment(target, 'c1')).toMatchObject({ left: 20, top: 10, width: 30, height: 30 });
  });
});
