import type { EditorElement } from '#editor/model/editorModel.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import { isComment } from '#editor/comments/anchors.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';

const QUOTE_MAX = 80;

/** The element a comment hangs on, when it hangs on one. */
export function commentTarget(elements: readonly EditorElement[], commentId: string): EditorElement | undefined {
  const comment = elements.find((el) => el.id === commentId);
  if (!comment || !isComment(comment) || comment.anchor.kind !== 'element') return undefined;
  const { elementId } = comment.anchor;
  return elements.find((el) => el.id === elementId);
}

/** A card's accessible name: "Comment on page N", plus the anchored element's text in quotes when it carries one. */
export function commentCardLabel(elements: readonly EditorElement[], commentId: string, pageIndex: number, messages: SignMessages): string {
  const base = formatMessage(messages.commentOnPage, { number: pageIndex + 1 });
  const target = commentTarget(elements, commentId);
  const text = target && 'text' in target && typeof target.text === 'string' ? target.text.replace(/\s+/g, ' ').trim() : '';
  if (!text) return base;
  return `${base}, "${text.length > QUOTE_MAX ? `${text.slice(0, QUOTE_MAX)}...` : text}"`;
}
