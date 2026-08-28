import { createContext } from 'preact';
import type { ComponentChildren } from 'preact';
import { useReducer, useContext, useMemo } from 'preact/hooks';
import { widthPercentToHeightPercent } from '../../lib/coords.js';
import type { EditorElement } from '../../lib/editorModel.ts';
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

// Loosely typed on purpose (see TODO.md "Type the interactive shell"): the
// reducer's action shape and actionHistory entries aren't modeled yet, so both
// stay `any` rather than inventing a parallel type nothing else uses.
export interface SignToolState {
  selectedTool: string | null;
  toolLocked: boolean;
  elements: EditorElement[];
  activeElementId: string | null;
  editingElementId: string | null;
  actionHistory: any[];
}

export interface SignToolContextValue {
  state: SignToolState;
  dispatch: (action: any) => void;
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
  actionHistory: []
};

export function reducer(state: SignToolState, action: any): SignToolState {
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
        editingElementId: null
      };
    case 'ADD_ELEMENT':
      return {
        ...state,
        elements: [...state.elements, action.payload]
      };
    case 'UPDATE_ELEMENT':
      return {
        ...state,
        elements: state.elements.map(el =>
          el.id === action.payload.id ? { ...el, ...action.payload.changes } : el
        )
      };
    case 'DELETE_ELEMENT':
      return {
        ...state,
        elements: state.elements.filter(el => el.id !== action.payload),
        activeElementId: state.activeElementId === action.payload ? null : state.activeElementId,
        editingElementId: state.editingElementId === action.payload ? null : state.editingElementId
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
        editingElementId: activeSurvives ? state.editingElementId : null
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
        elements: state.elements.map((el: any) => {
          if (el.id !== id) return el;
          if (isLineTool) {
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
        })
      };
    }
    case 'UNDO': {
      if (state.actionHistory.length === 0) return state;
      const lastAction = state.actionHistory[0];
      // Deletion entries carry a snapshot of what was removed — undo restores it
      // instead of removing by id (see actionHistory.js).
      if (lastAction.snapshot) {
        return {
          ...state,
          elements: [...state.elements, ...lastAction.snapshot],
          actionHistory: state.actionHistory.slice(1)
        };
      }
      return {
        ...state,
        elements: state.elements.filter(el => el.id !== lastAction.elementId),
        activeElementId: state.activeElementId === lastAction.elementId ? null : state.activeElementId,
        editingElementId: state.editingElementId === lastAction.elementId ? null : state.editingElementId,
        actionHistory: state.actionHistory.slice(1)
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
