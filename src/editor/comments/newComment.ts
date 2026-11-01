import type { CommentElement, EditorElement } from '../model/editorModel.ts';
import { resolveCommentBoxes } from './anchors.ts';

/** A blank comment anchored to `target`; its box is the target's, the same snapshot rendering would resolve. */
export function newElementComment(target: EditorElement, id: string): CommentElement {
  const comment: CommentElement = {
    id, type: 'comment', pageIndex: target.pageIndex, left: 0, top: 0, width: 0, height: 0,
    comment: '', anchor: { kind: 'element', elementId: target.id },
  };
  return resolveCommentBoxes([target, comment])[1] as CommentElement;
}
