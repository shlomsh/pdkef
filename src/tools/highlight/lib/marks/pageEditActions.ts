import type { PageGeometry } from '#editor/geometry/coords.ts';
import { captureElementSnapshots, createActionEntry } from '#editor/model/actionHistory.ts';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { englishSignMessages as t } from '#editor/registry/signMessages.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import type { HighlightAction } from './highlightState.ts';

/** One undo step: the page turns a quarter clockwise. `geometry` is the page as displayed before the turn. */
export function rotatePageAction(pageIndex: number, geometry: PageGeometry): HighlightAction {
  return {
    type: 'ROTATE_PAGE',
    payload: { pageIndex, geometry, description: formatMessage(t.rotatePageDescription, { number: pageIndex + 1 }) },
  };
}

/** One undo step: the page's marks go, and the comments anchored to them with them. Empty when the page has none. */
export function clearPageActions(elements: readonly EditorElement[], pageIndex: number): HighlightAction[] {
  const removed = elements.filter((el) => el.pageIndex === pageIndex);
  if (removed.length === 0) return [];
  const snapshots = captureElementSnapshots(elements, (el) => el.pageIndex === pageIndex);
  const description = formatMessage(
    removed.length === 1 ? t.clearedPageDescriptionOne : t.clearedPageDescriptionOther,
    { count: removed.length, page: pageIndex + 1 },
  );
  return [
    { type: 'CLEAR_PAGE', payload: pageIndex },
    {
      type: 'ADD_ACTION_HISTORY',
      payload: createActionEntry({ operation: 'delete', type: 'CLEAR_PAGE', pageIndex, description, elements: snapshots }),
    },
  ];
}
