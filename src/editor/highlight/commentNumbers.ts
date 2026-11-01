// SIGN-44: a comment's number, shared by the badge on screen and the exported PDF.
import type { CommentElement, EditorElement } from '../model/editorModel.ts';
import { isComment, resolveCommentBoxes } from '../comments/anchors.ts';

/** True when the comment has something written in it (a new, empty card has no number yet). */
export function hasComment(element: EditorElement): element is CommentElement {
  return isComment(element) && !!element.comment.trim();
}

/** Comments numbered 1..n in reading order: page, then box top, then box left (after element boxes are resolved). */
export function commentNumbers(elements: readonly EditorElement[]): ReadonlyMap<string, number> {
  const ordered = resolveCommentBoxes(elements).filter(hasComment).sort((a, b) =>
    a.pageIndex - b.pageIndex || a.top - b.top || a.left - b.left);
  return new Map(ordered.map((element, i) => [element.id, i + 1]));
}
