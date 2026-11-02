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

/** Set on a node only while focus is handed back to it, so a mark that opens on keyboard focus can tell the two apart. */
export const FOCUS_HANDED_BACK = 'data-focus-handed-back';

/** Hands focus back to a node (a note that closed, a field that unmounted) without it reading as the person's own move. */
export function handFocusBack(node: HTMLElement): void {
  node.setAttribute(FOCUS_HANDED_BACK, '');
  try { node.focus(); } finally { node.removeAttribute(FOCUS_HANDED_BACK); }
}
