import type { EditorElement } from '#editor/model/editorModel.ts';
import { isComment } from '#editor/comments/anchors.ts';

const byId = (id: string) => document.querySelector<HTMLElement>(`[data-editor-element-id="${CSS.escape(id)}"]`);

/** The node a comment is anchored to: its target for an element comment, else the comment's own node. */
export function anchorNode(elements: readonly EditorElement[], commentId: string): HTMLElement | null {
  const comment = elements.find((el) => el.id === commentId);
  if (!comment || !isComment(comment)) return null;
  return byId(comment.anchor.kind === 'element' ? comment.anchor.elementId : commentId);
}

/** Sets or clears a marker attribute (`data-comment-hover`, `data-comment-focus`) on a comment's anchored node. */
export function markAnchor(elements: readonly EditorElement[], commentId: string, attribute: string, on: boolean): void {
  const node = anchorNode(elements, commentId);
  if (on) node?.setAttribute(attribute, '');
  else node?.removeAttribute(attribute);
}
