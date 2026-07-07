import { createContext } from 'preact';
import { useReducer, useContext } from 'preact/hooks';
import { widthPercentToHeightPercent } from '../../lib/coords.js';

const SignToolContext = createContext(null);

const initialState = {
  selectedTool: null,
  elements: [],
  activeElementId: null,
  actionHistory: []
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_TOOL':
      return {
        ...state,
        selectedTool: action.payload
      };
    case 'SET_ELEMENTS':
      return {
        ...state,
        elements: action.payload
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
        elements: state.elements.filter(el => el.id !== action.payload)
      };
    case 'SET_ACTIVE_ELEMENT_ID':
      return {
        ...state,
        activeElementId: action.payload
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
        elements: state.elements.map(el => {
          if (el.id !== id) return el;
          if (isLineTool) {
            const tiny = Math.hypot(el.x2 - el.x1, el.y2 - el.y1) < 1;
            if (tiny) {
              return {
                ...el,
                x1: Math.max(0, startLeftPercent - 6), y1: startTopPercent,
                x2: Math.min(100, startLeftPercent + 6), y2: startTopPercent
              };
            }
            return el;
          }
          if (el.width < 0.5 && el.height < 0.5) {
            if (tool === 'whiteout') {
              return { ...el, left: startLeftPercent - 5, top: startTopPercent - 2, width: 10, height: 4 };
            }
            const defW = 8;
            const defH = widthPercentToHeightPercent(defW, 1, rectWidth, rectHeight);
            return { ...el, left: startLeftPercent - defW / 2, top: startTopPercent - defH / 2, width: defW, height: defH };
          }
          return el;
        })
      };
    }
    case 'UNDO': {
      if (state.actionHistory.length === 0) return state;
      const lastAction = state.actionHistory[0];
      return {
        ...state,
        elements: state.elements.filter(el => el.id !== lastAction.elementId),
        activeElementId: state.activeElementId === lastAction.elementId ? null : state.activeElementId,
        actionHistory: state.actionHistory.slice(1)
      };
    }
    default:
      return state;
  }
}

export function SignToolProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  return (
    <SignToolContext.Provider value={{ state, dispatch }}>
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
