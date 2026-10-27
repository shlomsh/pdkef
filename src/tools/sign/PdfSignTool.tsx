import { useState, useReducer, useRef, useEffect, useMemo, useCallback } from 'preact/hooks';
import type {
  EditorElement,
  SignatureElement,
  SignToolType,
} from '../../editor/model/editorModel.ts';
import type { SavedSignature } from '../../editor/model/savedSignature.ts';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import { withIslandBoundary } from '../../lib/IslandErrorBoundary.tsx';
import SignVerb from './verb/SignVerb.tsx';
import NeedsUnlock from '../../shell/NeedsUnlock.tsx';
import { englishSignMessages } from './messages';
import { signElementTypeLabel } from '../../editor/registry/signLabels';
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
import { toggleWorkspaceFullscreen, useFullscreenChange } from '../../editor-ui/hooks/workspaceFullscreen.ts';
import { recordAction } from '../../lib/actionTrail.ts';
import useFormFieldRegions from './hooks/useFormFieldRegions.ts';
import useFieldNavigation from './hooks/useFieldNavigation.ts';
import useCoarsePointer from '../../editor-ui/hooks/useCoarsePointer.ts';
import { isFillMode } from './lib/fill/fillMode.ts';
import { viewportContent, zoomsOnFocus } from './lib/fill/viewportZoomLock.ts';
import { freeSlotKey } from './lib/fill/fillSlots.ts';
import { FillContext, FILL_OFF, type FillContextValue } from './components/fill/FillContext.tsx';
import { useFillFocus } from './hooks/fill/useFillFocus.ts';
import type { PagePoint } from './lib/fill/fillTypes.ts';
import { isEditorElement } from '../../editor/registry/draftValidation.ts';
import {
  getAppStyle,
  getSavedSignatures,
  setSavedSignatures as persistSavedSignatures,
  subscribeToSavedSignatures,
} from '../../editor/workspace/preferenceStore.ts';
import {
  captureAddedElement,
  captureElementSnapshots,
  createActionEntry,
  type HistoryLogger,
} from '../../editor/model/actionHistory.ts';
import { useHistoryShortcuts } from '../../lib/history/useHistoryShortcuts.js';
import { usePdfShare } from '../../lib/usePdfShare.js';
import { useHoldUpdate } from '../../lib/useHoldUpdate.ts';
import { useLatestRun } from '../../lib/useLatestRun.ts';
import { getSignExportReadiness } from './lib/signExportReadiness.ts';
import { reportToolLifecycleEvent } from '../../lib/productAnalytics.ts';
import {
  reportMaintenanceEvent,
  signExportFailed,
  signExportSucceeded,
  signFormDetectionCompleted,
  signFormDetectionFailed,
  signFormDetectionNotStarted,
  signFormDetectionUnavailable,
  beaconMaintenanceTransport,
} from '../../lib/maintenanceTelemetry.ts';
import ConfirmDialog from '../../shell/ConfirmDialog.tsx';
import { describeFile } from '../../lib/format.js';
import useCurrentPage from '../../editor-ui/hooks/useCurrentPage.js';
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
  const [signatureToDelete, setSignatureToDelete] = useState<string | null>(null);
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

  // Fill mode (SNG-15), opt-in on `?next=1` alone (docs/sign-fill-mode.md).
  // Read once, lazily, rather than on every render: the island is
  // prerendered (output: 'static'), so `window` may not exist yet, and the
  // flag must not flip mid-session once a real `window.location.search` is
  // available on hydration.
  const [enabled] = useState(() => typeof window !== 'undefined' && isFillMode(window.location.search));
  const coarse = useCoarsePointer();
  const [aimedKey, setAimedKey] = useState<string | null>(null);
  const [freeAt, setFreeAt] = useState<PagePoint | null>(null);
  const [pendingFocusKey, setPendingFocusKey] = useState<string | null>(null);
  const proxyRef = useRef<HTMLInputElement>(null);

  // The workspace builds the free slot from `freeAt` with the typography a new text
  // box takes; its key comes from the point alone, so focus can be queued now.
  const openFreeSlot = useCallback((at: PagePoint) => {
    setFreeAt(at);
    setPendingFocusKey(freeSlotKey(at));
  }, []);

  const closeFreeSlot = useCallback(() => setFreeAt(null), []);

  // SNG-17: iOS zooms the page in on any focused field under 16px and never
  // zooms back, which leaves the toolbar off screen; in fill mode nearly every
  // tap focuses a field. `maximum-scale=1` stops that zoom-on-focus, while iOS
  // still honours the person's own pinch (measured 2026-09-26: iOS 26
  // Simulator in Safari, and Shlomi's iPhone in Chrome). Fill mode only, at
  // runtime, on iOS only, so production's static viewport meta is untouched.
  //
  // Zoomed in, iOS re-zooms every focused field to its own 16px level, so
  // `viewportContent` holds the limits at the person's pinch instead
  // (SNG-17). They follow the pinch once it settles: `visualViewport`'s
  // 'resize' fires through the gesture, and the meta is rewritten only after
  // it goes quiet.
  useEffect(() => {
    if (!enabled || !zoomsOnFocus(navigator)) return undefined;
    const meta = document.querySelector('meta[name="viewport"]');
    const original = meta?.getAttribute('content') ?? '';
    let pinching = false;
    const apply = () => {
      const next = viewportContent(original, window.visualViewport?.scale ?? 1, pinching);
      if (meta?.getAttribute('content') !== next) meta?.setAttribute('content', next);
    };
    let settle: ReturnType<typeof setTimeout> | undefined;
    const applyWhenSettled = () => {
      clearTimeout(settle);
      settle = setTimeout(apply, 250);
    };
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length < 2) return;
      pinching = true;
      clearTimeout(settle);
      apply();
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (!pinching || event.touches.length > 0) return;
      pinching = false;
      applyWhenSettled();
    };
    apply();
    window.visualViewport?.addEventListener('resize', applyWhenSettled);
    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
    document.addEventListener('touchcancel', onTouchEnd, { capture: true, passive: true });
    return () => {
      clearTimeout(settle);
      window.visualViewport?.removeEventListener('resize', applyWhenSettled);
      document.removeEventListener('touchstart', onTouchStart, { capture: true });
      document.removeEventListener('touchend', onTouchEnd, { capture: true });
      document.removeEventListener('touchcancel', onTouchEnd, { capture: true });
      meta?.setAttribute('content', original);
    };
  }, [enabled]);

  useFillFocus({
    enabled,
    dispatch,
    textOf: (elementId) => {
      const element = elements.find((el) => el.id === elementId);
      return element?.type === 'text' ? element.text : undefined;
    },
  });

  const fillContextValue = useMemo<FillContextValue>(() => ({
    enabled,
    coarse,
    aimedKey,
    setAimedKey,
    freeAt,
    openFreeSlot,
    closeFreeSlot,
    pendingFocusKey,
    setPendingFocusKey,
    proxyRef,
  }), [enabled, coarse, aimedKey, freeAt, openFreeSlot, closeFreeSlot, pendingFocusKey]);

  // Saved signatures and active signature state
  const [savedSignatures, setSavedSignatures] = useState<SavedSignature[]>([]);
  const [activeSignature, setActiveSignature] = useState<SavedSignature | null>(null);

  // Refs
  // Live DOM nodes for each page wrapper, read imperatively at event time (e.g.
  // placeSignatureAt reads getBoundingClientRect to size a dropped signature).
  // These are NOT passed to overlay elements for sizing — each element measures its
  // own container via the DOM instead (see DraggableOverlayElement), so there's no
  // render-time dependency on this array being populated yet.
  const pageWrapperRefs = useRef<(HTMLDivElement | null)[]>([]);
  const copiedElementRef = useRef<EditorElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  // Whether the export currently tracked by `exportRun` is a
  // background speculative one (MOBI-07) rather than a real, user-initiated
  // one. The invalidation effect below reads this to decide whether getting
  // superseded is user-visible news or routine background churn.
  const activeExportSpeculativeRef = useRef(false);
  const documentRevisionRef = useRef(documentRevision);
  documentRevisionRef.current = documentRevision;
  // An export is only wanted while the file and revision it started from are still on screen.
  const exportRun = useLatestRun(() => [file, documentRevisionRef.current]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [tempPlacement, setTempPlacement] = useState<PendingSignaturePlacement | null>(null);
  const isFullscreenActive = isFullscreen || isPseudoFullscreen;
  const currentPage = useCurrentPage({
    active: isFullscreenActive,
    rootRef: workspaceRef,
    pageRefs: pageWrapperRefs,
    numPages,
  });

  // Track fullscreen state (also covers exiting via Esc, not just our own button)
  useFullscreenChange(workspaceRef, setIsFullscreen);

  // pdf.js owns worker and document resources outside Preact. Release the
  // active one when the editor leaves the tree, rather than letting a late
  // loading/render completion write into an unmounted workspace.
  useEffect(() => () => {
    exportRun.invalidate();
  }, []);

  // A prepared export is only valid for the current annotation state. An edit
  // also revokes a PDF currently being generated: its completion must not make
  // an older version available for download or sharing.
  useEffect(() => {
    clearPrepared();
    preparedExportRef.current = null;
    lifecycleDispatch({ type: 'EXPORT_RETIRED' });
    // Retires the export in flight (if any) and says whether one was live.
    const wasLive = exportRun.invalidate();
    if (!wasLive) return;
    // A speculative background export getting superseded by a further edit is
    // routine (MOBI-07) - it never surfaced as "preparing" in the first place,
    // so silently discarding it (runExport's own guards handle that) is
    // correct. Only a real, user-initiated export in flight is worth telling
    // the user their edit invalidated it.
    if (activeExportSpeculativeRef.current) return;
    lifecycleDispatch({ type: 'EXPORT_INTERRUPTED', announcement: t.editsChangedWhilePreparing });
  }, [file, documentRevision, clearPrepared, exportRun]);

  const toggleFullscreen = () => toggleWorkspaceFullscreen(workspaceRef.current, isPseudoFullscreen, setIsPseudoFullscreen);

  const logAction: HistoryLogger<EditorElement> = (operation, type, pageIndex, description, snapshots) => {
    dispatch({
      type: 'ADD_ACTION_HISTORY',
      payload: createActionEntry({ operation, type, pageIndex, description, elements: snapshots })
    });
  };

  // Cmd/Ctrl+Z, and the toolbar's Undo: undo the single most recently logged
  // action (see actionHistory.ts).
  const undoLast = () => {
    if (actionHistory.length === 0) return;
    const lastAction = actionHistory[0];
    dispatch({ type: 'UNDO' });
    recordAction('undo');
    setAnnouncement(formatMessage(t.undidActionTemplate, { description: lastAction.description }));
  };

  // Shift+Cmd/Ctrl+Z, Ctrl+Y, and the toolbar's Redo: redo the single most
  // recently undone action (see historyStack.ts). The exact mirror of
  // undoLast above.
  const redoLast = () => {
    if (redoHistory.length === 0) return;
    const nextAction = redoHistory[0];
    dispatch({ type: 'REDO' });
    recordAction('redo');
    setAnnouncement(formatMessage(t.redidActionTemplate, { description: nextAction.description }));
  };
  useHistoryShortcuts(undoLast, redoLast);

  // Load saved signatures from workspace preferences on mount.
  useEffect(() => {
    const stored = getSavedSignatures();
    if (stored) {
      setSavedSignatures(stored);
      if (stored.length > 0) {
        setActiveSignature(stored[0]);
      }
    }
  }, []);

  // Storage events are only delivered to the *other* same-user tabs. Local
  // interactions update state directly; these subscriptions apply the store's
  // revision-ordered last-writer-wins result everywhere else.
  useEffect(() => {
    const stops = [
      subscribeToSavedSignatures(({ value }) => {
        const next = value ?? [];
        setSavedSignatures(next);
        setActiveSignature((current) => next.find((signature) => signature.id === current?.id) ?? next[0] ?? null);
      }),
    ];
    return () => stops.forEach((stop) => stop());
  }, []);

  // Save new signature to list & localStorage
  const saveNewSignature = (dataUrl: string, aspectRatio: number) => {
    const newSig = {
      id: `sig-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      dataUrl,
      aspectRatio
    };
    const updated = [newSig, ...savedSignatures].slice(0, 10);
    setSavedSignatures(updated);
    const persisted = persistSavedSignatures(updated);
    return { signature: newSig, persisted };
  };

  // Confirm delete saved signature
  const deleteSavedSignature = (id: string, event?: Event) => {
    event?.stopPropagation();
    setSignatureToDelete(id);
  };

  const proceedDeleteSignature = () => {
    if (!signatureToDelete) return;
    const updated = savedSignatures.filter((sig) => sig.id !== signatureToDelete);
    setSavedSignatures(updated);
    const persisted = persistSavedSignatures(updated);
    if (activeSignature && activeSignature.id === signatureToDelete) {
      const fallback = updated.length > 0 ? updated[0] : null;
      setActiveSignature(fallback);
      if (!fallback && selectedTool === 'signature') {
        setSelectedTool(null);
      }
    }
    setSignatureToDelete(null);
    setAnnouncement(persisted
      ? t.signatureDeleted
      : t.signatureDeletedNotSaved);
  };

  // Printed grids and free-text cells on the loaded form, so placing a text
  // box on one takes its span and cell count instead of needing a
  // side-handle drag (MOBI-04), or at least starts centred on the field
  // instead of wherever the tap landed (MOBI-11). Needs the same pdf.js
  // document PdfWorkspace already renders pages from, for the page's text.
  const formRegions = useFormFieldRegions(sourceBytes, numPages, pdfDocument);

  // FORM-11: one anonymous maintenance event per document, when that walk
  // finishes. Reported from here rather than from inside the hook because
  // this file already owns the boundary and its production-only transport
  // (see runExport below), and a detector that keeps working is better
  // evidenced by an aggregate than by waiting for the next bug report - a
  // total detection failure once shipped and nothing noticed
  // (useFormFieldRegions.wiring.test.js).
  //
  // What travels: a bucketed count and the first page's kind (text, vector,
  // image or none, off a closed list), or an error code off a closed list. No
  // labels, no filename, no page count, no bytes - maintenanceTelemetry.ts is
  // the only thing that may describe an event and it cannot express them.
  // `pending` is not an outcome, so it reports nothing; every other state
  // fires once, because `formRegions` is state and only changes when the walk
  // starts over for a different file.
  useEffect(() => {
    if (formRegions.detection === 'pending') return;
    const transport = beaconMaintenanceTransport;
    const detectionEvent = () => {
      // Four outcomes, four signals. A run that never started, a detector
      // that never loaded (a stale cached shell after a deploy) and a
      // detector that ran and threw are the same blank editor, and want
      // three different fixes.
      if (formRegions.detection === 'not-started') return signFormDetectionNotStarted();
      if (formRegions.detection === 'unavailable') return signFormDetectionUnavailable();
      if (formRegions.detection === 'failed') return signFormDetectionFailed(formRegions.detectionError);
      return signFormDetectionCompleted(
        formRegions.combs.length + formRegions.cells.length + formRegions.checkboxes.length,
        formRegions.pageKind,
      );
    };
    reportMaintenanceEvent(detectionEvent(), transport);
  }, [formRegions]);

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

  // Delete placed element
  const deleteElement = (id: string) => {
    const el = elements.find(e => e.id === id);
    const snapshots = captureElementSnapshots(elements, (element) => element.id === id);
    dispatch({ type: 'DELETE_ELEMENT', payload: id });
    recordAction('delete_mark');
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
    if (el) logAction('delete', 'DELETE_ELEMENT', el.pageIndex, formatMessage(t.deletedElementDescriptionTemplate, { label: signElementTypeLabel(t, el.type) }), snapshots);
    setAnnouncement(t.removedElement);
  };

  // Global keyboard shortcuts (Escape, Undo, Delete)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape unwinds one level at a time: out of the text box first, then out
      // of the selection and tool. Collapsing both into one press would make it
      // impossible to go from typing to "this box is selected", which is the
      // state Backspace-to-delete needs.
      if (e.key === 'Escape') {
        if (editingElementId) {
          dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: null });
          (document.activeElement as HTMLElement | null)?.blur();
          setAnnouncement(t.finishedEditingHint);
          return;
        }
        dispatch({ type: 'SET_TOOL', payload: null });
        dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
        (document.activeElement as HTMLElement | null)?.blur();
        return;
      }

      const tag = document.activeElement?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA';

      // Tab / Shift+Tab move field-to-field - the desktop equivalent of the
      // phone's Next/Previous control (MOBI-06). Gated on `activeElementId`,
      // the same tier Backspace/Delete below are on rather than requiring an
      // open edit session: a field a single click has only selected, not yet
      // opened for typing, is exactly the state a plain Tab into the next
      // control would otherwise leave with no visible effect, which read as
      // "Tab does nothing" (this fires with the caret live in the field too,
      // since `editingElementId` set implies `activeElementId` is the same
      // id). With nothing selected at all it does not fire, same as Enter/
      // Backspace, so it never pre-empts the browser's native tab order while
      // tabbing through the toolbar's own buttons. Falling through without
      // calling preventDefault when there is nowhere left to go
      // (hasNext/hasPrevious false) leaves Tab free to leave the field the
      // ordinary way, same as reaching the end of any other web form.
      //
      // Off in fill mode (docs/sign-fill-mode.md): every fill input is a
      // real, focusable element already in reading order, so native Tab
      // needs no help finding the next one - this handler would otherwise
      // fight the browser's own order with `fieldOrder.ts`'s.
      if (!enabled && e.key === 'Tab' && activeElementId) {
        const goingForward = !e.shiftKey;
        if (goingForward ? fieldNavigation.hasNext : fieldNavigation.hasPrevious) {
          e.preventDefault();
          if (goingForward) fieldNavigation.goToNext(); else fieldNavigation.goToPrevious();
          return;
        }
      }

      // Enter opens an edit session on a selected text box - the keyboard's
      // equivalent of double-clicking it, so text stays reachable without a
      // pointer.
      if (e.key === 'Enter' && activeElementId && !editingElementId && !isInput) {
        const selected = elements.find(el => el.id === activeElementId);
        if (selected?.type === 'text') {
          e.preventDefault();
          dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: activeElementId });
        }
        return;
      }

      // Delete the active element via Backspace/Delete
      if (activeElementId && (e.key === 'Backspace' || e.key === 'Delete')) {
        if (isInput) return;
        e.preventDefault();
        deleteElement(activeElementId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // fieldNavigation is a plain object rebuilt every render (like
    // useWorkspaceGestures's handlers), so listing it here re-subscribes on
    // every render rather than risking a stale hasNext/hasPrevious closure -
    // cheap next to what a Tab press silently doing the wrong thing would cost.
  }, [activeElementId, editingElementId, elements, fieldNavigation, enabled]);

  // Handle element copy and paste actions
  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
        const activeInput = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
        const selStart = activeInput.selectionStart;
        const selEnd = activeInput.selectionEnd;
        if (selStart !== selEnd) {
          return;
        }
      }

      if (!activeElementId) return;
      const elToCopy = elements.find((el) => el.id === activeElementId);
      if (elToCopy) {
        copiedElementRef.current = elToCopy;
        const textRepresentation = elToCopy.type === 'text' ? elToCopy.text : `[${elToCopy.type}]`;
        if (e.clipboardData) {
          e.clipboardData.setData('text/plain', textRepresentation);
        }
        e.preventDefault();
        setAnnouncement(t.copiedElement);
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
        return;
      }

      if (!copiedElementRef.current) return;
      e.preventDefault();

      const id = uniqueId();
      const original = copiedElementRef.current;
      const clone: EditorElement = original.type === 'line'
        ? {
            ...original,
            id,
            x1: Math.min(100, original.x1 + 4),
            y1: Math.min(100, original.y1 + 4),
            x2: Math.min(100, original.x2 + 4),
            y2: Math.min(100, original.y2 + 4),
          }
        : {
            ...original,
            id,
            left: Math.min(90, original.left + 4),
            top: Math.min(90, original.top + 4),
          };

      dispatch({ type: 'ADD_ELEMENT', payload: clone });
      dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: id });
      logAction('add', 'DUPLICATE_ELEMENT', original.pageIndex, formatMessage(t.duplicatedElementDescriptionTemplate, { label: signElementTypeLabel(t, original.type) }), [captureAddedElement(clone, elements.length)]);
      setAnnouncement(t.pastedElement);
    };

    window.addEventListener('copy', handleCopy);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('copy', handleCopy);
      window.removeEventListener('paste', handlePaste);
    };
  }, [activeElementId, elements]);

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
        onCancel={() => setSignatureToDelete(null)}
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
