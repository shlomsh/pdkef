import type { CommentElement, EditorElement } from '#editor/model/editorModel.ts';
import { commentsAnchoredTo } from '#editor/comments/anchors.ts';
import { newElementComment } from '#editor/comments/newComment.ts';

/**
 * What pressing Comment on a highlight does (R27): a mark with no comment gets a blank one anchored to it, a
 * mark that has one opens that one. Either way the comment named by `activeId` becomes the active element, so
 * its card opens. `newId` is only used when a blank comment is needed.
 */
export function openCommentFor(
  elements: readonly EditorElement[],
  mark: EditorElement,
  newId: string,
): { add: CommentElement | null; activeId: string } {
  const existing = commentsAnchoredTo(elements, mark.id)[0];
  if (existing) return { add: null, activeId: existing.id };
  return { add: newElementComment(mark, newId), activeId: newId };
}
