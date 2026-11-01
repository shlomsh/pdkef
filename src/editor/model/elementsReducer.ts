import { deletedWith } from '#editor/model/deleteCascade.ts';
import { applyHistoryEntries, revertHistoryEntries, type ActionHistoryEntry } from '#editor/model/actionHistory.ts';
import type { EditorElement, EditorElementPatch } from '#editor/model/editorModel.ts';
import { pushCommand, redoStep, undoStep } from '#editor/model/historyStack.ts';

/**
 * READ-03: the tool-agnostic part of an editor's state - the elements, the
 * selection and edit session, the undo/redo stacks and the document revision.
 * Sign's reducer delegates these cases here; Highlight PDF uses the same ones.
 */
export interface ElementsState {
  elements: EditorElement[];
  activeElementId: string | null;
  editingElementId: string | null;
  actionHistory: ActionHistoryEntry<EditorElement>[];
  /** UNDO-REDO: the undone-but-not-yet-redone commands, newest-undone-first
   * (historyStack.ts's `future`). In-memory only, never persisted - a
   * restored draft always starts with an empty redo stack. */
  redoHistory: ActionHistoryEntry<EditorElement>[];
  /** Monotonic document version; exports must match the version they started with. */
  documentRevision: number;
  /** Revision captured when a file is opened/restored; later revisions are edits. */
  draftBaselineRevision?: number;
}

export type ElementsAction =
  | {
      type: 'LOAD_DOCUMENT';
      payload: {
        elements: EditorElement[];
        actionHistory: ActionHistoryEntry<EditorElement>[];
      };
    }
  | { type: 'SET_ELEMENTS'; payload: EditorElement[] }
  | { type: 'ADD_ELEMENT'; payload: EditorElement }
  | { type: 'UPDATE_ELEMENT'; payload: { id: string; changes: EditorElementPatch } }
  | { type: 'DELETE_ELEMENT'; payload: string }
  | { type: 'SET_ACTIVE_ELEMENT_ID'; payload: string | null }
  | { type: 'SET_EDITING_ELEMENT_ID'; payload: string | null }
  | { type: 'ADD_ACTION_HISTORY'; payload: ActionHistoryEntry<EditorElement> }
  | { type: 'UNDO' }
  | { type: 'REDO' };

export const initialElementsState: ElementsState = {
  elements: [],
  activeElementId: null,
  // Selection and text editing are separate states. `activeElementId` means
  // "this element is selected" - the toolbar points at it, Backspace deletes
  // it, dragging moves it. `editingElementId` means "a text edit session is
  // open on it", which is the only state where the caret lives inside the box
  // and Backspace belongs to the text. Without the split there is no way to
  // have a text box selected but not being typed into, so Backspace can never
  // delete one.
  //
  // Invariant, enforced in this reducer and nowhere else: editingElementId is
  // either null or equal to activeElementId. Every caller sets selection
  // through SET_ACTIVE_ELEMENT_ID, so no caller has to remember to close an
  // edit session - the two cannot drift apart.
  editingElementId: null,
  actionHistory: [],
  redoHistory: [],
  documentRevision: 0,
  draftBaselineRevision: 0,
};

export const nextDocumentRevision = (state: ElementsState) => (state.documentRevision ?? 0) + 1;

/** One undo or redo step: the entry's elements, then the stacks it moved to. */
function stepHistory<S extends ElementsState>(
  state: S,
  step: ReturnType<typeof undoStep<EditorElement>>,
  direction: 'undo' | 'redo',
): S {
  if (!step) return state;
  const move = direction === 'undo' ? revertHistoryEntries : applyHistoryEntries;
  const elements = move(state.elements, [step.entry]);
  const activeSurvives = elements.some((element) => element.id === state.activeElementId);
  return {
    ...state,
    elements,
    activeElementId: activeSurvives ? state.activeElementId : null,
    editingElementId: activeSurvives ? state.editingElementId : null,
    actionHistory: step.past,
    redoHistory: step.future,
    documentRevision: nextDocumentRevision(state),
  };
}

export function elementsReducer<S extends ElementsState>(state: S, action: ElementsAction): S {
  switch (action.type) {
    // Loading is a baseline, never a person edit. Keeping that fact in the
    // document model (rather than inferring it from File identity in the draft
    // hook) means restored element hydration cannot accidentally autosave.
    case 'LOAD_DOCUMENT': {
      const documentRevision = nextDocumentRevision(state);
      return {
        ...state,
        elements: action.payload.elements,
        actionHistory: action.payload.actionHistory,
        // A freshly opened file or a restored draft has no redoable future:
        // history is restored from the draft, but the future never is (it is
        // in-memory only per historyStack.ts).
        redoHistory: [],
        activeElementId: null,
        editingElementId: null,
        documentRevision,
        draftBaselineRevision: documentRevision,
      };
    }
    case 'SET_ELEMENTS':
      // A wholesale replacement of the document (load, draft restore, undo)
      // invalidates any open edit session along with the selection.
      return {
        ...state,
        elements: action.payload,
        activeElementId: null,
        editingElementId: null,
        // Every use of this case replaces the document under the history, so
        // nothing already undone is safe to redo on top of it.
        redoHistory: [],
        documentRevision: nextDocumentRevision(state),
      };
    case 'ADD_ELEMENT':
      return {
        ...state,
        elements: [...state.elements, action.payload],
        // A drag-drawn element enters the document here, at pointer-down, and
        // is only logged on commit. Without this clear, a redo pressed
        // mid-gesture would splice a restored element in beneath it and the
        // commit would then log the drawn one at an index it no longer
        // occupies, painting it behind its neighbour.
        redoHistory: [],
        documentRevision: nextDocumentRevision(state),
      };
    case 'UPDATE_ELEMENT':
      return {
        ...state,
        elements: state.elements.map(el =>
          el.id === action.payload.id ? { ...el, ...action.payload.changes } : el
        ),
        documentRevision: nextDocumentRevision(state),
      };
    case 'DELETE_ELEMENT':
      return {
        ...state,
        elements: state.elements.filter(el => !deletedWith(action.payload)(el)), // its comments go too
        activeElementId: state.activeElementId === action.payload ? null : state.activeElementId,
        editingElementId: state.editingElementId === action.payload ? null : state.editingElementId,
        documentRevision: nextDocumentRevision(state),
      };
    case 'SET_ACTIVE_ELEMENT_ID':
      return {
        ...state,
        activeElementId: action.payload,
        // Selecting anything other than the element being edited ends the edit
        // session. This is what holds the invariant documented on initialElementsState.
        editingElementId:
          state.editingElementId === action.payload ? state.editingElementId : null
      };
    // Opens a text edit session on the element that is already selected. Guarded
    // rather than trusted, so a stray dispatch cannot put the caret inside an
    // element the toolbar is not pointing at.
    case 'SET_EDITING_ELEMENT_ID':
      return {
        ...state,
        editingElementId: action.payload === state.activeElementId ? action.payload : null
      };
    case 'ADD_ACTION_HISTORY': {
      const { past, future } = pushCommand(state.actionHistory, state.redoHistory, action.payload);
      return {
        ...state,
        actionHistory: past,
        redoHistory: future
      };
    }
    case 'UNDO':
      return stepHistory(state, undoStep(state.actionHistory, state.redoHistory), 'undo');
    // UNDO-REDO: the exact mirror of UNDO above. SIGN-14 made every edit,
    // undo and replacement revoke a prepared share file and a running export
    // by bumping documentRevision, so redo must bump it too - a redo that
    // skipped this would let a stale export download against a changed
    // document.
    case 'REDO':
      return stepHistory(state, redoStep(state.actionHistory, state.redoHistory), 'redo');
    default:
      return state;
  }
}
