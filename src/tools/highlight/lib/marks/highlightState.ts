import type { PageGeometry } from '#editor/geometry/coords.ts';
import type { PageTurns } from '#editor/geometry/pageTurn.ts';
import { clearPage, rotatePage, stepHistory, type PageEditState } from '#editor/geometry/pageEdits.ts';
import { elementsReducer, initialElementsState, type ElementsAction } from '#editor/model/elementsReducer.ts';

/** Highlight's document: the shared elements state plus the page turns a person added. */
export type HighlightState = PageEditState;

export type HighlightAction =
  | Exclude<ElementsAction, { type: 'LOAD_DOCUMENT' }>
  | {
      type: 'LOAD_DOCUMENT';
      payload: Extract<ElementsAction, { type: 'LOAD_DOCUMENT' }>['payload'] & { pageTurns?: PageTurns };
    }
  | { type: 'ROTATE_PAGE'; payload: { pageIndex: number; geometry: PageGeometry; description: string } }
  | { type: 'CLEAR_PAGE'; payload: number };

export const initialHighlightState: HighlightState = { ...initialElementsState, pageTurns: {} };

/**
 * Elements actions go to the shared reducer; page turns and clearing go through the shared page edits.
 * A load without `pageTurns` (a fresh file, or a draft saved before turns existed) restores `{}`.
 */
export function highlightReducer(state: HighlightState, action: HighlightAction): HighlightState {
  switch (action.type) {
    case 'LOAD_DOCUMENT':
      return { ...elementsReducer(state, action), pageTurns: action.payload.pageTurns ?? {} };
    case 'ROTATE_PAGE':
      return rotatePage(state, action.payload);
    case 'CLEAR_PAGE':
      return clearPage(state, action.payload);
    case 'UNDO':
      return stepHistory(state, 'undo');
    case 'REDO':
      return stepHistory(state, 'redo');
    default:
      return elementsReducer(state, action);
  }
}
