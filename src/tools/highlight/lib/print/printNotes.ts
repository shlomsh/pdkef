// READ-06: the comments a notes print puts beside their pages. Pure; the card heights are measured later.
import { isComment } from '#editor/comments/anchors.ts';
import type { EditorElement } from '#editor/model/editorModel.ts';
import type { PrintNote } from './printPlan.ts';

/**
 * One note per comment anchored to a highlight that still exists, on the highlight's page, at the
 * highlight's top in PDF points. Comments on a passage, a point or another element are not printed.
 * Ordered by page, then by anchor top.
 */
export function printNotes(
  elements: EditorElement[],
  pages: { width: number; height: number }[],
): Omit<PrintNote, 'height'>[] {
  const highlights = new Map(elements.flatMap((el) => (el.type === 'highlight' ? [[el.id, el] as const] : [])));
  const notes: Omit<PrintNote, 'height'>[] = [];
  for (const el of elements) {
    if (!isComment(el) || el.anchor.kind !== 'element') continue;
    const target = highlights.get(el.anchor.elementId);
    const page = target && pages[target.pageIndex];
    if (!target || !page) continue;
    notes.push({ id: el.id, page: target.pageIndex, anchorTop: (target.top / 100) * page.height });
  }
  return notes.sort((a, b) => a.page - b.page || a.anchorTop - b.anchorTop);
}
