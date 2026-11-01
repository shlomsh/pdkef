import { useReducer } from 'preact/hooks';
import type { PageGeometry } from '#editor/geometry/coords.ts';
import { createActionEntry, captureElementSnapshots, type HistoryLogger } from '#editor/model/actionHistory.ts';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { englishSignMessages as t } from '#editor/registry/signMessages.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { highlightReducer, initialHighlightState, type HighlightAction } from '../lib/marks/highlightState.ts';
import { useMarker } from './useMarker.ts';

type Dispatch = (action: HighlightAction) => void;

/**
 * The marks on the open document: the shared elements state with its page turns, a logger for undo steps, and
 * the marker. `route` lets the caller send the page edits through its own dispatch (the notes room's), which
 * may be created after this hook; without it they go straight to the reducer.
 */
export function useHighlightMarks({ route }: { route?: { current: Dispatch | null } } = {}) {
  const [state, dispatch] = useReducer<typeof initialHighlightState, HighlightAction>(highlightReducer, initialHighlightState);
  const { marker, rearm } = useMarker();

  const logAction: HistoryLogger<EditorElement> = (operation, type, pageIndex, description, snapshots) => {
    dispatch({
      type: 'ADD_ACTION_HISTORY',
      payload: createActionEntry({ operation, type, pageIndex, description, elements: snapshots }),
    });
  };

  const canUndo = state.actionHistory.length > 0;
  const canRedo = state.redoHistory.length > 0;
  const undo = () => {
    if (!canUndo) return;
    dispatch({ type: 'UNDO' });
    recordAction('undo');
  };
  const redo = () => {
    if (!canRedo) return;
    dispatch({ type: 'REDO' });
    recordAction('redo');
  };

  const send: Dispatch = (action) => (route?.current ?? dispatch)(action);
  /** One undo step: the page turns a quarter clockwise. `geometry` is the page as displayed before the turn. */
  const rotatePage = (pageIndex: number, geometry: PageGeometry) => {
    send({
      type: 'ROTATE_PAGE',
      payload: { pageIndex, geometry, description: formatMessage(t.rotatePageDescription, { number: pageIndex + 1 }) },
    });
    recordAction('rotate');
  };
  /** One undo step: the page's marks go, and the comments anchored to them with them. */
  const clearPage = (pageIndex: number) => {
    const removed = state.elements.filter((el) => el.pageIndex === pageIndex);
    if (removed.length === 0) return;
    const snapshots = captureElementSnapshots(state.elements, (el) => el.pageIndex === pageIndex);
    send({ type: 'CLEAR_PAGE', payload: pageIndex });
    logAction(
      'delete', 'CLEAR_PAGE', pageIndex,
      formatMessage(removed.length === 1 ? t.clearedPageDescriptionOne : t.clearedPageDescriptionOther, { count: removed.length, page: pageIndex + 1 }),
      snapshots,
    );
    recordAction('delete_mark');
  };

  return { state, pageTurns: state.pageTurns, dispatch, logAction, marker, rearm, undo, redo, canUndo, canRedo, rotatePage, clearPage };
}
