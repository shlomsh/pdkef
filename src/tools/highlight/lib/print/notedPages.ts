import type { EditorElement } from '#editor/model/editorModel.ts';

/** The 0-based pages that carry at least one note printed beside them (a comment anchored to a highlight on that page). */
export function notedPages(elements: EditorElement[]): Set<number> {
  const pageOf = new Map(elements.flatMap((el) => (el.type === 'highlight' ? [[el.id, el.pageIndex] as const] : [])));
  return new Set(elements.flatMap((el) => {
    if (el.type !== 'comment' || el.anchor.kind !== 'element') return [];
    const page = pageOf.get(el.anchor.elementId);
    return page === undefined ? [] : [page];
  }));
}
