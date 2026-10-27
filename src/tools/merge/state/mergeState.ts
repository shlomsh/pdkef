/**
 * ARCH-51: the one owner of the Merge island's lifecycle state. Pure: no
 * React, no DOM, no timers.
 *
 * Every transition the island performs is an action named for what happened,
 * and setters that always changed together are one action, so no render can
 * see half of a transition.
 *
 * Deliberately NOT here (see PdfMergeTool.tsx):
 *   - the document itself (files, page plan, sort mode): the history stack
 *     in useDocumentHistory owns it, so Undo/Redo and late arrivals keep
 *     their commit / amend / reset meaning.
 *   - refs: the pending grid-drop indexes, the drop-line indexes, the
 *     restore-scroll flag, the hint timers, the Sortable instances, the
 *     list/strip/document elements.
 *   - the drag's DOM geometry: file-drop insertion lines are painted onto
 *     the DOM during the native drag (golden rule); only the index a drop
 *     read, once, reaches the plan.
 *   - hooks that keep their own state: the prepared merge, the download
 *     flow, the lazily loaded grid and draft-persistence components, the
 *     linked highlight.
 */
import type { NeedsUnlockKind } from '../../../shell/NeedsUnlock.tsx';
import type { MergeDraftSaveState } from '../components/useMergeDraft.ts';

/** 'checking-draft' until the draft store has said whether a draft exists;
 * 'ready' after. */
export type MergeStatus = 'checking-draft' | 'ready';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<unknown>;
}

/** The encryption probe's answer for the one-file case. */
export interface LockedProbe {
  file: File;
  kind: NeedsUnlockKind | null;
  bytes: ArrayBuffer | null;
}

export interface MergeState {
  status: MergeStatus;
  draftSaveState: MergeDraftSaveState;
  /** Names of files the picker handed over that are not PDFs or images. */
  rejectedFiles: string[];
  /** Files that look like ones already in the list (MERGE-07). */
  duplicates: File[];
  addPageNumbers: boolean;
  /** MERGE-11: null means "still the automatic name". */
  customOutputName: string | null;
  isRenamingOutputName: boolean;
  /** How many page cells the grid reports as drawn. */
  renderedCount: number;
  /** The restored-draft sentence, shown once for five seconds. */
  showPickedUpSentence: boolean;
  /** The shortcuts line, shown once on the first keyboard focus. */
  showShortcutsHint: boolean;
  /** False from a restore until its files have all been inspected. */
  restoreHydrationComplete: boolean;
  /** True for the mounted workspace after a valid restore. */
  isRestoredWorkspace: boolean;
  /** MERGE-17 */
  showInstallLine: boolean;
  installPrompt: BeforeInstallPromptEvent | null;
  onIos: boolean;
  lockedProbe: LockedProbe | null;
}

export type MergeAction =
  | { type: 'DRAFT_CHECK_SETTLED'; draftSaveState: MergeDraftSaveState; isRestoring: boolean }
  | { type: 'DRAFT_MODULE_FAILED' }
  | { type: 'FILES_OFFERED'; rejected: string[]; duplicates: File[] }
  | { type: 'PAGE_NUMBERS_CHANGED'; value: boolean }
  | { type: 'OUTPUT_RENAMED'; name: string | null }
  | { type: 'RENAMING_CHANGED'; renaming: boolean }
  | { type: 'RENDERED_COUNT_CHANGED'; count: number }
  | { type: 'DRAFT_RESTORED'; addPageNumbers: boolean; outputName: string | null }
  | { type: 'RESTORE_HYDRATED' }
  | { type: 'PICKED_UP_EXPIRED' }
  | { type: 'SHORTCUTS_HINT_SHOWN' }
  | { type: 'SHORTCUTS_HINT_EXPIRED' }
  | { type: 'WORKSPACE_CLEARED' }
  | { type: 'HANDOFF_ARRIVED'; addPageNumbers: boolean }
  | { type: 'PLATFORM_DETECTED'; onIos: boolean }
  | { type: 'INSTALL_PROMPT_OFFERED'; prompt: BeforeInstallPromptEvent }
  | { type: 'INSTALL_PROMPT_USED' }
  | { type: 'INSTALL_LINE_SHOWN' }
  | { type: 'LOCK_PROBED'; probe: LockedProbe };

/** `draftHint` is the synchronous pre-paint hint (MERGE-13): a draft probably
 * exists, so the empty state is held back until the store answers. */
export function initialMergeState(options: { draftHint: boolean; addPageNumbers: boolean }): MergeState {
  return {
    status: options.draftHint ? 'checking-draft' : 'ready',
    draftSaveState: 'idle',
    rejectedFiles: [],
    duplicates: [],
    addPageNumbers: options.addPageNumbers,
    customOutputName: null,
    isRenamingOutputName: false,
    renderedCount: 0,
    showPickedUpSentence: false,
    showShortcutsHint: false,
    restoreHydrationComplete: true,
    isRestoredWorkspace: false,
    showInstallLine: false,
    installPrompt: null,
    onIos: false,
    lockedProbe: null,
  };
}

/** Everything on screen that belongs to the current set of files. */
function clearedWorkspace(state: MergeState): MergeState {
  return {
    ...state,
    rejectedFiles: [],
    duplicates: [],
    renderedCount: 0,
    showPickedUpSentence: false,
    isRestoredWorkspace: false,
    showShortcutsHint: false,
    customOutputName: null,
    isRenamingOutputName: false,
  };
}

export function mergeReducer(state: MergeState, action: MergeAction): MergeState {
  switch (action.type) {
    case 'DRAFT_CHECK_SETTLED':
      return {
        ...state,
        status: action.isRestoring ? 'checking-draft' : 'ready',
        draftSaveState: action.draftSaveState,
      };
    case 'DRAFT_MODULE_FAILED':
      return { ...state, status: 'ready' };
    case 'FILES_OFFERED':
      return { ...state, rejectedFiles: action.rejected, duplicates: action.duplicates };
    case 'PAGE_NUMBERS_CHANGED':
      return { ...state, addPageNumbers: action.value };
    case 'OUTPUT_RENAMED':
      return { ...state, customOutputName: action.name };
    case 'RENAMING_CHANGED':
      return { ...state, isRenamingOutputName: action.renaming };
    case 'RENDERED_COUNT_CHANGED':
      return { ...state, renderedCount: action.count };
    case 'DRAFT_RESTORED':
      return {
        ...state,
        addPageNumbers: action.addPageNumbers,
        customOutputName: action.outputName,
        restoreHydrationComplete: false,
        isRestoredWorkspace: true,
        showPickedUpSentence: true,
      };
    case 'RESTORE_HYDRATED':
      return { ...state, restoreHydrationComplete: true };
    case 'PICKED_UP_EXPIRED':
      return { ...state, showPickedUpSentence: false };
    case 'SHORTCUTS_HINT_SHOWN':
      return { ...state, showShortcutsHint: true };
    case 'SHORTCUTS_HINT_EXPIRED':
      return { ...state, showShortcutsHint: false };
    case 'WORKSPACE_CLEARED':
      return clearedWorkspace(state);
    case 'HANDOFF_ARRIVED':
      return { ...state, restoreHydrationComplete: true, addPageNumbers: action.addPageNumbers };
    case 'PLATFORM_DETECTED':
      return { ...state, onIos: action.onIos };
    case 'INSTALL_PROMPT_OFFERED':
      return { ...state, installPrompt: action.prompt };
    case 'INSTALL_PROMPT_USED':
      return { ...state, installPrompt: null };
    case 'INSTALL_LINE_SHOWN':
      return { ...state, showInstallLine: true };
    case 'LOCK_PROBED':
      return { ...state, lockedProbe: action.probe };
    default:
      return state;
  }
}
