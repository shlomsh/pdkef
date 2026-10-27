/**
 * ARCH-52: the one owner of Sign's document and finish lifecycle. Pure: no
 * Preact, no DOM.
 *
 * Every transition the island performs is an action named for what happened,
 * and setters that always changed together are one action, so no render can
 * see half of a transition.
 *
 * Deliberately NOT here (see PdfSignTool.tsx):
 *   - the element model, history and carried style: `useSignTool()`'s own
 *     reducer (SignToolProvider) keeps them.
 *   - the hand-off in flight (`handoffBusy`, `useNavigatingAway`), which
 *     tracks navigation, not the document.
 *   - the loaded file, its bytes, the pdf.js document and page sizes, which
 *     are set by the file session's `initialize` callback.
 *   - refs: file bytes, the prepared export, the export run's ticket, the
 *     document revision.
 *   - view state: dialogs, fullscreen, the armed signature, aim and focus.
 */
import type { NeedsUnlockKind } from '../../../shell/NeedsUnlock.tsx';
import type { SignedExport } from '../exportHandoff.ts';

export type SignStatus = 'idle' | 'loading' | 'editing' | 'signing' | 'done' | 'error';

export interface SignLifecycleState {
  status: SignStatus;
  /** A recoverable export failure; a failed load uses `status: 'error'`. */
  errorDetail: string | null;
  /** 0..1 while exporting. */
  progress: number;
  /** The polite live-region message. */
  announcement: string;
  /** ENC-07: a protected PDF is a precondition, not a failure. */
  needsUnlock: NeedsUnlockKind | null;
  /** The last signed export of the document as it stands. */
  signedExport: SignedExport | null;
  /** The hand-off to another tool failed to save its baton. */
  handoffFailed: boolean;
}

export type SignLifecycleAction =
  /** The load gate reports a coarse status. */
  | { type: 'LOAD_STATUS_CHANGED'; status: 'loading' | 'editing' | 'error' }
  /** The load gate found a protected file. */
  | { type: 'NEEDS_UNLOCK_FOUND'; kind: NeedsUnlockKind }
  /** A new file was chosen: protection and any export error reset. */
  | { type: 'DOCUMENT_OPENED' }
  | { type: 'ANNOUNCED'; message: string }
  /** An edit or a new file retires the signed export and the hand-off failure. */
  | { type: 'EXPORT_RETIRED' }
  /** The edit also cut short a user-started export. */
  | { type: 'EXPORT_INTERRUPTED'; announcement: string }
  | { type: 'EXPORT_STARTED'; announcement: string }
  | { type: 'EXPORT_PROGRESSED'; progress: number }
  /** An export ended well; `signedExport` of undefined leaves the held one. */
  | { type: 'EXPORT_FINISHED'; announcement?: string; signedExport?: SignedExport | null }
  | { type: 'EXPORT_FAILED'; detail: string; announcement: string }
  /** The export hit encryption the load gate missed. */
  | { type: 'EXPORT_NEEDS_UNLOCK'; announcement: string }
  | { type: 'EXPORT_ERROR_CLEARED' }
  /** A file already made for this revision was downloaded or shared. */
  | { type: 'EXPORT_DELIVERED'; signedExport: SignedExport | null; announcement: string }
  /** A hand-off began; `ready` is the file made for this revision, if any. */
  | { type: 'HANDOFF_REQUESTED'; ready: SignedExport | null }
  | { type: 'HANDOFF_FAILED' };

export function initialSignLifecycleState(): SignLifecycleState {
  return {
    status: 'idle',
    errorDetail: null,
    progress: 0,
    announcement: '',
    needsUnlock: null,
    signedExport: null,
    handoffFailed: false,
  };
}

export function signLifecycleReducer(state: SignLifecycleState, action: SignLifecycleAction): SignLifecycleState {
  switch (action.type) {
    case 'LOAD_STATUS_CHANGED':
      return { ...state, status: action.status };
    case 'NEEDS_UNLOCK_FOUND':
      return { ...state, needsUnlock: action.kind };
    case 'DOCUMENT_OPENED':
      return { ...state, needsUnlock: null, errorDetail: null, progress: 0 };
    case 'ANNOUNCED':
      return { ...state, announcement: action.message };
    case 'EXPORT_RETIRED':
      return { ...state, signedExport: null, handoffFailed: false };
    case 'EXPORT_INTERRUPTED':
      return { ...state, status: 'editing', progress: 0, announcement: action.announcement };
    case 'EXPORT_STARTED':
      return { ...state, errorDetail: null, status: 'signing', progress: 0, announcement: action.announcement };
    case 'EXPORT_PROGRESSED':
      return { ...state, progress: action.progress };
    case 'EXPORT_FINISHED':
      return {
        ...state,
        status: 'editing',
        signedExport: action.signedExport === undefined ? state.signedExport : action.signedExport,
        announcement: action.announcement === undefined ? state.announcement : action.announcement,
      };
    case 'EXPORT_FAILED':
      return { ...state, status: 'editing', errorDetail: action.detail, announcement: action.announcement };
    case 'EXPORT_NEEDS_UNLOCK':
      return { ...state, status: 'editing', needsUnlock: 'owner-restricted', announcement: action.announcement };
    case 'EXPORT_ERROR_CLEARED':
      return { ...state, errorDetail: null };
    case 'EXPORT_DELIVERED':
      return { ...state, signedExport: action.signedExport, announcement: action.announcement };
    case 'HANDOFF_REQUESTED':
      return { ...state, handoffFailed: false, signedExport: action.ready ?? state.signedExport };
    case 'HANDOFF_FAILED':
      return { ...state, handoffFailed: true };
  }
}
