import { useReducer } from 'preact/hooks';
import { createActionEntry, type HistoryLogger } from '#editor/model/actionHistory.ts';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { elementsReducer, initialElementsState, type ElementsAction, type ElementsState } from '#editor/model/elementsReducer.ts';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { useMarker } from './useMarker.ts';

/**
 * The marks on the open document: the shared elements state, a logger for undo steps, and the marker.
 * Highlight dispatches only `ElementsAction`s; the marker in the hand re-arms from every change on a highlight.
 */
export function useHighlightMarks() {
  const [state, dispatch] = useReducer<ElementsState, ElementsAction>(elementsReducer, initialElementsState);
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

  return { state, dispatch, logAction, marker, rearm, undo, redo, canUndo, canRedo };
}
