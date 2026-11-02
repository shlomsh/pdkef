import type { EditorElement } from '#editor/model/editorModel.ts';
import { isComment } from '#editor/comments/anchors.ts';

/**
 * Whether the open note stays open when focus lands on `next` (the card and the element that hold it, null for neither): it stays
 * while focus is in its card or on the mark it hangs on, and a non-note active element has nothing to close.
 */
export function noteStaysOpen(
  elements: readonly EditorElement[],
  activeId: string | null,
  next: { cardId: string | null; elementId: string | null },
): boolean {
  const active = activeId ? elements.find((el) => el.id === activeId) : undefined;
  if (!active || !isComment(active)) return true;
  if (next.cardId === activeId || next.elementId === activeId) return true;
  return active.anchor.kind === 'element' && next.elementId === active.anchor.elementId;
}
