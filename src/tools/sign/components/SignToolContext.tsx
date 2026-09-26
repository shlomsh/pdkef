import { createContext } from 'preact';
import type { ComponentChildren } from 'preact';
import { useReducer, useContext, useMemo } from 'preact/hooks';
import { applyHistoryEntries, revertHistoryEntries, type ActionHistoryEntry } from '../../../editor/model/actionHistory.ts';
import { pushCommand, redoStep, undoStep } from '../../../editor/model/historyStack.ts';
import type { EditorElement, EditorElementPatch, SignToolType } from '../../../editor/model/editorModel.ts';
import type { DocumentStyle } from '../../../editor/model/documentStyle.ts';
import { resolveDocumentStyle } from '../../../editor/model/elementDefaults.ts';
import { ensureMinimumElementSize } from '../../../editor/geometry/minimumSize.ts';

/**
 * Mutable fields from any editor element variant. Identity, kind, and page are
 * deliberately absent: moving an existing annotation between kinds or pages
 * must be an explicit document operation, never an accidental toolbar patch.
 */
export type { EditorElementPatch } from '../../../editor/model/editorModel.ts';

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
  carried: {},
  appStyle: {},
};

const nextDocumentRevision = (state: SignToolState) => (state.documentRevision ?? 0) + 1;

export function reducer(state: SignToolState, action: SignToolAction): SignToolState {
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
        // A fresh file (no payload field) or a pre-SIGN-33 draft (nothing to
        // restore) both reset to `{}` - a new document starts with no keys of
        // its own, so every one of them falls through to the app-wide style
        // (SIGN-35), then the tool's own defaults.
        carried: action.payload.carried ?? {},
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
        redoHistory: [],
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
    case 'ADD_ACTION_HISTORY': {
      const { past, future } = pushCommand(state.actionHistory, state.redoHistory, action.payload);
      return {
        ...state,
        actionHistory: past,
        redoHistory: future
      };
    }
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
    case 'UNDO': {
      const step = undoStep(state.actionHistory, state.redoHistory);
      if (!step) return state;
      const elements = revertHistoryEntries(state.elements, [step.entry]);
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
    // UNDO-REDO: the exact mirror of UNDO above. SIGN-14 made every edit,
    // undo and replacement revoke a prepared share file and a running export
    // by bumping documentRevision, so redo must bump it too - a redo that
    // skipped this would let a stale export download against a changed
    // document.
    case 'REDO': {
      const step = redoStep(state.actionHistory, state.redoHistory);
      if (!step) return state;
      const elements = applyHistoryEntries(state.elements, [step.entry]);
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
