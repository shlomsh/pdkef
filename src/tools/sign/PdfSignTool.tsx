import { useState, useReducer, useRef, useEffect, useMemo, useCallback } from 'preact/hooks';
import type {
  EditorElement,
  SignatureElement,
  SignToolType,
} from '../../editor/model/editorModel.ts';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import { withIslandBoundary } from '../../lib/IslandErrorBoundary.tsx';
import SignVerb from './verb/SignVerb.tsx';
import NeedsUnlock from '../../shell/NeedsUnlock.tsx';
import { englishSignMessages } from './messages';
import type { SignMessages } from '../../editor/registry/messages';
import type { ShellMessages } from '../../shell/shellMessages';
import { formatMessage } from '../../lib/formatMessage';
import { SignToolProvider, useDocumentStyle, useSignTool } from './components/SignToolContext.tsx';
import { SavedSignaturesContext } from './components/SavedSignaturesContext.tsx';
import PdfWorkspace from './components/PdfWorkspace.tsx';
import SignatureDialog from './components/SignatureDialog.tsx';
import { uniqueId } from '../../editor/model/ids.ts';
import { describeUnrepresentableText } from './components/textMessages.ts';
import { pageGeometryFromPdfJsPage, widthPercentToHeightPercent } from '../../editor/geometry/coords.js';
import { DEFAULT_INK_COLOR, DEFAULT_START_WIDTH_PCT } from '../../editor/model/signGeometry.js';
import { useEditorFileSession } from '../../editor-ui/hooks/useEditorFileSession.ts';
import { recordAction } from '../../lib/actionTrail.ts';
import useFormFieldRegions from './hooks/useFormFieldRegions.ts';
import useFieldNavigation from './hooks/useFieldNavigation.ts';
import { FillContext, FILL_OFF } from './components/fill/FillContext.tsx';
import { useFillMode } from './hooks/useFillMode.ts';
import { useSignFullscreen } from './hooks/useSignFullscreen.ts';
import { useExportRun } from './hooks/useExportRun.ts';
import { useSignHistory } from './hooks/useSignHistory.ts';
import { useFormDetectionTelemetry } from './hooks/useFormDetectionTelemetry.ts';
import { useSignKeyboard } from './hooks/useSignKeyboard.ts';
import { useElementClipboard } from './hooks/useElementClipboard.ts';
import { useSavedSignatures } from './hooks/useSavedSignatures.ts';
import { isEditorElement } from '../../editor/registry/draftValidation.ts';
import { getAppStyle } from '../../editor/workspace/preferenceStore.ts';
import {
  captureAddedElement,
} from '../../editor/model/actionHistory.ts';
import { usePdfShare } from '../../lib/usePdfShare.js';
import { useHoldUpdate } from '../../lib/useHoldUpdate.ts';
import { getSignExportReadiness } from './lib/signExportReadiness.ts';
import { reportToolLifecycleEvent } from '../../lib/productAnalytics.ts';
import {
  reportMaintenanceEvent,
  signExportFailed,
  signExportSucceeded,
  beaconMaintenanceTransport,
} from '../../lib/maintenanceTelemetry.ts';
import ConfirmDialog from '../../shell/ConfirmDialog.tsx';
import { describeFile } from '../../lib/format.js';
import type { PendingSignaturePlacement } from './hooks/useWorkspaceGestures.ts';
import { reportError } from '../../lib/errorReport.ts';
import { useNavigatingAway } from '../../lib/useNavigatingAway.ts';
import { sendHandoff } from '../../lib/sendHandoff.ts';
import { isEncryptedPdfError } from '../../lib/encryptedPdfError.ts';
import { initialSignLifecycleState, signLifecycleReducer } from './state/signState.ts';
import { exportAtRevision, exportToHandOff, handoffHref, signExportReady, type SignedExport } from './lib/exportHandoff.ts';
import { signedFileName } from './lib/signedFileName.ts';

// Recoverable export failures keep the editor open. Name unsupported text
// precisely; other failures explain that the user can retry without losing
// their edits. Document-load errors use the workspace's separate default copy.
function describeSignFailure(err: unknown, t: SignMessages): string {
  if (err instanceof Error && err.name === 'UnrepresentableTextError') {
    // Worded by src/tools/sign/components/textMessages.ts, the same UI message module the
    // while-typing warning
    // reads from, so the heads-up and the refusal can never name different
    // characters or point at different pages.
    const coverageError = err as Error & { characters: string[]; pageNumbers?: number[] };
    return describeUnrepresentableText(coverageError.characters, coverageError.pageNumbers ?? [], { saving: true }, t);
  }
  if (err instanceof Error && err.name === 'FontUnavailableError') {
    const family = (err as Error & { family?: string }).family;
    return family && family !== 'Arimo'
      ? formatMessage(t.fontNotReadyTemplate, { family })
      : t.defaultFontUnavailable;
  }
  return t.exportGenericFailure;
}

// How long to wait after the last edit before speculatively re-exporting in
// the background (MOBI-07). Generous on purpose: re-signing rasterizes every
// page on the device the user is holding, so this must not fire mid-edit.
const SPECULATIVE_EXPORT_DEBOUNCE_MS = 1500;

/* The editor itself stays English (LOC-02's pilot decision); the dropzone,
   file row and confirmations around it are the shared shell and follow the
   page's language like every other tool.

   LOC-09 stage 1 is the first crack in that: the always-visible toolbar row
   and its status line now read from `messages` (src/editor/registry/messages.ts's
   SignMessages) too. Popovers, dialogs, element controls and announcements
   are not covered yet and stay English - see that catalogue's header
   comment. `messages` is optional and English-default, same as
   `shellMessages`, so every existing English caller is unaffected. */
export default withIslandBoundary(function PdfSignTool({ shellMessages, messages }: { shellMessages?: Partial<ShellMessages>; messages?: Partial<SignMessages> } = {}) {
  return (
    <SignToolProvider>
      <PdfSignToolInner shellMessages={shellMessages} messages={messages} />
    </SignToolProvider>
  );
});

function PdfSignToolInner({ shellMessages, messages }: { shellMessages?: Partial<ShellMessages>; messages?: Partial<SignMessages> }) {
  const t: SignMessages = { ...englishSignMessages, ...messages };
  const {
    state: {
      selectedTool, elements, activeElementId, editingElementId, actionHistory, redoHistory,
      documentRevision, draftBaselineRevision, carried,
    },
    dispatch,
  } = useSignTool();
  const setSelectedTool = (tool: SignToolType | null) => dispatch({ type: 'SET_TOOL', payload: tool });
  // The document and finish lifecycle (state/signState.ts). Export errors are
  // recoverable without unmounting the editor; a failed document load still
  // uses status='error' with the workspace's load copy.
  const [lifecycle, lifecycleDispatch] = useReducer(signLifecycleReducer, undefined, initialSignLifecycleState);
  const {
    status, errorDetail, announcement, needsUnlock, signedExport, handoffFailed,
    file, numPages, sourceBytes, pdfDocument, pageSizes,
  } = lifecycle;
  const setAnnouncement = useCallback((message: string) => lifecycleDispatch({ type: 'ANNOUNCED', message }), []);
  useHoldUpdate(status === 'signing'); // speculative exports never set 'signing'
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tempPlacement, setTempPlacement] = useState<PendingSignaturePlacement | null>(null);
  // ENC-07: a protected PDF is a precondition, not a failure. Set by the load gate (or the export
  // belt) and shown as NeedsUnlock (src/shell/NeedsUnlock.tsx), reset whenever a new file is chosen.
  const { canSharePdf, shareReady, prepare, clearPrepared, download, downloadPrepared, sharePrepared } = usePdfShare();
  // The last signed export of the document as it stands (the Compress it / Redact it
  // hand-offs carry it on), and the most recent one prepared for sharing, which the
  // Download and Share taps promote to it. Both retire with the document revision.
  const preparedExportRef = useRef<SignedExport | null>(null);
  const [handoffBusy, setHandoffBusy] = useNavigatingAway();

  // Every setting a person chooses while filling (colour, font, size,
  // direction, alignment, bold, italic, date format, symbol mark and size,
  // line thickness, whiteout colour, signature width) is this document's
  // carried style (SIGN-33): `carried` in the SignTool reducer, round-tripped
  // through the draft's `extra.carried`, never a browser-wide preference.
  // PdfWorkspace's makeOnChange writes it through chooseStyle.ts
  // (editor/model/carriedPatch.ts), and every placement path reads it. SIGN-35:
  // the same explicit change also writes the app-wide style - the person's
  // latest choice in any document, saved on the device (preferenceStore.ts)
  // - so a key this document never set falls through to it instead of the
  // shipped defaults. `useDocumentStyle()` below is the one resolved view;
  // `carried` itself stays this document's own keys only, which is what
  // useEditorDraftPersistence writes to the draft.
  const style = useDocumentStyle();

  // Fill mode (SNG-15): see hooks/useFillMode.ts.
  const { enabled, fillContextValue } = useFillMode(dispatch, elements);

  const { pageWrapperRefs, workspaceRef, isFullscreen, isPseudoFullscreen, isFullscreenActive, currentPage, toggleFullscreen } = useSignFullscreen(numPages);

  // Which export is still wanted, retired by an edit or by leaving the tree.
  const { exportRun, activeExportSpeculativeRef, documentRevisionRef } = useExportRun({
    file, documentRevision, lifecycleDispatch, clearPrepared, preparedExportRef, messages: t,
  });

  const { logAction, undoLast, redoLast } = useSignHistory({ dispatch, actionHistory, redoHistory, setAnnouncement, messages: t });

  const {
    savedSignatures, activeSignature, setActiveSignature, signatureToDelete, cancelDelete,
    saveNewSignature, deleteSavedSignature, proceedDeleteSignature,
  } = useSavedSignatures({ selectedTool, setSelectedTool, setAnnouncement, messages: t });

  // Printed grids and free-text cells on the loaded form, so placing a text
  // box on one takes its span and cell count instead of needing a
  // side-handle drag (MOBI-04), or at least starts centred on the field
  // instead of wherever the tap landed (MOBI-11). Needs the same pdf.js
  // document PdfWorkspace already renders pages from, for the page's text.
  const formRegions = useFormFieldRegions(sourceBytes, numPages, pdfDocument);

  // FORM-11: one anonymous maintenance event per finished walk (hooks/useFormDetectionTelemetry.ts).
  useFormDetectionTelemetry(formRegions);

  // Next/Previous across those same fields (MOBI-06). Built once here, not in
  // PdfWorkspace/SignToolbar, so the desktop Tab shortcut below and the
  // toolbar's own Next/Previous control read the exact same hasNext/hasPrevious
  // and dispatch through the exact same goToNext/goToPrevious - a control that
  // says a move is possible and a keypress that then no-ops would be a worse
  // bug than the one this avoids.
  const fieldNavigation = useFieldNavigation({
    elements,
    activeElementId,
    dispatch,
    formRegions,
    pageSizes,
    logAction,
    setAnnouncement,
    initialColor: style.color ?? DEFAULT_INK_COLOR,
    carried: style,
    messages: t,
  });

  // The file session (load, add, recents, unique ids, draft, "Open with") is shared with Redact.
  const { handleFilesAdded, fileBytesRef, draftSaveState, isRestoring } = useEditorFileSession<EditorElement>({
    tool: 'sign',
    file,
    pdfDocument,
    status,
    setLoadStatus: (next) => lifecycleDispatch({ type: 'LOAD_STATUS_CHANGED', status: next }),
    setAnnouncement,
    messages: {
      invalidPdf: t.invalidPdfFile,
      needsPassword: t.protectedNeedsPasswordTitle,
      ownerRestricted: t.protectedOwnerOnlyTitle,
      load: {
        timeout: t.pdfLoadTimeout,
        loadFailed: t.pdfLoadFailedGeneric,
        restoredTemplate: t.pdfRestoredTemplate,
        loadedTemplate: t.pdfLoadedTemplate,
      },
    },
    onNeedsUnlock: (kind) => lifecycleDispatch({ type: 'NEEDS_UNLOCK_FOUND', kind }),
    initialize: ({ file: selected, bytes, preset }) => {
      lifecycleDispatch({ type: 'DOCUMENT_OPENED' });
      lifecycleDispatch({ type: 'DOCUMENT_FILE_SET', file: selected, bytes });
      dispatch({
        type: 'LOAD_DOCUMENT',
        payload: {
          elements: preset.elements,
          actionHistory: preset.actionHistory,
          // Absent for a fresh pick or a pre-SIGN-33 draft - the reducer
          // treats that the same as an explicit null, resetting to `{}` so
          // a new document never inherits another document's own choices.
          carried: preset.carried,
          // SIGN-35: read again whenever a document opens, so a choice made
          // in another tab applies to the next document.
          appStyle: getAppStyle(),
        },
      });
      dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
      dispatch({ type: 'SET_TOOL', payload: null });
    },
    onDocument: async (doc, isCurrent) => {
      lifecycleDispatch({ type: 'PDF_DOCUMENT_READY', pdfDocument: doc, numPages: doc.numPages });
      const sizes = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        if (!isCurrent()) return;
        sizes.push(pageGeometryFromPdfJsPage(page));
      }
      if (!isCurrent()) return;
      lifecycleDispatch({ type: 'PAGE_SIZES_MEASURED', pageSizes: sizes });
    },
    draft: {
      elements,
      actionHistory,
      carried,
      isDirty: documentRevision !== (draftBaselineRevision ?? documentRevision),
      isElement: isEditorElement,
    },
  });

  // Helper to place a signature at a specific location
  const placeSignatureAt = (dataUrl: string, aspectRatio: number, pageIdx: number, leftPercent: number, topPercent: number) => {
    const id = uniqueId();
    // Width defaults to whatever the last placed/resized signature used, so
    // consecutive placements of the same signature keep its size instead of
    // resetting to the default every time.
    const widthPercent = style.signatureWidth ?? DEFAULT_START_WIDTH_PCT;

    // Calculate page wrapper dimension
    let pageWrapperHeight = 800;
    let pageWrapperWidth = 600;
    
    const wrapper = pageWrapperRefs.current[pageIdx];
    if (wrapper) {
      const rect = wrapper.getBoundingClientRect();
      pageWrapperWidth = rect.width;
      pageWrapperHeight = rect.height;
    }
    
    const heightPercent = widthPercentToHeightPercent(widthPercent, aspectRatio, pageWrapperWidth, pageWrapperHeight);
    
    const newEl: SignatureElement = {
      id,
      type: 'signature',
      pageIndex: pageIdx,
      left: leftPercent - (widthPercent / 2),
      top: topPercent - (heightPercent / 2),
      width: widthPercent,
      height: heightPercent,
      aspectRatio,
      dataUrl
    };
    
    dispatch({ type: 'ADD_ELEMENT', payload: newEl });
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: id });
    logAction('add', 'ADD_SIGNATURE', pageIdx, t.addedSignatureDescription, [captureAddedElement(newEl, elements.length)]);
    setAnnouncement(t.placedSignatureOnPage);
  };

  // Add signature element from modal
  const handleAddSignatureElement = (dataUrl: string, aspectRatio: number) => {
    const { signature: newSig, persisted } = saveNewSignature(dataUrl, aspectRatio);
    recordAction('draw');
    setActiveSignature(newSig);
    dispatch({ type: 'SET_TOOL', payload: 'signature' });
    
    const placement = tempPlacement || { pageIndex: 0, left: 40, top: 40 };
    recordAction('place_mark');
    placeSignatureAt(dataUrl, aspectRatio, placement.pageIndex, placement.left, placement.top);
    // The dialog both creates and places the signature, so that counts as the
    // tool's one placement - same as a click-placement on the page overlay.
    dispatch({ type: 'DISARM_TOOL' });
    setDialogOpen(false);
    setTempPlacement(null);
    if (!persisted) {
      setAnnouncement(t.signaturePlacedNotSaved);
    }
  };

  useSignKeyboard({
    dispatch, elements, activeElementId, editingElementId, fieldNavigation, enabled, logAction, setAnnouncement, messages: t,
  });

  useElementClipboard({ dispatch, elements, activeElementId, logAction, setAnnouncement, messages: t });

  // Shared by both export actions below: signs the PDF and hands the result to
  // `onSigned`, which decides what to do with it (share vs. plain download).
  // Status/progress/error handling lives here once so the two actions can't
  // drift on how a failure recovers.
  // `speculative` (MOBI-07) drives a background pre-generation run: it must
  // never surface as the "signing" UI, never emit signExportSucceeded/
  // signExportFailed maintenance telemetry (SIGN-13's export-duration signal
  // is a real-export-only measurement), and a failure stays silent since the
  // user never asked for this run - they'll get the honest error if they
  // later tap an export button themselves.
  const runExport = async (
    onSigned: (signedBlob: Blob, filename: string) => void,
    { speculative = false }: { speculative?: boolean } = {},
  ) => {
    if (!file) return;
    const sourceFile = file;
    // DEBT-51: the bytes read at load time, so a file moved on disk after
    // picking cannot fail the export (the browser rejects a second read).
    const sourceBytes = fileBytesRef.current ?? sourceFile;
    const ticket = exportRun.begin();
    activeExportSpeculativeRef.current = speculative;
    if (!speculative) {
      lifecycleDispatch({ type: 'EXPORT_STARTED', announcement: t.writingSignaturesIntoPdf });
      reportToolLifecycleEvent('tool_operation_started', 'sign');
      recordAction('export');
    }
    const exportStartedAt = performance.now();
    // beaconMaintenanceTransport sends only in production builds (the gate is in sendBeacon).
    const telemetryTransport = beaconMaintenanceTransport;

    try {
      const { signPdf } = await import('./lib/sign.js');
      const signedBlob = await signPdf(sourceBytes, elements, (p: number) => {
        if (!speculative && ticket.isCurrent()) lifecycleDispatch({ type: 'EXPORT_PROGRESSED', progress: p });
      });
      if (!ticket.isCurrent()) return;
      ticket.settle();
      if (!speculative) {
        reportMaintenanceEvent(signExportSucceeded(performance.now() - exportStartedAt), telemetryTransport);
        reportToolLifecycleEvent('tool_result_ready', 'sign');
      }
      onSigned(signedBlob, signedFileName(sourceFile.name));
    } catch (err) {
      if (!ticket.isCurrent()) return;
      ticket.settle();
      if (speculative) {
        console.error(err);
        return;
      }
      reportError('sign_export', err, 'export');
      reportMaintenanceEvent(signExportFailed(performance.now() - exportStartedAt, err), telemetryTransport);
      reportToolLifecycleEvent('tool_operation_failed', 'sign');
      console.error(err);
      // ENC-07: the load gate should have caught a protected file, so this is reported above (a gate
      // miss), but the person gets the way on rather than a retry that can never work.
      if (isEncryptedPdfError(err)) {
        lifecycleDispatch({ type: 'EXPORT_NEEDS_UNLOCK', announcement: t.protectedOwnerOnlyTitle });
        return;
      }
      const detail = describeSignFailure(err, t);
      lifecycleDispatch({ type: 'EXPORT_FAILED', detail, announcement: `${t.signingStoppedLabel} ${detail}` });
    }
  };

  // Apply signing and prepare the PDF for sharing or downloading.
  const handleSavePdf = () => runExport((signedBlob, filename) => {
    const made = { blob: signedBlob, name: filename, revision: documentRevisionRef.current };
    if (prepare(signedBlob, filename)) {
      preparedExportRef.current = made;
      // navigator.share() needs a fresh user activation. PDF generation is
      // asynchronous, so retain the File and let the next tap open the
      // native share sheet instead of risking a browser-blocked request.
      lifecycleDispatch({ type: 'EXPORT_FINISHED', signedExport: made, announcement: t.signedPdfReadyToShare });
      return;
    }

    recordAction('download');
    download(signedBlob, filename);
    lifecycleDispatch({ type: 'EXPORT_FINISHED', announcement: t.pdfSignedDownloadStarted });
  });

  const handleDownloadPdf = () => {
    lifecycleDispatch({ type: 'EXPORT_ERROR_CLEARED' });
    if (downloadPrepared()) {
      recordAction('download');
      lifecycleDispatch({
        type: 'EXPORT_DELIVERED',
        signedExport: exportAtRevision(preparedExportRef.current, documentRevisionRef.current),
        announcement: t.downloadStarted,
      });
      return;
    }

    void runExport((signedBlob, filename) => { // reason: runExport catches its own failure and shows it
      recordAction('download');
      download(signedBlob, filename);
      lifecycleDispatch({
        type: 'EXPORT_FINISHED',
        signedExport: { blob: signedBlob, name: filename, revision: documentRevisionRef.current },
        announcement: t.pdfSignedDownloadStarted,
      });
    });
  };

  const handleSharePdf = async () => {
    const result = await sharePrepared();
    if (result.status === 'shared') {
      recordAction('share');
      lifecycleDispatch({
        type: 'EXPORT_DELIVERED',
        signedExport: exportAtRevision(preparedExportRef.current, documentRevisionRef.current),
        announcement: t.pdfSignedSuccessfully,
      });
    } else if (result.status === 'canceled') {
      setAnnouncement(t.sharingCanceledStillReady);
    } else if (result.status === 'error') {
      console.error(result.error);
      setAnnouncement(t.shareOpenFailed);
    }
  };

  // Carries a signed export to another tool through the one-shot hand-off baton
  // (draftStore's saveHandoff, taken by useHandoffIntake on the other end), as Redact does.
  const carryOn = async (tool: string, current: SignedExport) => {
    try {
      await sendHandoff(
        tool,
        { fileName: current.name, fileType: 'application/pdf', fileBytes: await current.blob.arrayBuffer() },
        { href: handoffHref(tool, window.location.pathname) },
      );
    } catch (err) {
      // expected: saveHandoff reports its own failure, this shows the quiet line
      console.error(err);
      lifecycleDispatch({ type: 'HANDOFF_FAILED' });
      setHandoffBusy(false);
    }
  };

  // The chips show whenever export is ready. A file already made for this revision
  // (a download, or the prepared share file) goes straight on; otherwise the export
  // runs first, without downloading, and its result is handed on.
  const requestHandoff = async (tool: string) => {
    if (handoffBusy) return;
    setHandoffBusy(true);
    const ready = exportToHandOff(signedExport, preparedExportRef.current, documentRevisionRef.current);
    lifecycleDispatch({ type: 'HANDOFF_REQUESTED', ready });
    if (ready) {
      await carryOn(tool, ready);
      return;
    }
    let handedOn = false;
    await runExport((signedBlob, filename) => {
      handedOn = true;
      const made = { blob: signedBlob, name: filename, revision: documentRevisionRef.current };
      lifecycleDispatch({ type: 'EXPORT_FINISHED', signedExport: made });
      void carryOn(tool, made); // reason: carryOn catches its own failure and shows the hand-off error
    });
    // A failed or superseded export hands nothing on: runExport shows its own error.
    if (!handedOn) setHandoffBusy(false);
  };

  // Whether the current elements contain text no bundled font can draw. Mirrors
  // PdfWorkspace's own computation (getSignExportReadiness is pure over
  // `elements`); duplicated here rather than lifted up, since threading it
  // down as a prop would only be to satisfy this one background effect.
  const exportReadiness = useMemo(() => getSignExportReadiness(elements), [elements]);

  // MOBI-07: once at least one element is placed, speculatively re-export on a
  // debounced idle so the Share button is already in its ready state by the
  // time the user reaches for it, instead of making them tap once to
  // generate and again to share. Gated on `status === 'editing'` so this
  // never fires mid-load, mid-sign, or while a load error is showing, and on
  // `!exportReadiness.blocked` so it never burns CPU on a run that would be
  // refused anyway. Depending on `documentRevision` (not a raw elements
  // reference) means this can only ever fire after a gesture has committed
  // its one state update on release - never while a drag/resize/create is
  // still live, per the gesture golden rule - and re-fires on every later
  // edit, letting each speculative export invalidate the previous one.
  useEffect(() => {
    if (!file || !signExportReady({ status, elementCount: elements.length, blocked: exportReadiness.blocked })) return;
    const timer = setTimeout(() => {
      void runExport((signedBlob, filename) => { // reason: runExport catches its own failure and shows it
        if (prepare(signedBlob, filename)) preparedExportRef.current = { blob: signedBlob, name: filename, revision: documentRevisionRef.current };
      }, { speculative: true });
    }, SPECULATIVE_EXPORT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, documentRevision, exportReadiness.blocked, status]);

  const hasFiles = !!file;

  return (
    <BasePdfTool
      hasFiles={hasFiles}
      onFilesAdded={handleFilesAdded}
      intake={{ multiple: false }}
      identity={{
        // Editor-mode shell draws no preview; the shell uses it to count a replacement (DEBT-58).
        file,
        label: file?.name,
        meta: describeFile(file, numPages, isFullscreenActive ? currentPage : null, shellMessages),
      }}
      empty={{
        art: <SignVerb />,
        // MOBI-09: iOS has no Web Share Target, so the Android share-sheet path
        // the rest of this tool's mobile handling assumes doesn't exist there.
        // Scoped to Sign only, per the ticket - Sign is where the "someone
        // shared me a form over WhatsApp/Mail" case actually lands.
        iosFilesHint: true,
      }}
      draft={{ saveState: draftSaveState, checking: isRestoring }}
      analytics={{ tool: 'sign' }}
      owns={{ shell: true }}
      shellMessages={shellMessages}
    >
      {needsUnlock && (
        <NeedsUnlock
          kind={needsUnlock}
          file={file}
          bytes={sourceBytes}
          from="sign"
          toolName="Sign"
          verb="sign"
          messages={{
            title: needsUnlock === 'needs-password' ? t.protectedNeedsPasswordTitle : t.protectedOwnerOnlyTitle,
            body: needsUnlock === 'needs-password' ? t.protectedNeedsPasswordBody : t.protectedOwnerOnlyBody,
            unlockIt: t.protectedUnlockIt,
            handoffFailed: t.protectedHandoffFailed,
          }}
        />
      )}

      {!needsUnlock && hasFiles && status !== 'loading' && (
          <SavedSignaturesContext.Provider
            value={{ savedSignatures, activeSignature, setActiveSignature, onDeleteSavedSignature: deleteSavedSignature }}
          >
            {/* Fill mode (SNG-15): the workspace, its gestures and the
                toolbar all read this through useFill(). Off (`FILL_OFF`)
                keeps every consumer on production's current behaviour -
                see FillContext.tsx and docs/sign-fill-mode.md. */}
            <FillContext.Provider value={enabled ? fillContextValue : FILL_OFF}>
              <PdfWorkspace
                status={status}
                errorDetail={errorDetail}
                fieldNavigation={fieldNavigation}
                messages={t}
                document={{ numPages, pageSizes, formRegions, pdfDocument }}
                refs={{ workspace: workspaceRef, pageWrappers: pageWrapperRefs }}
                fullscreen={{ isPseudo: isPseudoFullscreen, active: isFullscreen, toggle: toggleFullscreen }}
                history={{ log: logAction, undo: undoLast, redo: redoLast }}
                output={{ save: handleSavePdf, download: handleDownloadPdf, share: handleSharePdf, canShare: canSharePdf, shareReady }}
                handoff={{
                  exportReady: handoffBusy || signExportReady({ status, elementCount: elements.length, blocked: exportReadiness.blocked }),
                  busy: handoffBusy,
                  failed: handoffFailed,
                  onHandoff: (tool) => { void requestHandoff(tool); /* reason: requestHandoff catches its own failure and shows the hand-off error */ },
                }}
                signature={{ hold: setTempPlacement, showDialog: setDialogOpen, placeAt: placeSignatureAt }}
                announce={setAnnouncement}
              />
            </FillContext.Provider>
          </SavedSignaturesContext.Provider>
      )}

      {/* No loading-state message: pdf.js parses fast enough that a text block
          here just added its own undersized-then-replaced flicker (see
          Workspace.module.css's fade-in on .workspace, which softens the real
          jump from nothing to a loaded document instead). */}

      {/* Signature Creation Modal Component */}
      <SignatureDialog
        isOpen={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setTempPlacement(null);
        }}
        onSaveSignature={handleAddSignatureElement}
        messages={messages}
      />

      <ConfirmDialog
        open={!!signatureToDelete}
        titleId="confirm-delete-title"
        title={t.deleteSignatureConfirmTitle}
        confirmLabel={t.deleteSignatureLabel}
        // LOC-16: Cancel/Close read from the shared shell catalogue
        // (ShellMessages), same as before - title/confirm/body now read from
        // SignMessages instead of staying hardcoded English.
        cancelLabel={shellMessages?.cancel}
        closeLabel={shellMessages?.closeDialog}
        onCancel={cancelDelete}
        onConfirm={proceedDeleteSignature}
      >
        {t.deleteSignatureConfirmBody}
      </ConfirmDialog>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </BasePdfTool>
  );
}
