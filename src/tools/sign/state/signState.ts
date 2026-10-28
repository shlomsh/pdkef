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
 *   - refs: file bytes, the prepared export, the export run's ticket, the
 *     document revision.
 *   - view state: dialogs, fullscreen, the armed signature, aim and focus.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PageGeometry } from '#editor/geometry/coords.ts';
import type { NeedsUnlockKind } from '#shell/NeedsUnlock.tsx';
import type { SignedExport } from '../lib/exportHandoff.ts';
import { unlessUnchanged } from '#lib/output/unchangedState.ts';

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
  /** The loaded file; the document-load fields below are set by the file session. */
  file: File | null;
  /** State as well as a ref: form-grid detection is an effect and needs a changing identity. */
  sourceBytes: ArrayBuffer | null;
  pdfDocument: PDFDocumentProxy | null;
  numPages: number;
  /** Rotated/cropped visible page frames in physical PDF points. */
  pageSizes: PageGeometry[];
}

export type SignLifecycleAction =
  /** The load gate reports a coarse status. */
  | { type: 'LOAD_STATUS_CHANGED'; status: 'loading' | 'editing' | 'error' }
  /** The load gate found a protected file. */
  | { type: 'NEEDS_UNLOCK_FOUND'; kind: NeedsUnlockKind }
  /** A new file was chosen: protection and any export error reset. */
  | { type: 'DOCUMENT_OPENED' }
  /** The file and its bytes landed; the old pdf.js document and page frames go. */
  | { type: 'DOCUMENT_FILE_SET'; file: File; bytes: ArrayBuffer }
  /** pdf.js opened the document. */
  | { type: 'PDF_DOCUMENT_READY'; pdfDocument: PDFDocumentProxy; numPages: number }
  | { type: 'PAGE_SIZES_MEASURED'; pageSizes: PageGeometry[] }
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
    file: null,
    sourceBytes: null,
    pdfDocument: null,
    numPages: 0,
    pageSizes: [],
  };
}

export function signLifecycleReducer(state: SignLifecycleState, action: SignLifecycleAction): SignLifecycleState {
  return unlessUnchanged(state, nextSignLifecycleState(state, action));
}

function nextSignLifecycleState(state: SignLifecycleState, action: SignLifecycleAction): SignLifecycleState {
  switch (action.type) {
    case 'LOAD_STATUS_CHANGED':
      return { ...state, status: action.status };
    case 'NEEDS_UNLOCK_FOUND':
      return { ...state, needsUnlock: action.kind };
    case 'DOCUMENT_OPENED':
      return { ...state, needsUnlock: null, errorDetail: null, progress: 0 };
    case 'DOCUMENT_FILE_SET':
      return { ...state, file: action.file, sourceBytes: action.bytes, pdfDocument: null, numPages: 0, pageSizes: [] };
    case 'PDF_DOCUMENT_READY':
      return { ...state, pdfDocument: action.pdfDocument, numPages: action.numPages };
    case 'PAGE_SIZES_MEASURED':
      return { ...state, pageSizes: action.pageSizes };
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
