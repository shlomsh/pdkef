import { createContext } from 'preact';
import { reportEdit } from '#lib/telemetry/productAnalytics.ts';
import type { ComponentChildren } from 'preact';
import { useCallback, useReducer, useContext, useMemo } from 'preact/hooks';
import type { PageGeometry } from '#editor/geometry/coords.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import type { PageTurns } from '#editor/geometry/pageTurn.ts';
import type { ActionHistoryEntry } from '#editor/model/actionHistory.ts';
import { clearPage, rotatePage, stepHistory } from '#editor/geometry/pageEdits.ts';
import { elementsReducer, initialElementsState, nextDocumentRevision } from '#editor/model/elementsReducer.ts';
import type { EditorElement, EditorElementPatch, SignToolType } from '#editor/model/editorModel.ts';
import type { DocumentStyle } from '#editor/model/documentStyle.ts';
import { resolveDocumentStyle } from '../lib/elementDefaults.ts';
import { ensureMinimumElementSize } from '../lib/minimumSize.ts';

/**
 * Mutable fields from any editor element variant. Identity, kind, and page are
 * deliberately absent: moving an existing annotation between kinds or pages
 * must be an explicit document operation, never an accidental toolbar patch.
 */
export type { EditorElementPatch } from '#editor/model/editorModel.ts';

export type SignToolAction =
  | { type: 'SET_TOOL'; payload: SignToolType | null | { tool: SignToolType; locked: boolean } }
  | { type: 'DISARM_TOOL' }
  | {
      type: 'LOAD_DOCUMENT';
      payload: {
        elements: EditorElement[];
        actionHistory: ActionHistoryEntry<EditorElement>[];
        /** The document's carried style (SIGN-33; SIGN-32's `carriedFont`/
         * `carriedFontSize`/`carriedDirection` folded into it), from its
         * draft record. Absent (or `null`) resets to `{}` - a fresh document,
         * or one restored from a draft written before this existed, starts
         * over rather than inheriting whatever the previously loaded
         * document had; its keys still fall through to the app-wide style
         * (SIGN-35), then the tool's own defaults. */
        carried?: Partial<DocumentStyle> | null;
        /** SIGN-43: the clockwise quarter turns by page index, from the draft.
         * Absent resets to `{}`, same as `carried`. */
        pageTurns?: PageTurns;
        /** SIGN-35: the app-wide style, read again from `preferenceStore.ts`
         * whenever a document opens, so a choice made in another tab applies
         * to the next document. Absent leaves whatever is already loaded -
         * unlike `carried`, opening a document never resets this. */
        appStyle?: Partial<DocumentStyle>;
      };
    }
  | { type: 'SET_ELEMENTS'; payload: EditorElement[] }
  | { type: 'ADD_ELEMENT'; payload: EditorElement }
  | { type: 'UPDATE_ELEMENT'; payload: { id: string; changes: EditorElementPatch } }
  | { type: 'DELETE_ELEMENT'; payload: string }
  | { type: 'CLEAR_PAGE'; payload: number }
  /** SIGN-43: turn one page a quarter turn clockwise. `geometry` is the page's
   * currently displayed geometry (existing turns included). `description` is
   * the localized history label; absent falls back to English. */
  | { type: 'ROTATE_PAGE'; payload: { pageIndex: number; geometry: PageGeometry; textWidths?: Record<string, number>; description?: string } }
  | { type: 'SET_ACTIVE_ELEMENT_ID'; payload: string | null }
  | { type: 'SET_EDITING_ELEMENT_ID'; payload: string | null }
  | { type: 'ADD_ACTION_HISTORY'; payload: ActionHistoryEntry<EditorElement> }
  /** The document's one carried style (SIGN-33): a partial patch, merged
   * into `carried`. Set once per key, from the first field that needed one,
   * or explicitly by an A-/A+ press, a font pick, or a typed script/
   * direction change (PdfWorkspace's makeOnChange) - either way everything
   * placed after takes it, until the next explicit change to that key. */
  | { type: 'SET_CARRIED'; payload: Partial<DocumentStyle> }
  /** SIGN-35: a partial patch merged into the app-wide style, the person's
   * latest choice in any document - `chooseStyle.ts` dispatches this beside
   * `SET_CARRIED` for the part of an explicit change that goes app-wide. Not
   * part of the document, so it never bumps `documentRevision`. */
  | { type: 'SET_APP_STYLE'; payload: Partial<DocumentStyle> }
  | {
      type: 'ENSURE_MINIMUM_SIZE';
      payload: {
        id: string;
        tool: SignToolType;
        rectWidth: number;
        rectHeight: number;
        startLeftPercent: number;
        startTopPercent: number;
      };
    }
  | { type: 'UNDO' }
  | { type: 'REDO' };

export interface SignToolState {
  selectedTool: SignToolType | null;
  toolLocked: boolean;
  elements: EditorElement[];
  activeElementId: string | null;
  editingElementId: string | null;
  actionHistory: ActionHistoryEntry<EditorElement>[];
  /** UNDO-REDO: the undone-but-not-yet-redone commands, newest-undone-first
   * (historyStack.ts's `future`). In-memory only, never persisted - a
   * restored draft always starts with an empty redo stack. */
  redoHistory: ActionHistoryEntry<EditorElement>[];
  /** SIGN-43: clockwise quarter turns a person added to each page, on top of its own /Rotate. */
  pageTurns: PageTurns;
  /** Monotonic document version; exports must match the version they started with. */
  documentRevision: number;
  /** Revision captured when a file is opened/restored; later revisions are edits. */
  draftBaselineRevision?: number;
  /** The document's one carried style (SIGN-33) - belongs to this document,
   * not the browser, and round-trips through its draft
   * (useEditorDraftPersistence's `extra.carried`). A key absent from this
   * object means nothing has set it yet: `combPlacement.ts`'s
   * `fieldFontSize` seeds `font`/`fontSize` from the first field that needs
   * one, a fresh text field falls back to auto-detecting direction from its
   * own text (getEffectiveTextDirection) or a detected field's printed
   * direction, and every other key falls back to its own tool default.
   * `PdfWorkspace`'s `makeOnChange` sets a key explicitly (A-/A+, a font
   * pick, a typed script/direction change, and so on). */
  carried: Partial<DocumentStyle>;
  /** SIGN-35: the person's latest choice in any document, saved on the
   * device (`preferenceStore.ts`'s `getAppStyle`/`rememberAppStyle`), never
   * in the draft. A key `carried` never set for this document falls through
   * to this - see `elementDefaults.ts`'s `resolveDocumentStyle` and this
   * file's `useDocumentStyle` hook. */
  appStyle: Partial<DocumentStyle>;
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
  ...initialElementsState,
  pageTurns: {},
  carried: {},
  appStyle: {},
};

export function reducer(state: SignToolState, action: SignToolAction): SignToolState {
  switch (action.type) {
    // Sign-only parts of a load run after the shared baseline.
    case 'LOAD_DOCUMENT': {
      const loaded = elementsReducer(state, action);
      return {
        ...loaded,
        // A fresh file (no payload field) or a pre-SIGN-33 draft (nothing to
        // restore) both reset to `{}` - a new document starts with no keys of
        // its own, so every one of them falls through to the app-wide style
        // (SIGN-35), then the tool's own defaults.
        carried: action.payload.carried ?? {},
        pageTurns: action.payload.pageTurns ?? {},
        // SIGN-35: absent leaves whatever app-wide style is already loaded -
        // unlike `carried`, a document never resets this. PdfSignTool passes
        // `getAppStyle()` here on every load, so a choice made in another tab
        // applies to the next document opened in this one.
        appStyle: action.payload.appStyle ?? state.appStyle,
      };
    }
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
    case 'ADD_ELEMENT':
    case 'UPDATE_ELEMENT':
    case 'DELETE_ELEMENT':
    case 'SET_ACTIVE_ELEMENT_ID':
    case 'SET_EDITING_ELEMENT_ID':
    case 'ADD_ACTION_HISTORY':
      return elementsReducer(state, action);
    // Every element on one page at once (the page header's "Clear page"). The
    // caller logs it with a snapshot, so UNDO restores the whole page the same
    // way it restores a single delete. The reducer's own job is the selection
    // invariant: if what was selected or being edited lived on that page, it
    // just stopped existing, so neither id may survive it.
    case 'CLEAR_PAGE':
      return clearPage(state, action.payload);
    case 'ROTATE_PAGE':
      return rotatePage(state, {
        ...action.payload,
        description: action.payload.description
          ?? formatMessage(englishSignMessages.rotatePageDescription, { number: action.payload.pageIndex + 1 }),
      });
    // Bumps documentRevision like any other edit: the carried style is part
    // of the document now (round-tripped through its draft), not a browser
    // preference, so a change to any key is a saveable edit the same way an
    // element change is. A partial patch merges into whatever is already
    // carried, so setting one key never clobbers another.
    case 'SET_CARRIED':
      return {
        ...state,
        carried: { ...state.carried, ...action.payload },
        documentRevision: nextDocumentRevision(state),
      };
    // SIGN-35: the app-wide style is not part of the document - it never
    // bumps documentRevision, so it never marks a draft dirty or invalidates
    // a prepared export on its own.
    case 'SET_APP_STYLE':
      return {
        ...state,
        appStyle: { ...state.appStyle, ...action.payload },
      };
    case 'ENSURE_MINIMUM_SIZE': {
      const { id, tool, rectWidth, rectHeight, startLeftPercent, startTopPercent } = action.payload;
      return {
        ...state,
        elements: state.elements.map((element) => element.id === id
          ? ensureMinimumElementSize(element, { tool, rectWidth, rectHeight, startLeftPercent, startTopPercent })
          : element),
        documentRevision: nextDocumentRevision(state),
      };
    }
    case 'UNDO':
      return stepHistory(state, 'undo');
    case 'REDO':
      return stepHistory(state, 'redo');
    default:
      return state;
  }
}

export function SignToolProvider({ children }: { children: ComponentChildren }) {
  const [state, rawDispatch] = useReducer(reducer, initialState);
  // DEBT-58: a committed, deliberate change is exactly an action-history entry (gestures log on
  // release, never on pointermove). LOAD_DOCUMENT and SET_ELEMENTS carry loads and restores and
  // never log, so they cannot count as an edit.
  const dispatch = useCallback((action: SignToolAction) => {
    rawDispatch(action);
    if (action.type === 'ADD_ACTION_HISTORY') reportEdit('sign');
  }, []);

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

/**
 * SIGN-35: the document's resolved style - its own `carried` keys over the
 * app-wide style, with no defaults layered in (callers keep their own
 * fallbacks, same as `resolveDocumentStyle`'s two-argument overload).
 */
export function useDocumentStyle(): Partial<DocumentStyle> {
  const { state } = useSignTool();
  return useMemo(
    () => resolveDocumentStyle(state.carried, state.appStyle),
    [state.carried, state.appStyle],
  );
}
