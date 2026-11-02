import type { EditorElement } from '#editor/model/editorModel.ts';
import { commentCards } from '#editor/highlight/commentCards.ts';
import { commentsAnchoredTo, isComment, resolveCommentBoxes } from '#editor/comments/anchors.ts';

/** One note in the phone's bottom pane: the comment, the mark it hangs on and that mark's color. @testSeam only the test reads the type by name. */
export interface PaneNote { id: string; markId: string | null; pageIndex: number; comment: string; isNew: boolean; color: string | null }

/** Every note card in the document in reading order: page by page, each page top to left. */
export function paneNotes(elements: readonly EditorElement[], activeId: string | null): PaneNote[] {
  const byId = new Map(elements.map((el) => [el.id, el]));
  const pages = [...new Set(resolveCommentBoxes(elements).filter(isComment).map((el) => el.pageIndex))].sort((a, b) => a - b);
  return pages.flatMap((pageIndex) => commentCards(elements, pageIndex, activeId).map((card): PaneNote => {
    const el = byId.get(card.id);
    const markId = el && isComment(el) && el.anchor.kind === 'element' ? el.anchor.elementId : null;
    const mark = markId ? byId.get(markId) : undefined;
    return { id: card.id, markId, pageIndex, comment: card.comment, isNew: card.isNew, color: mark?.type === 'highlight' ? mark.color : null };
  }));
}

/** Where the active note sits in the pane's notes, -1 when it is not one of them. */
export function paneIndex(notes: readonly PaneNote[], activeId: string | null): number {
  return notes.findIndex((n) => n.id === activeId);
}

/** The card a sideways scroll rests on; abs because an RTL scroller reports a negative scrollLeft. */
export function snapIndex(scrollStart: number, step: number, count: number): number {
  if (step <= 0 || count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(Math.abs(scrollStart) / step)));
}

/** What the active element becomes when a highlight is tapped on touch: its own note opens, any other open note closes. */
export function activeAfterPick(elements: readonly EditorElement[], activeId: string | null, pickedId: string): string | null {
  const open = activeId ? elements.find((el) => el.id === activeId) : undefined;
  const openIsNote = !!open && isComment(open);
  if (openIsNote && open.anchor.kind === 'element' && open.anchor.elementId === pickedId) return activeId;
  const withText = commentsAnchoredTo(elements, pickedId).find((c) => c.comment.trim() !== '');
  if (withText) return withText.id;
  return openIsNote ? null : activeId;
}
