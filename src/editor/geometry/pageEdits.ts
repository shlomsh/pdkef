// Page-level edits shared by Sign and Highlight: turn a page, clear a page, and
// step undo/redo across a turn. Pure functions over the minimal state they read
// and write; no React, no tool types. Anything tool-specific (the localized
// history label, measured text widths) comes in as a parameter.
import type { PageGeometry } from './coords.ts';
import { addTurn, turnElement, turnGeometry, unturnElement, type PageTurns } from './pageTurn.ts';
import { createActionEntry, type ActionHistoryEntry } from '../model/actionHistory.ts';
import type { EditorElement } from '../model/editorModel.ts';
import { elementsReducer, nextDocumentRevision, type ElementsState } from '../model/elementsReducer.ts';
import { pushCommand, redoStep, undoStep } from '../model/historyStack.ts';

/** The fields the page edits read and write. */
export interface PageEditState extends ElementsState {
  /** Clockwise quarter turns a person added to each page, by page index. */
  pageTurns: PageTurns;
}

/**
 * One page turned `by` quarter turns from `geometry`, the geometry it is
 * displayed with before the turn. Selection is dropped; no element is removed. @testSeam
 */
export function turnPage<S extends PageEditState>(
  state: S, pageIndex: number, geometry: PageGeometry, by: 1 | -1, textWidths?: Record<string, number>,
): S {
  const turnOne = (el: EditorElement) => (by === 1
    ? turnElement(el, geometry, 1, textWidths?.[el.id])
    : unturnElement(el, turnGeometry(geometry, 1), 1, textWidths?.[el.id]));
  return {
    ...state,
    elements: state.elements.map((el) => (el.pageIndex === pageIndex ? turnOne(el) : el)),
    pageTurns: addTurn(state.pageTurns, pageIndex, by),
    activeElementId: null,
    editingElementId: null,
    documentRevision: nextDocumentRevision(state),
  };
}

/** One undoable clockwise turn of one page; `description` is the localized history label. */
export function rotatePage<S extends PageEditState>(
  state: S,
  { pageIndex, geometry, textWidths, description }: {
    pageIndex: number; geometry: PageGeometry; textWidths?: Record<string, number>; description: string;
  },
): S {
  const entry = createActionEntry({
    operation: 'turn-page', type: 'ROTATE_PAGE', pageIndex, geometry,
    ...(textWidths ? { textWidths } : {}),
    description,
  });
  const { past, future } = pushCommand(state.actionHistory, state.redoHistory, entry);
  return { ...turnPage(state, pageIndex, geometry, 1, textWidths), actionHistory: past, redoHistory: future };
}

/**
 * Every element on one page at once. The caller logs it with a snapshot so UNDO
 * restores the page. If the selected or edited element lived there, neither id
 * survives. A page with nothing on it returns the same state.
 */
export function clearPage<S extends ElementsState>(state: S, pageIndex: number): S {
  const remaining = state.elements.filter((el) => el.pageIndex !== pageIndex);
  if (remaining.length === state.elements.length) return state;
  const activeSurvives = remaining.some((el) => el.id === state.activeElementId);
  return {
    ...state,
    elements: remaining,
    activeElementId: activeSurvives ? state.activeElementId : null,
    editingElementId: activeSurvives ? state.editingElementId : null,
    redoHistory: [],
    documentRevision: nextDocumentRevision(state),
  };
}

/** A turn-page entry undone (the page turns back from its turned geometry) or redone; any other entry is unchanged. */
function turnedByEntry<S extends PageEditState>(
  state: S, entry: ActionHistoryEntry<EditorElement>, direction: 'undo' | 'redo',
): S {
  if (entry.operation !== 'turn-page') return state;
  return turnPage(state, entry.pageIndex, entry.geometry, direction === 'redo' ? 1 : -1, entry.textWidths);
}

/**
 * UNDO and REDO: a turn-page entry first turns the page (elements and
 * `pageTurns`), then the shared step moves the stacks. The revision is the one
 * bump of the original state.
 */
export function stepHistory<S extends PageEditState>(state: S, direction: 'undo' | 'redo'): S {
  const action = { type: direction === 'undo' ? 'UNDO' : 'REDO' } as const;
  const step = direction === 'undo'
    ? undoStep(state.actionHistory, state.redoHistory)
    : redoStep(state.actionHistory, state.redoHistory);
  if (!step || step.entry.operation !== 'turn-page') return elementsReducer(state, action);
  const turned = turnedByEntry(state, step.entry, direction);
  return { ...elementsReducer(turned, action), documentRevision: nextDocumentRevision(state) };
}
