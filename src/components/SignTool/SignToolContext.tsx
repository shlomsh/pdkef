import { createContext } from 'preact';
import type { ComponentChildren } from 'preact';
import { useReducer, useContext, useMemo } from 'preact/hooks';
import { widthPercentToHeightPercent } from '../../editor/geometry/coords.js';
import type { ActionHistoryEntry } from '../../editor/model/actionHistory.ts';
import type { EditorElement } from '../../editor/model/editorModel.ts';
import {
  MIN_LINE_LENGTH_PCT,
  LINE_RESET_SPREAD_PCT,
  MIN_SHAPE_THRESHOLD_PCT,
  DEFAULT_WHITEOUT_WIDTH_PCT,
  DEFAULT_WHITEOUT_HEIGHT_PCT,
  DEFAULT_WHITEOUT_LEFT_OFFSET_PCT,
  DEFAULT_WHITEOUT_TOP_OFFSET_PCT,
  DEFAULT_SHAPE_FALLBACK_WIDTH_PCT,
  DEFAULT_SHAPE_FALLBACK_ASPECT_RATIO
} from '../../constants/signGeometry.js';

/**
 * Mutable fields from any editor element variant. Identity, kind, and page are
 * deliberately absent: moving an existing annotation between kinds or pages
 * must be an explicit document operation, never an accidental toolbar patch.
 */
export type EditorElementPatch<T extends EditorElement = EditorElement> =
  T extends unknown ? Partial<Omit<T, 'id' | 'type' | 'pageIndex'>> : never;

export type SignToolAction =
  | { type: 'SET_TOOL'; payload: string | null | { tool: string; locked: boolean } }
  | { type: 'DISARM_TOOL' }
  | { type: 'SET_ELEMENTS'; payload: EditorElement[] }
  | { type: 'ADD_ELEMENT'; payload: EditorElement }
  | { type: 'UPDATE_ELEMENT'; payload: { id: string; changes: EditorElementPatch } }
  | { type: 'DELETE_ELEMENT'; payload: string }
  | { type: 'CLEAR_PAGE'; payload: number }
  | { type: 'SET_ACTIVE_ELEMENT_ID'; payload: string | null }
  | { type: 'SET_EDITING_ELEMENT_ID'; payload: string | null }
  | { type: 'SET_ACTION_HISTORY'; payload: ActionHistoryEntry<EditorElement>[] }
  | { type: 'ADD_ACTION_HISTORY'; payload: ActionHistoryEntry<EditorElement> }
  | {
      type: 'ENSURE_MINIMUM_SIZE';
      payload: {
        id: string;
        tool: string;
        rectWidth: number;
        rectHeight: number;
        startLeftPercent: number;
        startTopPercent: number;
      };
    }
  | { type: 'UNDO' };

export interface SignToolState {
  selectedTool: string | null;
  toolLocked: boolean;
  elements: EditorElement[];
  activeElementId: string | null;
  editingElementId: string | null;
  actionHistory: ActionHistoryEntry<EditorElement>[];
  /** Monotonic document version; exports must match the version they started with. */
  documentRevision: number;
}

export interface SignToolContextValue {
  state: SignToolState;
  dispatch: (action: SignToolAction) => void;
}

export const SignToolContext = createContext<SignToolContextValue | null>(null);

const initialState: SignToolState = {
  selectedTool: null,
  // A tool is one-shot by default: it disarms itself once it has placed
  // something, so the click that follows a placement means "deselect", not
  // "make another one". Locking (double-click the tool button) opts back into
  // the old sticky behaviour for repeat placements - ten check marks on a form.
  toolLocked: false,
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
  documentRevision: 0,
};

const nextDocumentRevision = (state: SignToolState) => (state.documentRevision ?? 0) + 1;

export function reducer(state: SignToolState, action: SignToolAction): SignToolState {
  switch (action.type) {
    case 'SET_TOOL': {
      // Payload is either a bare tool name (the common one-shot case) or
      // { tool, locked } when the user has asked to keep the tool armed.
      const { tool, locked = false } =
        action.payload && typeof action.payload === 'object'
          ? action.payload
          : { tool: action.payload };
      return {
        ...state,
        selectedTool: tool,
        toolLocked: tool ? locked : false
      };
    }
    // Fired by the gesture handlers once a placement is committed. A locked
    // tool ignores it and stays armed.
    case 'DISARM_TOOL':
      return state.toolLocked ? state : { ...state, selectedTool: null };
    case 'SET_ELEMENTS':
      // A wholesale replacement of the document (load, draft restore, undo)
      // invalidates any open edit session along with the selection.
      return {
        ...state,
        elements: action.payload,
        activeElementId: null,
        editingElementId: null,
        documentRevision: nextDocumentRevision(state),
      };
    case 'ADD_ELEMENT':
      return {
        ...state,
        elements: [...state.elements, action.payload],
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
        elements: state.elements.filter(el => el.id !== action.payload),
        activeElementId: state.activeElementId === action.payload ? null : state.activeElementId,
        editingElementId: state.editingElementId === action.payload ? null : state.editingElementId,
        documentRevision: nextDocumentRevision(state),
      };
    // Every element on one page at once (the page header's "Clear page"). The
    // caller logs it with a snapshot, so UNDO restores the whole page the same
    // way it restores a single delete. The reducer's own job is the selection
    // invariant: if what was selected or being edited lived on that page, it
    // just stopped existing, so neither id may survive it.
    case 'CLEAR_PAGE': {
      const remaining = state.elements.filter(el => el.pageIndex !== action.payload);
      if (remaining.length === state.elements.length) return state;
      const activeSurvives = remaining.some(el => el.id === state.activeElementId);
      return {
        ...state,
        elements: remaining,
        activeElementId: activeSurvives ? state.activeElementId : null,
        editingElementId: activeSurvives ? state.editingElementId : null,
        documentRevision: nextDocumentRevision(state),
      };
    }
    case 'SET_ACTIVE_ELEMENT_ID':
      return {
        ...state,
        activeElementId: action.payload,
        // Selecting anything other than the element being edited ends the edit
        // session. This is what holds the invariant documented on initialState.
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
    case 'SET_ACTION_HISTORY':
      return {
        ...state,
        actionHistory: action.payload
      };
    case 'ADD_ACTION_HISTORY':
      return {
        ...state,
        actionHistory: [action.payload, ...state.actionHistory]
      };
    case 'ENSURE_MINIMUM_SIZE': {
      const { id, tool, rectWidth, rectHeight, startLeftPercent, startTopPercent } = action.payload;
      const isLineTool = tool === 'line';
      return {
        ...state,
        elements: state.elements.map((el) => {
          if (el.id !== id) return el;
          if (isLineTool) {
            // A stale gesture must not reinterpret a non-line element as a
            // line just because it still has the same id after a restore.
            if (el.type !== 'line') return el;
            const tiny = Math.hypot(el.x2 - el.x1, el.y2 - el.y1) < MIN_LINE_LENGTH_PCT;
            if (tiny) {
              return {
                ...el,
                x1: Math.max(0, startLeftPercent - LINE_RESET_SPREAD_PCT), y1: startTopPercent,
                x2: Math.min(100, startLeftPercent + LINE_RESET_SPREAD_PCT), y2: startTopPercent
              };
            }
            return el;
          }
          if (!('width' in el) || !('height' in el)) return el;
          if (el.width < MIN_SHAPE_THRESHOLD_PCT && el.height < MIN_SHAPE_THRESHOLD_PCT) {
            if (tool === 'whiteout') {
              return {
                ...el,
                left: startLeftPercent - DEFAULT_WHITEOUT_LEFT_OFFSET_PCT,
                top: startTopPercent - DEFAULT_WHITEOUT_TOP_OFFSET_PCT,
                width: DEFAULT_WHITEOUT_WIDTH_PCT,
                height: DEFAULT_WHITEOUT_HEIGHT_PCT
              };
            }
            const defW = DEFAULT_SHAPE_FALLBACK_WIDTH_PCT;
            const defH = widthPercentToHeightPercent(defW, DEFAULT_SHAPE_FALLBACK_ASPECT_RATIO, rectWidth, rectHeight);
            return { ...el, left: startLeftPercent - defW / 2, top: startTopPercent - defH / 2, width: defW, height: defH };
          }
          return el;
        }),
        documentRevision: nextDocumentRevision(state),
      };
    }
    case 'UNDO': {
      if (state.actionHistory.length === 0) return state;
      const lastAction = state.actionHistory[0];
      // Deletion entries carry a snapshot of what was removed — undo restores it
      // instead of removing by id (see actionHistory.ts).
      if (lastAction.snapshot) {
        return {
          ...state,
          elements: [...state.elements, ...lastAction.snapshot],
          actionHistory: state.actionHistory.slice(1),
          documentRevision: nextDocumentRevision(state),
        };
      }
      return {
        ...state,
        elements: state.elements.filter(el => el.id !== lastAction.elementId),
        activeElementId: state.activeElementId === lastAction.elementId ? null : state.activeElementId,
        editingElementId: state.editingElementId === lastAction.elementId ? null : state.editingElementId,
        actionHistory: state.actionHistory.slice(1),
        documentRevision: nextDocumentRevision(state),
      };
    }
    default:
      return state;
  }
}

export function SignToolProvider({ children }: { children: ComponentChildren }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const contextValue = useMemo(() => ({ state, dispatch }), [state]);

  return (
    <SignToolContext.Provider value={contextValue}>
      {children}
    </SignToolContext.Provider>
  );
}

export function useSignTool() {
  const context = useContext(SignToolContext);
  if (!context) {
    throw new Error('useSignTool must be used within a SignToolProvider');
  }
  return context;
}
