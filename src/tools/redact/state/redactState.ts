/**
 * SNG-08: the one owner of Redact's island state. Pure: no React, no DOM, no
 * pdf.js calls (the pdf.js document is only held here, typed, never touched).
 *
 * Every transition the island performs is an action named for what happened,
 * and setters that always changed together are one action, so no render can
 * see half of a transition.
 *
 * Deliberately NOT here (see PdfRedactTool.tsx):
 *   - anything that moves during a gesture: the drawing preview's geometry is
 *     written to the DOM by the gesture controller (golden rule). Only the
 *     start (`DRAW_STARTED`) and the end (`DRAW_ENDED`) of a draw reach state.
 *   - refs: file bytes, load ids and controllers, the rendered-page set, the
 *     undo chip's timer, the export run's ticket.
 *   - Find (`useFind`), the Delete tool (`useDeleteTool`), Peek (`usePeekAll`)
 *     and the Share bytes (`usePdfShare`), which keep their own hooks.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  applyHistoryEntries,
  removedPlaces,
  revertHistoryEntries,
  type ActionHistoryEntry,
  type HistoryElement,
  type HistoryPlace,
  type PlaceHistoryEntry,
} from '../../../editor/model/actionHistory.ts';
import { pushCommand, redoStep, revertCommands, type HistoryStack } from '../../../editor/model/historyStack.ts';
import type { BlurStrength } from '../../../editor/model/blurStrength.ts';
import type { DocumentStyle } from '../../../editor/model/documentStyle.ts';
import type { RedactToolType } from '../../../editor/model/editorModel.ts';
import type { BrushSettings } from '../BrushControls.tsx';
import type { CheckTerm } from '../check/types.ts';
import type { FinishPhase } from '../finishState.ts';
import type { RedactElement } from '../redactElements.ts';

export type RedactStatus = 'idle' | 'loading' | 'editing' | 'redacting' | 'error';

type DrawnRedactTool = Exclude<RedactToolType, 'delete'>;

/** The box being drawn. Set when the press lands, cleared on release or cancel. */
export interface RedactDrawing {
  pageIndex: number;
  startX: number;
  startY: number;
  type: DrawnRedactTool;
  color?: string;
  strength?: BlurStrength;
}

/** The five-second Undo chip (Redact design-review finding #3). */
export interface RedactUndoChip {
  message: string;
  entryId: string;
  extra?: { label: string; onSelect: () => void };
}

export interface SavedExport {
  blob: Blob;
  name: string;
}

export interface RedactState {
  document: {
    file: File | null;
    numPages: number;
    pdfDocument: PDFDocumentProxy | null;
    /** How many page canvases have reported their real size. */
    sizedPageCount: number;
    status: RedactStatus;
    /** A recoverable export failure; a failed load uses `status: 'error'`. */
    errorDetail: string | null;
    /** 0..1 while exporting. */
    progress: number;
    /** RED-36: an edit retired a running export. */
    exportCancelled: boolean;
    showWelcomeTip: boolean;
    /** RED-45: reopened with its work, said quietly until the first edit. */
    restoredWithWork: boolean;
  };
  edits: {
    elements: RedactElement[];
    history: HistoryStack<RedactElement>;
    /** Advances on every real document operation. */
    documentRevision: number;
    /** The revision a load or restore captured; draft saving is dirty past it. */
    draftBaselineRevision: number;
    undoAction: RedactUndoChip | null;
    /** RED-60: attachments the person chose to keep, by name. Rides in the draft's `extra.keptAttachments`. */
    keptAttachments: string[];
  };
  tool: {
    activeStyle: RedactToolType | null;
    toolLocked: boolean;
    activeColor: string;
    activeBlurStrength: BlurStrength;
    /** Only what this document's owner explicitly chose (it rides in the draft). */
    carried: Partial<DocumentStyle> | undefined;
    brush: BrushSettings;
    eyedropping: 'brush' | 'box' | null;
    drawingState: RedactDrawing | null;
  };
  selection: {
    /** Hover / touch target: shows a box's delete and resize controls. */
    activeBoxId: string | null;
    /** The sticky, click-set selection (its colour-picker toolbar). */
    selectedBoxId: string | null;
  };
  finish: {
    exportedForHandoff: SavedExport | null;
    handoffFailed: boolean;
    findTerms: CheckTerm[];
    removing: boolean;
    removedNote: string | null;
  };
  view: {
    isFullscreen: boolean;
    isPseudoFullscreen: boolean;
    /** The polite live region's text. */
    announcement: string;
  };
}

/** Read once from the person's preferences by the island; this module never reads storage. */
export interface RedactInitialValues {
  activeColor: string;
  activeBlurStrength: BlurStrength;
  brush: BrushSettings;
}

export function initialRedactState(init: RedactInitialValues): RedactState {
  return {
    document: {
      file: null,
      numPages: 0,
      pdfDocument: null,
      sizedPageCount: 0,
      status: 'idle',
      errorDetail: null,
      progress: 0,
      exportCancelled: false,
      showWelcomeTip: true,
      restoredWithWork: false,
    },
    edits: {
      elements: [],
      history: { past: [], future: [] },
      documentRevision: 0,
      draftBaselineRevision: 0,
      undoAction: null,
      keptAttachments: [],
    },
    tool: {
      activeStyle: null,
      toolLocked: false,
      activeColor: init.activeColor,
      activeBlurStrength: init.activeBlurStrength,
      carried: undefined,
      brush: init.brush,
      eyedropping: null,
      drawingState: null,
    },
    selection: { activeBoxId: null, selectedBoxId: null },
    finish: { exportedForHandoff: null, handoffFailed: false, findTerms: [], removing: false, removedNote: null },
    view: { isFullscreen: false, isPseudoFullscreen: false, announcement: '' },
  };
}

/** What one edit does to `elements`. */
export type ElementEdit<T> =
  | { kind: 'add'; additions: readonly T[] }
  | { kind: 'remove'; ids: ReadonlySet<string> }
  | { kind: 'update'; changesById: ReadonlyMap<string, Partial<T>> };

/** One edit, whole: the change to the elements plus the history entry that undoes it (null: none logged). */
export interface EditCommit<T extends HistoryElement> {
  edit: ElementEdit<T>;
  entry: ActionHistoryEntry<T> | null;
}

export type RedactAction =
  // Loading a file
  | {
      type: 'FILE_INITIALIZED';
      file: File;
      /** Opened from a restored draft rather than picked. */
      restored: boolean;
      elements: RedactElement[];
      /** The restored past; a restored draft never has a redoable future. */
      past: ActionHistoryEntry<RedactElement>[];
      carried: Partial<DocumentStyle> | undefined;
      /** Restored attachment choices; absent starts empty. */
      keptAttachments?: string[];
      brush: BrushSettings;
      activeColor: string;
      activeBlurStrength: BlurStrength;
    }
  | { type: 'FILE_LOAD_STARTED' }
  | { type: 'DOCUMENT_READY'; pdfDocument: PDFDocumentProxy; numPages: number }
  | { type: 'FILE_LOADED' }
  | { type: 'FILE_LOAD_FAILED' }
  | { type: 'PAGE_SIZED'; sizedPageCount: number }
  // Edits
  | ({ type: 'EDIT_COMMITTED' } & EditCommit<RedactElement>)
  | { type: 'PLACE_REMOVED'; entry: PlaceHistoryEntry }
  | { type: 'ATTACHMENT_KEPT'; name: string }
  | { type: 'ATTACHMENT_DROPPED'; name: string }
  | { type: 'UNDO'; entryId?: string }
  | { type: 'REDO' }
  | { type: 'UNDO_CHIP_SHOWN'; message: string; entryId: string; extra?: RedactUndoChip['extra'] }
  | { type: 'UNDO_CHIP_DISMISSED' }
  // Tool
  | { type: 'TOOL_ARMED'; tool: RedactToolType; locked: boolean }
  | { type: 'TOOL_DISARMED' }
  | { type: 'PLACEMENT_COMMITTED' }
  | { type: 'COLOR_CHOSEN'; color: string }
  | { type: 'BLUR_STRENGTH_CHOSEN'; strength: BlurStrength }
  | { type: 'BRUSH_CHOSEN'; brush: BrushSettings; carriedPatch: Partial<DocumentStyle> }
  | { type: 'EYEDROPPER_TOGGLED'; target: 'brush' | 'box' }
  | { type: 'EYEDROPPER_STOPPED' }
  | { type: 'DRAW_STARTED'; drawing: RedactDrawing }
  | { type: 'DRAW_ENDED' }
  // Selection
  | { type: 'BOX_HOVERED'; id: string }
  | { type: 'BOX_UNHOVERED'; id: string }
  | { type: 'BOX_SELECTED'; id: string }
  | { type: 'SELECTION_CLEARED' }
  | { type: 'ESCAPED' }
  // Exporting and what follows it
  | { type: 'EXPORT_STARTED'; announcement: string }
  | { type: 'EXPORT_PROGRESS'; progress: number }
  | { type: 'EXPORT_SAVED'; saved: SavedExport }
  | { type: 'EXPORT_DELIVERED'; announcement: string }
  | { type: 'EXPORT_FAILED'; detail: string; announcement: string }
  | { type: 'EXPORT_CANCELLED'; announcement: string }
  | { type: 'EXPORT_ERROR_CLEARED' }
  | { type: 'SAVED_EXPORT_DISCARDED' }
  | { type: 'HANDOFF_STARTED' }
  | { type: 'HANDOFF_FAILED' }
  | { type: 'FIND_TERM_REMEMBERED'; term: CheckTerm }
  | { type: 'REMOVE_STARTED' }
  | { type: 'REMOVAL_NOTED'; note: string }
  | { type: 'REMOVE_FAILED'; announcement: string }
  | { type: 'REMOVE_SETTLED' }
  // View
  | { type: 'FULLSCREEN_CHANGED'; active: boolean }
  | { type: 'PSEUDO_FULLSCREEN_CHANGED'; active: boolean }
  | { type: 'ANNOUNCED'; message: string };

// ---- selectors ---------------------------------------------------------

/** The brush is Blur or Whiteout armed in brush mode, and nothing else. */
export function brushKindOf(state: RedactState): 'blur' | 'whiteout' | null {
  const { brush, activeStyle } = state.tool;
  return brush.mode === 'brush' && (activeStyle === 'blur' || activeStyle === 'whiteout') ? activeStyle : null;
}

/** Edited since the load or restore that set the baseline: draft saving is wanted. */
export function isDirty(state: RedactState): boolean {
  return state.edits.documentRevision !== state.edits.draftBaselineRevision;
}

/** The quiet "your work is back" note, until the first edit. */
export function restoredNoteVisible(state: RedactState): boolean {
  return state.document.restoredWithWork && !isDirty(state);
}

/** RED-60: the places "Remove it" took out, in order; every export replays them. */
export const selectRemovedPlaces = (state: RedactState): HistoryPlace[] => removedPlaces(state.edits.history.past);

export function canRedo(state: RedactState): boolean {
  return state.edits.history.future.length > 0;
}

export function isFullscreenActive(state: RedactState): boolean {
  return state.view.isFullscreen || state.view.isPseudoFullscreen;
}

/** RED-36: where the finish row is in its story. */
export function finishPhaseOf(state: RedactState): FinishPhase {
  if (state.document.status === 'redacting') return 'exporting';
  if (state.finish.exportedForHandoff) return 'saved';
  if (state.document.exportCancelled) return 'cancelled';
  if (state.edits.elements.length === 0) return 'empty';
  return 'ready';
}

// ---- reducer -----------------------------------------------------------

function applyEdit(elements: RedactElement[], edit: ElementEdit<RedactElement>): RedactElement[] {
  switch (edit.kind) {
    case 'add':
      return [...elements, ...edit.additions];
    case 'remove':
      return elements.filter((el) => !edit.ids.has(el.id));
    case 'update':
      return elements.map((el) => {
        const changes = edit.changesById.get(el.id);
        return changes ? ({ ...el, ...changes } as RedactElement) : el;
      });
  }
}

/** Drops a selection id that no longer names an element. */
function keepIfAlive(id: string | null, alive: ReadonlySet<string>): string | null {
  return id && !alive.has(id) ? null : id;
}

function selectionSurviving(state: RedactState, elements: RedactElement[]): RedactState['selection'] {
  const alive = new Set(elements.map((el) => el.id));
  const activeBoxId = keepIfAlive(state.selection.activeBoxId, alive);
  const selectedBoxId = keepIfAlive(state.selection.selectedBoxId, alive);
  if (activeBoxId === state.selection.activeBoxId && selectedBoxId === state.selection.selectedBoxId) return state.selection;
  return { activeBoxId, selectedBoxId };
}

function withDocument(state: RedactState, patch: Partial<RedactState['document']>): RedactState {
  return { ...state, document: { ...state.document, ...patch } };
}
function withEdits(state: RedactState, patch: Partial<RedactState['edits']>): RedactState {
  return { ...state, edits: { ...state.edits, ...patch } };
}
function withTool(state: RedactState, patch: Partial<RedactState['tool']>): RedactState {
  return { ...state, tool: { ...state.tool, ...patch } };
}
function withFinish(state: RedactState, patch: Partial<RedactState['finish']>): RedactState {
  return { ...state, finish: { ...state.finish, ...patch } };
}
function withView(state: RedactState, patch: Partial<RedactState['view']>): RedactState {
  return { ...state, view: { ...state.view, ...patch } };
}

const NO_SELECTION: RedactState['selection'] = { activeBoxId: null, selectedBoxId: null };

/** Disarms; a locked tool is kept by `PLACEMENT_COMMITTED`, not by this. */
function disarmed(state: RedactState): RedactState {
  const { activeStyle, toolLocked } = state.tool;
  if (activeStyle === null && !toolLocked) return state;
  return withTool(state, { activeStyle: null, toolLocked: false });
}

function selectionCleared(state: RedactState): RedactState {
  const { activeBoxId, selectedBoxId } = state.selection;
  if (activeBoxId === null && selectedBoxId === null) return state;
  return { ...state, selection: NO_SELECTION };
}

export function redactReducer(state: RedactState, action: RedactAction): RedactState {
  switch (action.type) {
    case 'FILE_INITIALIZED': {
      // A new file starts clean (RED-39): no tool armed, locked or not,
      // nothing selected, no export in flight, its own style. The last file's
      // saved export is cleared by the island's invalidation effect
      // (SAVED_EXPORT_DISCARDED on a file change), not here.
      // Before SNG-08 `initialize` called `disarmTool`, which keeps a locked
      // tool, so a tool locked on the last file stayed armed on the next.
      const afterTool = disarmed(state);
      return {
        document: {
          ...afterTool.document,
          file: action.file,
          pdfDocument: null,
          numPages: 0,
          sizedPageCount: 0,
          errorDetail: null,
          progress: 0,
          exportCancelled: false,
          showWelcomeTip: !action.restored,
          restoredWithWork: action.restored && action.elements.length > 0,
        },
        edits: {
          ...afterTool.edits,
          elements: action.elements,
          history: { past: action.past, future: [] },
          keptAttachments: action.keptAttachments ?? [],
          draftBaselineRevision: afterTool.edits.documentRevision,
        },
        tool: {
          ...afterTool.tool,
          carried: action.carried,
          brush: action.brush,
          activeColor: action.activeColor,
          activeBlurStrength: action.activeBlurStrength,
        },
        selection: NO_SELECTION,
        // The terms Find searched belong to the document just left.
        finish: { ...afterTool.finish, findTerms: [] },
        view: afterTool.view,
      };
    }
    case 'FILE_LOAD_STARTED':
      return withDocument(state, { status: 'loading' });
    case 'DOCUMENT_READY':
      return withFinish(
        withDocument(state, { pdfDocument: action.pdfDocument, numPages: action.numPages }),
        { findTerms: [] },
      );
    case 'FILE_LOADED':
      return withDocument(state, { status: 'editing' });
    case 'FILE_LOAD_FAILED':
      return withDocument(state, { status: 'error' });
    case 'PAGE_SIZED':
      if (state.document.sizedPageCount === action.sizedPageCount) return state;
      return withDocument(state, { sizedPageCount: action.sizedPageCount });

    case 'EDIT_COMMITTED': {
      const elements = applyEdit(state.edits.elements, action.edit);
      const history = action.entry
        ? pushCommand(state.edits.history.past, state.edits.history.future, action.entry)
        : state.edits.history;
      const selection = action.edit.kind === 'remove'
        ? {
            activeBoxId: state.selection.activeBoxId && action.edit.ids.has(state.selection.activeBoxId) ? null : state.selection.activeBoxId,
            selectedBoxId: state.selection.selectedBoxId && action.edit.ids.has(state.selection.selectedBoxId) ? null : state.selection.selectedBoxId,
          }
        : state.selection;
      return {
        ...state,
        edits: { ...state.edits, elements, history, documentRevision: state.edits.documentRevision + 1 },
        selection,
      };
    }
    case 'PLACE_REMOVED':
      return {
        ...state,
        edits: {
          ...state.edits,
          history: pushCommand(state.edits.history.past, state.edits.history.future, action.entry),
          documentRevision: state.edits.documentRevision + 1,
        },
        view: { ...state.view, announcement: action.entry.description },
      };
    case 'ATTACHMENT_KEPT': {
      const { keptAttachments } = state.edits;
      return withEdits(state, {
        keptAttachments: keptAttachments.includes(action.name) ? keptAttachments : [...keptAttachments, action.name],
        documentRevision: state.edits.documentRevision + 1,
      });
    }
    case 'ATTACHMENT_DROPPED':
      return withEdits(state, {
        keptAttachments: state.edits.keptAttachments.filter((name) => name !== action.name),
        documentRevision: state.edits.documentRevision + 1,
      });
    case 'UNDO': {
      const { past, future } = state.edits.history;
      const reverted = action.entryId === undefined
        ? past.slice(0, 1)
        : past.filter((entry) => entry.id === action.entryId);
      if (reverted.length === 0) return state;
      const elements = revertHistoryEntries(state.edits.elements, reverted);
      return {
        ...state,
        edits: {
          ...state.edits,
          elements,
          history: revertCommands(past, future, new Set(reverted.map((entry) => entry.id))),
          documentRevision: state.edits.documentRevision + 1,
        },
        selection: selectionSurviving(state, elements),
        view: { ...state.view, announcement: `Undid: ${reverted[0].description}` },
      };
    }
    case 'REDO': {
      const step = redoStep(state.edits.history.past, state.edits.history.future);
      if (!step) return state;
      const elements = applyHistoryEntries(state.edits.elements, [step.entry]);
      return {
        ...state,
        edits: {
          ...state.edits,
          elements,
          history: { past: step.past, future: step.future },
          documentRevision: state.edits.documentRevision + 1,
        },
        selection: selectionSurviving(state, elements),
        view: { ...state.view, announcement: `Redid: ${step.entry.description}` },
      };
    }
    case 'UNDO_CHIP_SHOWN':
      return {
        ...state,
        edits: { ...state.edits, undoAction: { message: action.message, entryId: action.entryId, extra: action.extra } },
        view: { ...state.view, announcement: `${action.message}.` },
      };
    case 'UNDO_CHIP_DISMISSED':
      return state.edits.undoAction === null ? state : withEdits(state, { undoAction: null });

    case 'TOOL_ARMED':
      return withTool(state, { activeStyle: action.tool, toolLocked: action.locked });
    case 'TOOL_DISARMED':
      return disarmed(state);
    case 'PLACEMENT_COMMITTED':
      return state.tool.toolLocked ? state : disarmed(state);
    case 'COLOR_CHOSEN':
      return withTool(state, {
        activeColor: action.color,
        carried: { ...state.tool.carried, whiteoutColor: action.color },
      });
    case 'BLUR_STRENGTH_CHOSEN':
      return withTool(state, {
        activeBlurStrength: action.strength,
        carried: { ...state.tool.carried, blurStrength: action.strength },
      });
    case 'BRUSH_CHOSEN':
      return withTool(state, {
        brush: action.brush,
        carried: { ...state.tool.carried, ...action.carriedPatch },
      });
    case 'EYEDROPPER_TOGGLED':
      return withTool(state, { eyedropping: state.tool.eyedropping === action.target ? null : action.target });
    case 'EYEDROPPER_STOPPED':
      return state.tool.eyedropping ? withTool(state, { eyedropping: null }) : state;
    case 'DRAW_STARTED':
      // Pressing blank page deselects, then the draw begins.
      return selectionCleared(withTool(state, { drawingState: action.drawing }));
    case 'DRAW_ENDED':
      return state.tool.drawingState === null ? state : withTool(state, { drawingState: null });

    case 'BOX_HOVERED':
      return state.selection.activeBoxId === action.id ? state : { ...state, selection: { ...state.selection, activeBoxId: action.id } };
    case 'BOX_UNHOVERED':
      return state.selection.activeBoxId === action.id ? { ...state, selection: { ...state.selection, activeBoxId: null } } : state;
    case 'BOX_SELECTED':
      if (state.selection.activeBoxId === action.id && state.selection.selectedBoxId === action.id) return state;
      return { ...state, selection: { activeBoxId: action.id, selectedBoxId: action.id } };
    case 'SELECTION_CLEARED':
      return selectionCleared(state);
    case 'ESCAPED':
      // Disarms (even a locked tool) and drops the selection.
      return selectionCleared(disarmed(state));

    case 'EXPORT_STARTED':
      return {
        ...state,
        document: { ...state.document, errorDetail: null, exportCancelled: false, status: 'redacting', progress: 0 },
        finish: { ...state.finish, removedNote: null },
        view: { ...state.view, announcement: action.announcement },
      };
    case 'EXPORT_PROGRESS':
      return state.document.progress === action.progress ? state : withDocument(state, { progress: action.progress });
    case 'EXPORT_SAVED':
      // The bytes are kept before they are delivered (download or share) so the
      // hand-off has them; EXPORT_FAILED drops them again if delivery throws.
      return withFinish(state, { exportedForHandoff: action.saved });
    case 'EXPORT_DELIVERED':
      return {
        ...state,
        document: { ...state.document, status: 'editing' },
        view: { ...state.view, announcement: action.announcement },
      };
    case 'EXPORT_FAILED':
      // RED-50: a failure never leaves a saved state behind, whichever step failed.
      return {
        ...state,
        finish: state.finish.exportedForHandoff === null ? state.finish : { ...state.finish, exportedForHandoff: null },
        document: { ...state.document, status: 'editing', errorDetail: action.detail },
        view: { ...state.view, announcement: action.announcement },
      };
    case 'EXPORT_CANCELLED':
      return {
        ...state,
        document: { ...state.document, status: 'editing', progress: 0, exportCancelled: true },
        view: { ...state.view, announcement: action.announcement },
      };
    case 'EXPORT_ERROR_CLEARED':
      return state.document.errorDetail === null ? state : withDocument(state, { errorDetail: null });
    case 'SAVED_EXPORT_DISCARDED':
      return state.finish.exportedForHandoff === null ? state : withFinish(state, { exportedForHandoff: null });
    case 'HANDOFF_STARTED':
      return state.finish.handoffFailed ? withFinish(state, { handoffFailed: false }) : state;
    case 'HANDOFF_FAILED':
      return state.finish.handoffFailed ? state : withFinish(state, { handoffFailed: true });
    case 'FIND_TERM_REMEMBERED':
      return withFinish(state, {
        findTerms: [...state.finish.findTerms.filter((known) => known.label !== action.term.label), action.term],
      });
    case 'REMOVE_STARTED':
      return withFinish(state, { removing: true });
    case 'REMOVAL_NOTED':
      return {
        ...state,
        finish: { ...state.finish, removedNote: action.note },
        view: { ...state.view, announcement: action.note },
      };
    case 'REMOVE_FAILED':
      return {
        ...state,
        finish: { ...state.finish, removedNote: null },
        view: { ...state.view, announcement: action.announcement },
      };
    case 'REMOVE_SETTLED':
      return state.finish.removing ? withFinish(state, { removing: false }) : state;

    case 'FULLSCREEN_CHANGED':
      return state.view.isFullscreen === action.active ? state : withView(state, { isFullscreen: action.active });
    case 'PSEUDO_FULLSCREEN_CHANGED':
      return state.view.isPseudoFullscreen === action.active ? state : withView(state, { isPseudoFullscreen: action.active });
    case 'ANNOUNCED':
      return state.view.announcement === action.message ? state : withView(state, { announcement: action.message });
  }
}
