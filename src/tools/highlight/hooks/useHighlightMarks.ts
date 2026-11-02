import { useCallback, useReducer } from 'preact/hooks';
import { createActionEntry, type HistoryLogger } from '#editor/model/actionHistory.ts';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { reportEdit } from '#lib/telemetry/productAnalytics.ts';
import { highlightReducer, initialHighlightState, type HighlightAction } from '../lib/marks/highlightState.ts';
import { useMarker } from './useMarker.ts';

/**
 * The marks on the open document: the shared elements state with its page turns, a logger for undo steps, and
 * the marker. Page edits are actions from `lib/marks/pageEditActions.ts`, sent through the caller's dispatch.
 */
export function useHighlightMarks() {
  const [state, rawDispatch] = useReducer<typeof initialHighlightState, HighlightAction>(highlightReducer, initialHighlightState);
  // A committed change is exactly an action-history entry; loads, undo and redo never log one.
  // Stable like the reducer's own dispatch, which effects list as a dependency.
  const dispatch = useCallback((action: HighlightAction) => {
    rawDispatch(action);
    if (action.type === 'ADD_ACTION_HISTORY') reportEdit('highlight-pdf');
  }, []);
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

  return { state, pageTurns: state.pageTurns, dispatch, logAction, marker, rearm, undo, redo, canUndo, canRedo };
}
