import { useReducer, useRef, useMemo, useCallback } from 'preact/hooks';
import type {
  EditorElement,
  SignToolType,
} from '#editor/model/editorModel.ts';
import BasePdfTool from '#shell/BasePdfTool.tsx';
import { withIslandBoundary } from '#lib/telemetry/IslandErrorBoundary.tsx';
import SignVerb from './verb/SignVerb.tsx';
import NeedsUnlock from '#shell/NeedsUnlock.tsx';
import { englishSignMessages } from './messages';
import type { SignMessages } from '#editor/registry/messages.ts';
import type { ShellMessages } from '#shell/shellMessages.ts';
import { SignToolProvider, useDocumentStyle, useSignTool } from './components/SignToolContext.tsx';
import { SavedSignaturesContext } from './components/SavedSignaturesContext.tsx';
import PdfWorkspace from './components/PdfWorkspace.tsx';
import SignatureDialog from './components/SignatureDialog.tsx';
import { pageGeometryFromPdfJsPage } from '#editor/geometry/coords.ts';
import { DEFAULT_INK_COLOR } from '#editor/model/signGeometry.js';
import { useEditorFileSession } from '#editor-ui/hooks/useEditorFileSession.ts';
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
import { useSignaturePlacement } from './hooks/useSignaturePlacement.ts';
import { useSignExport } from './hooks/useSignExport.ts';
import { useSpeculativeExport } from './hooks/useSpeculativeExport.ts';
import { useSavedSignatures } from './hooks/useSavedSignatures.ts';
import { isEditorElement } from '#editor/registry/draftValidation.ts';
import { getAppStyle } from '#editor/workspace/preferenceStore.ts';
import { usePdfShare } from '#lib/output/usePdfShare.js';
import { useHoldUpdate } from '#lib/hooks/useHoldUpdate.ts';
import { getSignExportReadiness } from './lib/signExportReadiness.ts';
import ConfirmDialog from '#shell/ConfirmDialog.tsx';
import { describeFile } from '#lib/text/format.js';
import { initialSignLifecycleState, signLifecycleReducer } from './state/signState.ts';
import { signExportReady, type SignedExport } from './lib/exportHandoff.ts';

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
  // ENC-07: a protected PDF is a precondition, not a failure. Set by the load gate (or the export
  // belt) and shown as NeedsUnlock (src/shell/NeedsUnlock.tsx), reset whenever a new file is chosen.
  const share = usePdfShare();
  const { canSharePdf, shareReady, prepare, clearPrepared } = share;
  // The last signed export of the document as it stands (the Compress it / Redact it
  // hand-offs carry it on), and the most recent one prepared for sharing, which the
  // Download and Share taps promote to it. Both retire with the document revision.
  const preparedExportRef = useRef<SignedExport | null>(null);

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

  const { dialogOpen, setDialogOpen, setTempPlacement, placeSignatureAt, handleAddSignatureElement, closeDialog } = useSignaturePlacement({
    dispatch, elements, style, pageWrapperRefs, logAction, setAnnouncement, saveNewSignature, setActiveSignature, messages: t,
  });

  useSignKeyboard({
    dispatch, elements, activeElementId, editingElementId, fieldNavigation, enabled, logAction, setAnnouncement, messages: t,
  });

  useElementClipboard({ dispatch, elements, activeElementId, logAction, setAnnouncement, messages: t });

  const { runExport, handleSavePdf, handleDownloadPdf, handleSharePdf, requestHandoff, handoffBusy } = useSignExport({
    file, fileBytesRef, elements, exportRun, activeExportSpeculativeRef, documentRevisionRef, preparedExportRef,
    signedExport, share, lifecycleDispatch, setAnnouncement, messages: t,
  });

  // Whether the current elements contain text no bundled font can draw. Mirrors
  // PdfWorkspace's own computation (getSignExportReadiness is pure over
  // `elements`); duplicated here rather than lifted up, since threading it
  // down as a prop would only be to satisfy this one background effect.
  const exportReadiness = useMemo(() => getSignExportReadiness(elements), [elements]);

  // MOBI-07: re-export in the background once idle (hooks/useSpeculativeExport.ts).
  useSpeculativeExport({
    file, status, elementCount: elements.length, documentRevision, blocked: exportReadiness.blocked,
    runExport, prepare, preparedExportRef, documentRevisionRef,
  });

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
        onClose={closeDialog}
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
