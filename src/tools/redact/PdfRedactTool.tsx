import { useState, useReducer, useRef, useEffect, useCallback } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import PdfPageCanvas from '../../editor-ui/PdfPageCanvas.tsx';
import { uniqueId, seedUniqueId } from '../../editor/model/ids.ts';
import { loadPdf as loadEditorPdf } from '../../editor/workspace/loadPdf.ts';
import { cacheRecentFile } from '../../lib/drafts/draftStore.js';
import { startGesture } from '../../lib/gestures/controller.ts';
import usePdfCoordinates from '../../editor-ui/hooks/usePdfCoordinates.js';
import { redactionDrawingPreviewStyle, renderRedactionDrawingPreviewContent } from '../../editor/registry/redactionSurface.ts';
import { useEditorDraftPersistence, type EditorDraftInitialState } from '../../editor/workspace/useEditorDraftPersistence.ts';
import { isDraftElement } from '../../editor/registry/draftValidation.ts';
import { getAppStyle, rememberAppStyle, getEditorPreference } from '../../editor/workspace/preferenceStore.ts';
import useDeleteTool from './useDeleteTool.ts';
import useRedactCommands from './useRedactCommands.ts';
import RedactToolbar from './RedactToolbar.tsx';
import EditorExportActions from '../../editor-ui/EditorExportActions.tsx';
import RedactBox from './RedactBox.tsx';
import usePeekAll from './usePeekAll.ts';
import BrushLayer, { type CommittedStroke } from './BrushLayer.tsx';
import { resolveWhiteoutColor, resolveRedactBlurStrength } from './redactStyle.ts';
import BrushControls, { brushStyleOf, resolveBrush, useEyedropper, type BrushSettings } from './BrushControls.tsx';
import { checkBoxesFromElements } from './check/checkBoxes.ts';
import type { DocumentStyle } from '../../editor/model/documentStyle.ts';
import usePageSizesPt from './usePageSizesPt.ts';
import DeletableObjectOverlay from './DeletableObjectOverlay.tsx';
import DeleteLift from './DeleteLift.tsx';
import DeleteMarquee from './DeleteMarquee.tsx';
import { groupMembers, repeatCopies } from './repeatGroup.ts';
import { findSetMembers } from './findSet.ts';
import useLinkedBoxes from './useLinkedBoxes.ts';
import type { RedactElement } from './redactElements.ts';
import EditorPageHeader from '../../editor-ui/EditorPageHeader.tsx';
import FindBar, { PRESET_LABELS } from './FindBar.tsx';
import SavedFileCheck from './SavedFileCheck.tsx';
import { ALREADY_GONE, removedMessage, type InPlaceFinding } from './check/checkCopy.ts';
import useSavedFileCheck from './useSavedFileCheck.ts';
import { deletedTerms } from './check/deletedTerms.ts';
import { uncoveredMatches } from './find/findMatches.ts';
import { PRESET_FINDERS, termFinder } from './find/finders.ts';
import type { CheckBox, CheckTerm } from './check/types.ts';
import FindHighlights from './FindHighlights.tsx';
import useFind from './useFind.ts';
import { useTapOutsideDeselect } from './useTapOutsideDeselect.ts';
import type { FindMatch } from './find/types.ts';
import type { ActionHistoryEntry } from '../../editor/model/actionHistory.ts';
import {
  initialRedactState, redactReducer, brushKindOf, isDirty, isFullscreenActive as isFullscreenActiveOf,
  canRedo as canRedoOf, restoredNoteVisible,
} from './state/redactState.ts';
import { type ElementUpdateKind } from '../../editor/model/updateKind.ts';
import { useHistoryShortcuts } from '../../lib/history/useHistoryShortcuts.js';
import { usePdfShare } from '../../lib/usePdfShare.js';
import { useLatestRun } from '../../lib/useLatestRun.ts';
import { useNavigatingAway } from '../../lib/useNavigatingAway.ts';
import ErrorMessage from '../../shell/ErrorMessage.tsx';
import { FileActions } from '../../shell/ToolShell.tsx';
import RedactFinish from './RedactFinish.tsx';
import { finishStatusText, type FinishFacts, type FinishPhase } from './finishState.ts';
import { redactedFileName } from './redactFileName.ts';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import workspaceStyles from '../../editor-ui/Workspace.module.css';
import styles from './PdfRedactTool.module.css';
import { describeFile } from '../../lib/format.js';
import useCurrentPage from '../../editor-ui/hooks/useCurrentPage.js';
import type { RedactToolType } from '../../editor/model/editorModel.ts';
import type { BlurStrength } from '../../editor/model/blurStrength.ts';

// RED-14: RedactElement itself now lives in redactElements.ts (see its
// own comment there for why it isn't just RedactElement, and why that's also
// what lets useDeleteTool.ts/useLinkedBoxes.ts import it without a cycle).

const REDACT_ELEMENT_TYPES: ReadonlySet<string> = new Set<string>(['whiteout', 'blackout', 'blur', 'delete', 'blurStroke', 'whiteoutStroke']);

function isRedactElement(value: unknown): value is RedactElement {
  return isDraftElement(value) && REDACT_ELEMENT_TYPES.has(value.type);
}

/**
 * Labels an update entry in the same voice as `Added ${type} box`. Redact has
 * no text elements, so a `text` kind (which cannot occur here) falls back to
 * the style label rather than going unhandled.
 */
function describeRedactUpdate(kind: ElementUpdateKind, type: string): string {
  if (kind === 'move') return `Moved ${type} box`;
  if (kind === 'resize') return `Resized ${type} box`;
  return `Changed ${type} box color`;
}

type RedactPointerEvent = (MouseEvent | TouchEvent) & { currentTarget: HTMLElement };

// Redact design-review finding #3: one Undo chip, one slot, timed the same as
// Merge's own (PdfMergeTool.tsx's UNDO_WINDOW_MS/registerUndo) - a second
// eligible action before this elapses replaces the first's chip rather than
// stacking a second one.
const UNDO_WINDOW_MS = 5000;

export default function PdfRedactTool() {
  // SNG-08: the island's state lives in redactState.ts; the preferences it
  // starts from are read once, here.
  const [state, dispatch] = useReducer(redactReducer, undefined, () => initialRedactState({
    activeColor: resolveWhiteoutColor(undefined, getAppStyle(), getEditorPreference('lastWhiteoutColor')),
    activeBlurStrength: resolveRedactBlurStrength(undefined, getAppStyle(), getEditorPreference('lastBlurStrength')),
    brush: resolveBrush(undefined, getAppStyle()),
  }));
  const { elements, documentRevision } = state.edits;
  const { activeBoxId, selectedBoxId } = state.selection;
  const { announcement, isPseudoFullscreen } = state.view;
  const { activeStyle, toolLocked, activeColor, activeBlurStrength, brush, eyedropping, drawingState } = state.tool;
  const undoAction = state.edits.undoAction;
  const actionHistory = state.edits.history.past;
  const setAnnouncement = (message: string) => dispatch({ type: 'ANNOUNCED', message });

  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  // A returning person already knows this editor contains saved work. Do not
  // spend the identity row repeating the neutral newcomer tip after that work
  // restores; tool-specific instructions remain available whenever a tool is
  // armed. Manual picks deliberately reset this to the welcoming default.
  const [showWelcomeTip, setShowWelcomeTip] = useState(true);
  // Draft persistence needs an editor-owned baseline, not a guess based on
  // when a File object first appeared. A load/restoration captures the current
  // revision; every real document operation advances it.
  const documentRevisionRef = useRef(documentRevision);
  documentRevisionRef.current = documentRevision;
  // DEBT-18: an export is only wanted while the document it was started from
  // is still the document on screen. Both keys are read fresh on every check,
  // so a file swap or any edit that bumps the revision - including an undo or
  // redo arriving by keyboard while `.is-processing` blocks the pointer -
  // retires the run in flight.
  const exportRun = useLatestRun(() => [file, documentRevisionRef.current]);
  const [status, setStatus] = useState('idle'); // idle | loading | editing | redacting | error
  // Read by the invalidation effect below, which fires after the render that
  // already moved status on (a replacement file sets 'loading' in the same
  // batch as `file`), so it must ask what the workspace is showing now.
  const statusRef = useRef(status);
  statusRef.current = status;
  // Export errors are recoverable without unmounting the editor - status stays
  // 'editing' and this renders alongside the workspace. A failed document load
  // still uses status='error', which unmounts the workspace (see below).
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  // RED-36: an edit retired a running export. Said where it is seen (the
  // status line and the finish row), not only to a screen reader; cleared by
  // the next export or the next file.
  const [exportCancelled, setExportCancelled] = useState(false);
  const [progress, setProgress] = useState(0);
  const { canSharePdf, shareReady, prepare, clearPrepared, download, downloadPrepared, sharePrepared } = usePdfShare();
  const { getPointerPercent } = usePdfCoordinates();

  // activeStyle is null | 'delete' | 'blackout' | 'blur' | 'whiteout'. Null -
  // nothing armed - is the resting state, exactly as it is in the Sign tool: a
  // tool arms for one box and disarms itself once that box is committed, unless
  // it has been locked on. Before this the tool was permanently armed (it even
  // started on Delete), so there was no state in which a drag on the document
  // meant anything but "draw a box" - which on a phone meant the page could not
  // be scrolled.
  //
  // RED-40: the browser-wide preferences are only the last fallback now.
  // RED-32: Box or Brush inside Blur and Whiteout, and the brush's size. Both
  // are remembered like the whiteout colour and become the default for the
  // next document. A brush is not a tool of its own: it is one of these two
  // tools armed in brush mode.
  // RED-32 / RED-40: the brush, whiteout colour and blur strength are document
  // settings. `carried` holds only what this document's owner explicitly chose
  // (it rides in the draft); a document that never chose follows the person's
  // latest choice in any document.
  const { carried } = state.tool;
  const changeBrush = (next: BrushSettings) => {
    dispatch({ type: 'BRUSH_CHOSEN', brush: next, carriedPatch: brushStyleOf(next) });
    rememberAppStyle(brushStyleOf(next));
  };

  // The single entry point for arming: `setTool('blur')` for one box,
  // `setTool('blur', true)` to keep it on. Locking is meaningless without a
  // tool, so disarming always clears it.
  const setTool = (tool: RedactToolType | null, locked = false) => {
    dispatch(tool ? { type: 'TOOL_ARMED', tool, locked } : { type: 'TOOL_DISARMED' });
  };

  // Fired once a placement is committed. A locked tool ignores it and stays
  // armed - the same contract as the Sign reducer's DISARM_TOOL.
  const disarmTool = () => dispatch({ type: 'PLACEMENT_COMMITTED' });
  // The brush is armed when Blur or Whiteout is armed in brush mode. It is the
  // one documented exception to "a tool disarms after one placement": painting
  // takes several strokes, so it stays armed until Stop or Esc.
  const brushKind = brushKindOf(state);
  const drawingPreviewRef = useRef<HTMLDivElement | null>(null);
  const cancelDrawingRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cancelDrawingRef.current?.(), []);

  // RED-40: colour and strength are per-document style, like the brush.
  const rememberColor = (color: string) => {
    dispatch({ type: 'COLOR_CHOSEN', color });
    rememberAppStyle({ whiteoutColor: color });
  };

  useEyedropper(
    eyedropping && brushKind === 'whiteout',
    rememberColor,
    () => dispatch({ type: 'EYEDROPPER_STOPPED' }),
  );
  useEffect(() => {
    if (brushKind !== 'whiteout') dispatch({ type: 'EYEDROPPER_STOPPED' });
  }, [brushKind]);

  const rememberBlurStrength = (strength: BlurStrength) => {
    dispatch({ type: 'BLUR_STRENGTH_CHOSEN', strength });
    rememberAppStyle({ blurStrength: strength });
  };
  // Which existing box shows its delete/resize controls — set on hover (desktop) or
  // on touch/drag interaction (mobile has no hover), so the controls stay hidden
  // otherwise and don't clutter pages full of redaction boxes.
  // Which box shows its whiteout color-picker toolbar. Deliberately a separate,
  // click-driven *sticky* selection (cleared only by clicking elsewhere), not tied to
  // hover like activeBoxId above. ColorPickerMenu's Popover portals its open dropdown
  // to document.body, which is outside the box's DOM subtree — if this were hover-based,
  // moving the mouse from the swatch trigger into the portaled color grid would fire the
  // box's mouseleave and unmount the toolbar (and the open popover with it) before a
  // color could be picked. Mirrors the Sign tool's activeElementId, which is click-set
  // and never cleared on mouseleave for the same reason.
  // RED-31: hold Peek (or Space) to see under every box. View state only.
  const { peekAll, setPeekAll } = usePeekAll();

  // Undo history mirrors the Sign tool's atomic add/delete/update commands
  // (see actionHistory.ts, useHistoryShortcuts.js). Add commands remove
  // their captured elements; delete and clear-page commands restore complete
  // snapshots at their original stacking indexes. Moves, resizes and colour
  // changes are 'update' commands, logged at updateElement's one choke point
  // (UNDO-04).
  //
  // `past`/`future` are src/editor/model/historyStack.ts's own shape, held as
  // one state value rather than two: `future` (newest-undone-first, in-memory
  // only, never persisted) gains entries from any revert of the newest
  // command, or the newest few together, whether that came from the keyboard
  // or the five-second undo chip - historyStack.ts's `revertCommands`
  // decides that from the stack rather than from what the caller intended. A
  // revert from the middle of the stack still clears it, because a later,
  // still-live command's snapshot never accounted for the element coming
  // back. Every place a new command is pushed onto `past` - every call into
  // useRedactCommands' add/remove/update - clears it too.
  //
  // One state value (not `actionHistory`/`redoHistory` as two useState hooks)
  // is what makes every read here `current.past`/`current.future` inside a
  // single functional update, so two undo keydowns landing in the same task
  // (ordinary key auto-repeat, no re-render between them) act on the actual
  // result of each other rather than both reverting the same render-scoped
  // "newest" entry - see applyRevert, undoLast and redoLast below.

  // Redact design-review finding #3: deleteElement and clearPage used to
  // change elements with no announcement and no way back short of the full
  // history modal or Cmd/Ctrl+Z. This chip mirrors Merge's own
  // (PdfMergeTool.tsx's undoAction/registerUndo): a short-lived pill in the
  // toolbar's status slot, naming the entry it can revert by id rather than
  // "whatever is newest" - correct even if another action lands before it is
  // clicked (see runUndoChip below).
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Redact design-review finding #4: the exported (redacted) bytes an
  // in-toolbar "Compress" hand-off can act on, set once a save actually
  // succeeds and cleared - same as usePdfShare's own prepared file - whenever
  // the source or the boxes change under it (see the clearPrepared effect
  // below).
  //
  // That effect only ever cleared what had already landed, which left one
  // window open (DEBT-18): an edit during the export's await cleared this,
  // and then the export resolved and put the pre-edit bytes straight back.
  // The effect now also retires the run in flight (`exportRun.invalidate()`)
  // and handleSavePdf checks its ticket before committing anything, so the
  // hand-off and the Share sheet only ever carry an export of the boxes
  // currently on the page.
  const [exportedForHandoff, setExportedForHandoff] = useState<{ blob: Blob; name: string } | null>(null);
  const [handoffBusy, setHandoffBusy] = useNavigatingAway();
  const [handoffFailed, setHandoffFailed] = useState(false);

  const workspaceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      dispatch({ type: 'FULLSCREEN_CHANGED', active: document.fullscreenElement === workspaceRef.current });
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Escape disarms the tool and drops the selection, matching the Sign editor.
  // It is a shortcut for the status line's Stop chip, not the only way out: a
  // phone has no Escape key, which is exactly why that chip exists.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!activeStyle && !activeBoxId && !selectedBoxId) return;
      dispatch({ type: 'ESCAPED' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeStyle, activeBoxId, selectedBoxId]);

  // With no tool armed, a tap on blank page area is the phone's way out of a
  // selection (the tool disarms after one placement, so this is the usual state
  // right after drawing a box). An armed tool's own page handler deselects.
  const tapOutside = useTapOutsideDeselect({
    onDeselect: () => dispatch({ type: 'SELECTION_CLEARED' }),
    isArmed: () => !!activeStyle,
    excludedSelector: [
      `.${styles['redact-box']}`,
      '[data-editor-actions]',
      '[data-editor-resizer]',
      '[data-editor-color-menu]',
      '[data-redact-find-match]',
      'button',
      'a',
      'input',
    ].join(', '),
  });

  // A click anywhere outside the selected box drops the selection, not only on
  // blank page area: the page header, the margin and the rest of the screen
  // too. A document listener, so it is one path wherever the click lands; the
  // container keeps the touch handlers for iOS's jittery taps (MOBI-30). Read
  // through a ref so the listener is added once and still sees this render's
  // `isArmed`.
  const tapOutsideRef = useRef(tapOutside);
  tapOutsideRef.current = tapOutside;
  useEffect(() => {
    const onDocumentClick = (e: MouseEvent) => tapOutsideRef.current.onClick(e);
    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, []);

  const toggleFullscreen = () => {
    if (isPseudoFullscreen) {
      dispatch({ type: 'PSEUDO_FULLSCREEN_CHANGED', active: false });
      return;
    }

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (workspaceRef.current?.requestFullscreen && document.fullscreenEnabled !== false) {
      const promise = workspaceRef.current.requestFullscreen();
      if (promise) {
        promise.catch(() => dispatch({ type: 'PSEUDO_FULLSCREEN_CHANGED', active: true }));
      }
    } else {
      dispatch({ type: 'PSEUDO_FULLSCREEN_CHANGED', active: true });
    }
  };

  const pageWrapperRefs = useRef<(HTMLDivElement | null)[]>([]);
  // The restored document's 77 page canvases acquire their intrinsic size
  // asynchronously. Keep the informational content below the editor out of
  // paint until all of those dimensions are real: otherwise it visibly walks
  // down once per canvas while Redact reconstructs a long saved document.
  // This is deliberately Redact-local; Sign's workspace has its own render
  // path and this is not a layout contract shared with Merge.
  const renderedPageNumbersRef = useRef(new Set<number>());
  const [sizedPageCount, setSizedPageCount] = useState(0);
  const fileBytesRef = useRef<ArrayBuffer | null>(null);
  const loadIdRef = useRef(0);
  const loadControllerRef = useRef<import('../../editor/workspace/loadPdf.ts').PdfLoadController | null>(null);
  // Whichever of {manual file pick, draft restore} happens first (in call order) wins
  // outright; the other is skipped entirely. This closes the gap the loadId guard alone
  // doesn't cover: a slow draft restore that resolves *after* a fast manual pick has
  // already finished editing would otherwise still be "the newer call" and clobber it.
  const loadStartedRef = useRef(false);

  useEffect(() => () => {
    loadIdRef.current++;
    loadControllerRef.current?.cancel();
    // An export resolving after the editor has left the tree must not fire a
    // download for a tool the person walked away from (Sign does the same
    // with activeExportRequestRef).
    exportRun.invalidate();
  }, []);

  const handlePageViewportReady = useCallback((pageNum: number) => {
    // PdfPageCanvas calls this immediately after it gives the canvas its real
    // viewport dimensions. A Set makes repeated React effects harmless and
    // correctly accepts a legitimate 300×150 PDF page.
    if (renderedPageNumbersRef.current.has(pageNum)) return;
    renderedPageNumbersRef.current.add(pageNum);
    setSizedPageCount(renderedPageNumbersRef.current.size);
  }, []);

  const isFullscreenActive = isFullscreenActiveOf(state);
  const currentPage = useCurrentPage({
    active: isFullscreenActive,
    rootRef: workspaceRef,
    pageRefs: pageWrapperRefs,
    numPages,
  });

  // A generated PDF must match the current source and redaction boxes - the
  // "Compress" hand-off's own prepared bytes go stale on exactly the same
  // change, so it is cleared alongside usePdfShare's own prepared file.
  useEffect(() => {
    clearPrepared();
    setExportedForHandoff(null);
    // An export still running was started from boxes that no longer exist.
    // Retiring it here rather than in handleSavePdf's own bail is what lets
    // the workspace come back out of `.is-processing`: only this effect knows
    // the difference between "the user changed the document" and "a second
    // export superseded the first", and only the first case should hand the
    // editor back. Mirrors PdfSignTool.tsx's own invalidation effect.
    if (!exportRun.invalidate()) return;
    // Only the export's own screen is ours to take down. A replacement file
    // invalidates the export too, and its loader has already put the
    // workspace into 'loading' - saying "editing" over that would show an
    // empty editor for the file still being read.
    if (statusRef.current !== 'redacting') return;
    setStatus('editing');
    setProgress(0);
    setExportCancelled(true);
    setAnnouncement('You changed something, so that download stopped. Download again when ready.');
    // Keyed on the revision, not on `elements`, so this fires on exactly what
    // `exportRun`'s own keys ([file, documentRevisionRef.current]) watch. With
    // two different notions of "the document moved", an edit that bumped the
    // revision without replacing the elements array would retire the run
    // while leaving this effect asleep, and the workspace would stay behind
    // `.is-processing` with no way out but a reload. Sign keys on the
    // revision for the same reason (PdfSignTool.tsx).
  }, [file, documentRevision, clearPrepared, exportRun]);

  useEffect(() => () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, []);

  // Core loader shared by fresh file picks and draft restore. `bytes` is the source
  // PDF's ArrayBuffer; `presetElements` seeds restored redaction boxes.
  //
  // Draft restore reads from IndexedDB asynchronously, so it can still be in flight
  // when the user drops/picks a fresh file — two overlapping loadPdf calls would
  // otherwise race, and whichever's awaits happened to resolve last would silently
  // clobber the other's state. Tag each call with an id and ignore any state updates
  // from a call that's been superseded by a newer one.
  const loadPdf = async (
    selected: File,
    bytes: ArrayBuffer,
    preset: EditorDraftInitialState<RedactElement> = { elements: [], actionHistory: [] },
    restored = false,
  ) => {
    // Restored drafts arrive already migrated (legacy `style`-keyed elements
    // renamed to `type`) and validated - see useEditorDraftPersistence.ts.
    const presetElements = preset.elements || [];
    await loadEditorPdf({
      file: selected, bytes, restored, loadIdRef, loadControllerRef, clearDraft, setStatus, setAnnouncement,
      initialize: () => {
        renderedPageNumbersRef.current = new Set();
        setSizedPageCount(0);
        deleteTool.clearLifts(); // a lift from the last file must never show over this one
        // RED-39: a new file starts clean - no tool armed, nothing selected, Find
        // closed with its term. None of that belongs to the file just left.
        find.setOpen(false);
        find.setTerm('');
        find.setPreset(null);
        setExportCancelled(false);
        setShowWelcomeTip(!restored);
        setFile(selected);
        setPdfDocument(null);
        setNumPages(0);
        setErrorDetail(null);
        setProgress(0);
        // RED-40: a restored document keeps its own colour and strength.
        const brush = resolveBrush(preset.carried, getAppStyle());
        const color = resolveWhiteoutColor(preset.carried, getAppStyle(), getEditorPreference('lastWhiteoutColor'));
        const strength = resolveRedactBlurStrength(preset.carried, getAppStyle(), getEditorPreference('lastBlurStrength'));
        // A restored draft has no redoable future - future is never persisted.
        dispatch({
          type: 'FILE_INITIALIZED', file: selected, restored, elements: presetElements, past: preset.actionHistory,
          carried: preset.carried, brush, activeColor: color, activeBlurStrength: strength,
        });
        seedUniqueId(presetElements);
        fileBytesRef.current = bytes;
      },
      onDocument: (doc, isCurrent) => {
        if (!isCurrent()) return;
        setPdfDocument(doc);
        setNumPages(doc.numPages);
        void cacheRecentFile('redact', {
          fileName: selected.name,
          fileType: selected.type || 'application/pdf',
          fileBytes: bytes,
        });
      },
    });
  };

  const handleFilesAdded = async (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    const pdfs = incoming.filter((f) => f.type === 'application/pdf');

    if (pdfs.length === 0) {
      setAnnouncement('Choose a PDF file.');
      return;
    }

    // BasePdfTool has already asked about anything a replacement would cost, so
    // reaching here means the swap is agreed. Claim the load slot synchronously,
    // before the arrayBuffer() await, so a draft restore resolving in that gap
    // sees the claim and backs off instead of racing us.
    loadStartedRef.current = true;

    const selected = pdfs[0];
    const bytes = await selected.arrayBuffer();
    await loadPdf(selected, bytes);
  };

  const { clearDraft, isRestoring, draftSaveState } = useEditorDraftPersistence({
    tool: 'redact',
    file,
    fileBytes: fileBytesRef.current,
    elements,
    actionHistory,
    carried,
    status,
    isDirty: isDirty(state),
    loadStartedRef,
    loadPdf,
    isElement: isRedactElement,
  });

  const handlePointerDown = (e: RedactPointerEvent, pageIndex: number) => {
    // No tool armed: a press on the page is a scroll or a deselect, never a new
    // box. Delete mode has its own click targets (DeletableObjectOverlay
    // below) and never draws one either, so it may not start the drag
    // gesture this function owns.
    if (!activeStyle || activeStyle === 'delete') return;
    // A brush paints through BrushLayer, which owns the press.
    if (brushKind) return;

    const target = e.target as Element | null;
    if (target?.closest(`.${styles['redact-box']}`)) {
      return; // Ignore clicks on an existing box or its floating toolbar
    }

    e.preventDefault();
    const container = e.currentTarget;
    const origin = getPointerPercent(e, container);
    const type = activeStyle;
    const color = type === 'whiteout' ? activeColor : (type === 'blackout' ? '#000000' : undefined);
    const strength = type === 'blur' ? activeBlurStrength : undefined;
    // Clicking blank page area deselects/hides any box's controls as the draw begins.
    dispatch({ type: 'DRAW_STARTED', drawing: { pageIndex, startX: origin.x, startY: origin.y, type, color, strength } });
    cancelDrawingRef.current?.();
    cancelDrawingRef.current = startGesture({
      computePatch: (moveEvent) => {
        if ('touches' in moveEvent && moveEvent.touches && moveEvent.cancelable) moveEvent.preventDefault();
        const point = getPointerPercent(moveEvent, container);
        const x = Math.max(0, Math.min(100, point.x));
        const y = Math.max(0, Math.min(100, point.y));
        return { left: Math.min(origin.x, x), top: Math.min(origin.y, y), width: Math.abs(x - origin.x), height: Math.abs(y - origin.y) };
      },
      writeDOM: (patch) => {
        const preview = drawingPreviewRef.current;
        if (!preview) return;
        preview.style.left = `${patch.left}%`;
        preview.style.top = `${patch.top}%`;
        preview.style.width = `${patch.width}%`;
        preview.style.height = `${patch.height}%`;
      },
      commit: (patch) => {
        cancelDrawingRef.current = null;
        dispatch({ type: 'DRAW_ENDED' });
        // A press that drew nothing has not spent the tool's one placement, so
        // it stays armed - otherwise a mistimed tap would silently disarm and
        // the next real drag would do nothing at all.
        if (!patch || patch.width <= 1 || patch.height <= 1) return;
        const id = uniqueId();
        const element: RedactElement = {
          id, pageIndex, ...patch, type, color,
          ...(type === 'blur' ? { strength: activeBlurStrength } : {}),
        };
        commands.add([element], { type: `ADD_${type.toUpperCase()}`, description: `Added ${type} box` });
        setAnnouncement(`Added ${type} box.`);
        disarmTool();
      },
      cancel: () => {
        cancelDrawingRef.current = null;
        dispatch({ type: 'DRAW_ENDED' });
      },
    });
  };

  // RED-32: one stroke, one history entry. The brush stays armed afterwards
  // (no disarmTool): painting is several strokes in a row.
  const addStroke = (stroke: CommittedStroke) => {
    const word = stroke.type === 'blurStroke' ? 'blur' : 'whiteout';
    commands.add([stroke as RedactElement], { type: 'ADD_STROKE', description: `Painted a ${word} stroke` });
    setAnnouncement(`Painted a ${word} stroke.`);
  };

  // Registers a short-lived Undo chip for a delete/clear command already
  // pushed onto actionHistory, and announces it through the live region.
  // Shared by deleteElement and clearPage (finding #3) - both are complete
  // atomic commands by the time this runs, so this only has to surface what
  // already happened, not perform it.
  const registerUndo = (message: string, entry: ActionHistoryEntry<RedactElement>, extra?: { label: string; onSelect: () => void }) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    dispatch({ type: 'UNDO_CHIP_SHOWN', message, entryId: entry.id, extra });
    undoTimerRef.current = setTimeout(() => dispatch({ type: 'UNDO_CHIP_DISMISSED' }), UNDO_WINDOW_MS);
  };

  const clearUndoChip = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    dispatch({ type: 'UNDO_CHIP_DISMISSED' });
  };

  // RED-14: the one commit path every edit below goes through - one
  // EDIT_COMMITTED (elements, selection, history entry and revision change
  // together) and, for a removal, the undo chip.
  const commands = useRedactCommands<RedactElement>({
    elements,
    commit: (commit) => dispatch({ type: 'EDIT_COMMITTED', ...commit }),
    registerUndo,
    describeUpdate: (kind, element) => describeRedactUpdate(kind, element.type),
  });

  // RED-14: the Delete tool's own state and marking, moved out wholesale -
  // this island still renders DeleteLift/DeletableObjectOverlay, reading
  // everything else from the hook.
  const deleteTool = useDeleteTool({
    elements,
    file,
    fileBytes: fileBytesRef.current,
    pdfDocument,
    pageWrapperRefs,
    add: commands.add,
    announce: setAnnouncement,
    disarmTool,
  });

  const deleteElement = (id: string) => {
    const el = elements.find(e => e.id === id);
    if (!el) return;
    commands.remove(new Set([id]), {
      type: 'DELETE_ELEMENT', description: `Removed the ${el.type} box`, pageIndex: el.pageIndex, chipMessage: `Removed the ${el.type} box`,
    });
  };

  // RED-14: every edit that can fan out to a linked box's repeat group or
  // find set - updateElement, duplicateElement, unlinkFromGroup,
  // removeLinked, clearPage/clearPageOptions, repeatOnEveryPage - lives in
  // useLinkedBoxes.ts now. `select` mirrors what duplicateElement itself
  // used to do: sets both the sticky selection and the hover target to the
  // box it just created.
  const linkedBoxes = useLinkedBoxes<RedactElement>({
    elements,
    numPages,
    uniqueId,
    commands,
    select: (id) => dispatch({ type: 'BOX_SELECTED', id }),
  });
  const { updateElement, unlinkFromGroup, removeLinked, duplicateElement, repeatOnEveryPage, clearPage, clearPageOptions } = linkedBoxes;

  // Cmd/Ctrl+Z reverts the single newest command; the reducer reads the
  // current `past`, so two undo keydowns landing in the same task (key
  // auto-repeat) are two distinct reverts. Nothing to undo reverts nothing.
  const undoLast = () => dispatch({ type: 'UNDO' });

  // The undo chip's own Undo button (finding #3): reverts the exact command
  // it named, by id, rather than "whatever is newest" - if another action
  // landed after this one and before the chip was clicked, reverting the
  // newest would silently revert the wrong thing. A stale id is a silent
  // no-op. Whether that revert leaves a redo behind is historyStack.ts's
  // `revertCommands` call, made from the stack itself.
  const runUndoChip = () => {
    if (!undoAction) return;
    const entryId = undoAction.entryId;
    clearUndoChip();
    dispatch({ type: 'UNDO', entryId });
  };

  // Shift+Cmd/Ctrl+Z or Ctrl+Y: reapplies the single most recently undone
  // command, the exact mirror of undoLast.
  const redoLast = () => dispatch({ type: 'REDO' });

  useHistoryShortcuts(undoLast, redoLast);

  // Passed to ElementToolbar's onChange for whiteout boxes: applies the color and
  // remembers it, same as the Sign tool's whiteout tool.
  const changeElementColor = (id: string, color: string) => {
    updateElement(id, { color });
    rememberColor(color);
  };

  // Passed to ElementToolbar's onChange for blur boxes: applies the strength and
  // remembers it, same as changeElementColor above for whiteout.
  const changeBlurStrength = (id: string, strength: BlurStrength) => {
    updateElement(id, { strength });
    rememberBlurStrength(strength);
  };

  // RED-02: find and redact. Every box of every chosen match (one per line
  // the match covers) is added as one history entry, so one Undo takes back
  // a whole "Redact all".
  const find = useFind(pdfDocument, numPages, elements);
  const pageSizesPt = usePageSizesPt(pdfDocument, numPages, elements.some((el) => el.type === 'blur' || el.type === 'blurStroke') || brushKind !== null);

  // RED-17: what Find looked for on this document, so the check of the saved
  // file looks for it too (a preset finds every email, not just the boxed ones).
  const [findTerms, setFindTerms] = useState<CheckTerm[]>([]);
  useEffect(() => { setFindTerms([]); }, [pdfDocument]);
  const rememberFindTerm = () => {
    const term: CheckTerm | null = find.preset
      ? { label: PRESET_LABELS[find.preset], source: 'find', finder: PRESET_FINDERS[find.preset] }
      : (find.term.trim() ? { label: find.term.trim(), source: 'find', finder: termFinder(find.term.trim()) } : null);
    if (term) setFindTerms((terms) => [...terms.filter((known) => known.label !== term.label), term]);
  };
  const redactMatches = (matches: FindMatch[]) => {
    if (matches.length === 0) return;
    const type = find.redactStyle;
    const additions: RedactElement[] = matches.flatMap((match) => match.boxes.map((box) => ({
      id: uniqueId(),
      pageIndex: match.pageIndex,
      ...box,
      type,
      ...(type === 'blur' ? { strength: activeBlurStrength } : { color: '#000000' }),
    })));
    // RED-11: two or more boxes from this action share a findSetId, so they
    // can be removed together and share blur strength later; a single box
    // joins no set. "Redact this" on one match that wraps onto a second line
    // makes two boxes, and they do form a set: both halves hide one secret.
    if (additions.length >= 2) {
      const findSetId = uniqueId();
      additions.forEach((addition) => { addition.findSetId = findSetId; });
    }
    const nextId = find.nextOpenAfter(new Set(matches.map((match) => match.id)));
    // RED-37: never the matched text itself - the description is announced
    // and shown in the undo chip, and reading a secret aloud is what the box
    // was for.
    const description = matches.length === 1 ? 'Covered 1 match' : `Covered ${matches.length} matches`;
    commands.add(additions, { type: 'FIND_AND_REDACT', description, undoChip: true });
    setAnnouncement(`${description}.`);
    find.setCurrentId(nextId);
  };

  // RED-17: the check of each saved export. Every page with a box is saved
  // as a picture, with no text layer at all (redact.js), so those are the
  // pages text search can't see.
  const checkBoxes: CheckBox[] = checkBoxesFromElements(elements);
  const savedCheck = useSavedFileCheck({
    pdfDocument,
    saved: exportedForHandoff?.blob ?? null,
    boxes: checkBoxes,
    findTerms: [...deletedTerms(elements), ...findTerms],
    picturePages: [...new Set(checkBoxes.map((box) => box.pageIndex))].sort((a, b) => a - b),
    measure: find.measure,
  });
  const coverFromCheck = (term: CheckTerm, pageIndex: number) => {
    if (savedCheck.state.status !== 'done') return;
    const pages = savedCheck.state.outcome.context.original.filter((page) => page.text.pageIndex === pageIndex);
    redactMatches(uncoveredMatches(pages, term.finder, checkBoxes, find.measure));
  };

  // RED-25: Remove it. Bytes in, bytes out (check/removePlace.ts); the new
  // file replaces the saved one under the same name, downloads again, and the
  // saved-file check re-runs on it because `exportedForHandoff` changed.
  const [removing, setRemoving] = useState(false);
  const [removedNote, setRemovedNote] = useState<string | null>(null);
  const removeFromCheck = async (finding: InPlaceFinding) => {
    if (removing || savedCheck.state.status !== 'done' || !exportedForHandoff) return;
    const place = savedCheck.state.outcome.context.saved.places[finding.placeIndex];
    if (!place) return;
    const { blob, name } = exportedForHandoff;
    setRemoving(true);
    try {
      const { removePlace, PlaceNotFoundError } = await import('./check/removePlace.ts');
      try {
        const bytes = await removePlace(new Uint8Array(await blob.arrayBuffer()), place);
        const next = new Blob([bytes as BlobPart], { type: 'application/pdf' });
        clearPrepared();
        setExportedForHandoff({ blob: next, name });
        download(next, name);
        setRemovedNote(removedMessage(place));
        setAnnouncement(removedMessage(place));
      } catch (error) {
        if (!(error instanceof PlaceNotFoundError)) throw error;
        // Nothing changed; a fresh blob object makes the check read it again.
        setExportedForHandoff({ blob: new Blob([blob], { type: blob.type }), name });
        setRemovedNote(ALREADY_GONE);
        setAnnouncement(ALREADY_GONE);
      }
    } catch (error) {
      console.error(error);
      setRemovedNote(null);
      setAnnouncement("I couldn't remove that. Your saved file is unchanged.");
    } finally {
      setRemoving(false);
    }
  };

  const handleSavePdf = async (exportAction = 'download') => {
    if (!file) return;
    if (elements.length === 0) {
      setAnnouncement('Draw a box or delete something first.');
      return;
    }

    setErrorDetail(null);
    setRemovedNote(null);
    setExportCancelled(false);
    setStatus('redacting');
    setProgress(0);
    const hasBoxes = elements.some((el) => el.type !== 'delete');
    setAnnouncement(
      hasBoxes ? 'Saving the redacted PDF…' : 'Deleting what you chose…',
    );

    // DEBT-18: everything this run is an export *of*, captured before the
    // first await. `sourceFile` is used below instead of `file` so the name
    // on the result can never be a newer file's.
    const run = exportRun.begin();
    const sourceFile = file;

    try {
      // DEBT-20: applyPageEdits pulls in @cantoo/pdf-lib, which is only needed
      // to write the export. Importing it here instead of at module scope keeps
      // it out of everything /redact/ downloads and compiles before a file is
      // even open. A failed chunk load lands in the same catch as a failed
      // export, which is the right outcome: the boxes stay, the message is
      // "try again". Repeat exports reuse the module registry's copy.
      const { applyPageEdits } = await import('../../editor/adapters/pdf/applyPageEdits.js');
      const { blob: redactedBlob } = await applyPageEdits(sourceFile, elements, (p) => {
        if (run.isCurrent()) setProgress(p);
      });
      if (!run.isCurrent()) return;
      run.settle();
      const filename = redactedFileName(sourceFile.name);
      // Finding #4: a successful export (either export path - Download or
      // Share - counts) is what unlocks the "Compress" hand-off below.
      setExportedForHandoff({ blob: redactedBlob, name: filename });

      if (exportAction === 'share' && prepare(redactedBlob, filename)) {
        setStatus('editing');
        setAnnouncement('Your redacted PDF is ready to share.');
      } else {
        download(redactedBlob, filename);
        setStatus('editing');
        setAnnouncement('Saved. Download started.');
      }
    } catch (err) {
      console.error(err);
      // A failure nobody is waiting for any more: the invalidation effect has
      // already put the editor back, and reporting it would blame the user's
      // current boxes for a run they replaced.
      if (!run.isCurrent()) return;
      run.settle();
      // Recoverable: keep the workspace mounted so the boxes that caused the
      // failure are still there to fix, instead of unmounting the editor
      // behind a dead-end error screen (status='error' is reserved for a
      // failed document load, which never gets this far).
      setStatus('editing');
      const detail = 'Could not export the PDF. Your edits are still here. Try again.';
      setErrorDetail(detail);
      setAnnouncement(`The download stopped. ${detail}`);
    }
  };

  // Skips regenerating the redacted PDF when a Share-prepared file already
  // matches the current elements (usePdfShare.downloadPrepared - cleared
  // automatically by the effect above whenever file/elements change, so this
  // never serves a stale export). Mirrors PdfSignTool's handleDownloadPdf.
  const handleDownloadPdf = () => {
    setErrorDetail(null);
    if (downloadPrepared()) {
      setAnnouncement('Download started.');
      return;
    }
    handleSavePdf('download');
  };

  const handleSharePdf = async () => {
    const result = await sharePrepared();
    if (result.status === 'shared') {
      setAnnouncement('Shared.');
    } else if (result.status === 'canceled') {
      setAnnouncement('Sharing canceled. Your redacted PDF is still ready to share.');
    } else if (result.status === 'error') {
      console.error(result.error);
      setAnnouncement('Could not open the share sheet. Try again.');
    }
  };

  // Finding #4: hands the exported redacted bytes to Compress without
  // re-picking, the same one-shot baton Merge's own hand-off uses
  // (draftStore.js's saveHandoff/takeHandoff, consumed on the other end by
  // useHandoffIntake.ts) - reused here rather than copied, since Redact is
  // a tool and cannot import another tool's PdfMergeTool.tsx (module
  // boundaries). Disabled until exportedForHandoff exists (an export has
  // actually succeeded), mirroring Merge's own `prepared.status !== 'ready'`
  // gate on its hand-off buttons.
  const requestHandoff = async (tool: 'compress' | 'sign') => {
    if (handoffBusy || !exportedForHandoff) return;
    setHandoffBusy(true);
    setHandoffFailed(false);
    try {
      const { saveHandoff } = await import('../../lib/drafts/draftStore.js');
      const saved = await saveHandoff(tool, {
        fileName: exportedForHandoff.name,
        fileType: 'application/pdf',
        fileBytes: await exportedForHandoff.blob.arrayBuffer(),
      });
      if (!saved) throw new Error('handoff');
      window.location.href = `/${tool}/`;
    } catch (err) {
      console.error(err);
      setHandoffFailed(true);
      setHandoffBusy(false);
    }
  };

  // RED-36: everything the finish row and the status line say, from state
  // that already exists. A page with any box is saved as a picture; a page
  // with only deletions keeps its text (applyPageEdits.js).
  const finishPhase: FinishPhase = status === 'redacting' ? 'exporting'
    : exportedForHandoff ? 'saved'
    : exportCancelled ? 'cancelled'
    : elements.length === 0 ? 'empty'
    : 'ready';
  const finishFacts: FinishFacts = {
    phase: finishPhase,
    progress,
    fileName: exportedForHandoff?.name ?? (file ? redactedFileName(file.name) : ''),
    pageCount: numPages,
    picturePages: new Set(elements.filter((el) => el.type !== 'delete').map((el) => el.pageIndex)).size,
    boxCount: elements.filter((el) => el.type !== 'delete').length,
    deletionCount: elements.filter((el) => el.type === 'delete').length,
  };

  return (
    <BasePdfTool
      hasFiles={!!file}
      onFilesAdded={handleFilesAdded}
      multiple={false}
      accept=".pdf,application/pdf"
      emptyStateMessage="Select or drop a PDF to redact"
      file={file}
      // Finding #5/#6: a real page-1 thumbnail (FilePreview.tsx, via `file`)
      // instead of the generic glyph, and the identity row names what
      // Download will actually produce once there is something to redact -
      // rename-in-place is not required, so this stays derived rather than
      // becoming its own editable field the way Merge's output name is.
      fileLabel={elements.length > 0 && file ? redactedFileName(file.name) : file?.name}
      fileMeta={describeFile(file, numPages, isFullscreenActive ? currentPage : null)}
      draftSaveState={draftSaveState}
      ownsShell
      checkingDraft={isRestoring}
    >
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      {/* No loading-state message: pdf.js parses fast enough that a text block
          here just added its own undersized-then-replaced flicker (see
          Workspace.module.css's fade-in on .workspace, which softens the real
          jump from nothing to a loaded document instead). */}

      {(status === 'editing' || status === 'redacting') && pdfDocument && (
        <div
          className={`${workspaceStyles.workspace}${isPseudoFullscreen ? ` ${workspaceStyles['pseudo-fullscreen']}` : ''}${status === 'redacting' ? ` ${workspaceStyles['is-processing']}` : ''}`}
          ref={workspaceRef}
          aria-busy={status === 'redacting'}
          data-redact-workspace-ready={numPages > 0 && sizedPageCount === numPages ? 'true' : 'false'}
        >
          <RedactToolbar
            activeStyle={activeStyle}
            toolLocked={toolLocked}
            setTool={setTool}
            setAnnouncement={setAnnouncement}
            toggleFullscreen={toggleFullscreen}
            isFullscreen={isFullscreenActive}
            handleDownloadPdf={handleDownloadPdf}
            handlePrepareShare={() => handleSavePdf('share')}
            handleSharePdf={handleSharePdf}
            canSharePdf={canSharePdf}
            shareReady={shareReady}
            elementsCount={elements.length}
            actionHistory={actionHistory}
            onUndo={undoLast}
            onRedo={redoLast}
            canRedo={canRedoOf(state)}
            exporting={status === 'redacting'}
            undoAction={undoAction && {
              message: undoAction.message,
              extra: undoAction.extra && {
                label: undoAction.extra.label,
                // Pressing it spends the chip, like Undo; the action it runs may register its own.
                onSelect: () => { const run = undoAction.extra!.onSelect; clearUndoChip(); run(); },
              },
            }}
            onUndoAction={runUndoChip}
            statusMessage={finishStatusText(finishFacts)}
            peeking={peekAll}
            onPeekChange={setPeekAll}
            showWelcomeTip={showWelcomeTip}
            restoredNote={restoredNoteVisible(state)}
            brushControls={(activeStyle === 'blur' || activeStyle === 'whiteout') && (
              <BrushControls
                tool={activeStyle}
                settings={brush}
                onSettings={changeBrush}
                color={activeColor}
                onColor={rememberColor}
                eyedropping={eyedropping}
                onToggleEyedropper={() => dispatch({ type: 'EYEDROPPER_TOGGLED' })}
              />
            )}
            brushMode={brushKind !== null}
            findOpen={find.open}
            onToggleFind={() => find.setOpen(!find.open)}
            findBar={find.open && (
              <FindBar
                term={find.term}
                preset={find.preset}
                onTermChange={find.setTerm}
                onPresetChange={find.setPreset}
                summary={find.summary}
                onPrev={find.prev}
                onNext={find.next}
                redactStyle={find.redactStyle}
                onRedactStyleChange={find.setRedactStyle}
                onRedactCurrent={() => { if (find.current) { redactMatches([find.current]); rememberFindTerm(); } }}
                onRedactAll={() => { redactMatches(find.openMatches); rememberFindTerm(); }}
                onClose={() => find.setOpen(false)}
              />
            )}
          />

          <div
            className={workspaceStyles['pages-container']}
            onTouchStart={tapOutside.onTouchStart}
            onTouchEnd={tapOutside.onTouchEnd}
            onTouchCancel={tapOutside.onTouchCancel}
          >
            {Array.from({ length: numPages }).map((_, i) => (
              <div key={i} data-editor-page-card>
                <EditorPageHeader
                  pageNumber={i + 1}
                  onClear={elements.some(el => el.pageIndex === i) ? () => clearPage(i) : null}
                  clearOptions={clearPageOptions(i)}
                  clearTitle="Clear every box on this page"
                />
                <div
                  className={`${workspaceStyles['page-wrapper']} redact-draw-area`}
                  ref={(el) => { pageWrapperRefs.current[i] = el; }}
                  onMouseDown={(e) => handlePointerDown(e, i)}
                  onTouchStart={(e) => handlePointerDown(e, i)}
                  /* touch-action is armed with the tool, not left off wholesale.
                     A drawing tool has to own the touch so a drag draws instead
                     of scrolling - but this used to be unconditional, and since
                     a style was always selected, that meant a phone could never
                     scroll the document at all. Delete places by tapping, so it
                     keeps the browser's own panning. */
                  style={{
                    touchAction: activeStyle && activeStyle !== 'delete' ? 'none' : 'auto',
                    cursor: activeStyle && activeStyle !== 'delete' ? 'crosshair' : 'default',
                    position: 'relative',
                  }}
                >
                  <PdfPageCanvas
                    pdfDocument={(!peekAll && deleteTool.deletePreviews.get(i)) || pdfDocument}
                    pageNum={!peekAll && deleteTool.deletePreviews.has(i) ? 1 : i + 1}
                    onViewportReady={handlePageViewportReady}
                  />

                  {/* Render existing redaction boxes (delete marks render separately below - they
                      have no color/drag/resize, so RedactBox and the registry it draws through
                      don't apply to them) */}
                  {elements.filter(el => el.pageIndex === i && el.type !== 'delete').map(el => {
                    // RED-03: the repeat button only offers pages that don't
                    // already carry a copy - a dummy id generator here is
                    // enough to answer "would this add anything", without
                    // spending real ids on a box that may never be created.
                    // Only the selected box shows its toolbar, so only it pays for
                    // the linked-set lookups (each walks every element).
                    const selected = el.id === selectedBoxId;
                    const canRepeat = selected && numPages > 1 && repeatCopies(el, elements, numPages, () => '').length > 0;
                    return (
                      <RedactBox
                        key={el.id}
                        el={el}
                        isSelected={el.id === selectedBoxId}
                        isActiveHover={el.id === activeBoxId}
                        onSelect={(id: string) => dispatch({ type: 'BOX_SELECTED', id })}
                        onChange={updateElement}
                        getPageWrapper={() => pageWrapperRefs.current[el.pageIndex]}
                        onHoverEnter={() => dispatch({ type: 'BOX_HOVERED', id: el.id })}
                        onHoverLeave={() => dispatch({ type: 'BOX_UNHOVERED', id: el.id })}
                        onDelete={deleteElement}
                        onChangeColor={changeElementColor}
                        onChangeStrength={changeBlurStrength}
                        onDuplicate={duplicateElement}
                        onRepeatOnEveryPage={canRepeat ? repeatOnEveryPage : undefined}
                        repeatGroupSize={selected ? groupMembers(elements, el.id).length : undefined}
                        onUnlinkFromGroup={() => unlinkFromGroup(el.id)}
                        onRemoveGroup={() => removeLinked(el.id, 'repeatGroup')}
                        findSetSize={selected ? findSetMembers(elements, el.id).length : undefined}
                        onRemoveFindSet={() => removeLinked(el.id, 'findSet')}
                        pageWidthPoints={pageSizesPt[el.pageIndex]?.width}
                        pageHeightPoints={pageSizesPt[el.pageIndex]?.height}
                        peekAll={peekAll}
                      />
                    );
                  })}

                  {/* RED-13: an object queued for deletion has no mark of its own. The
                      page is drawn without it (useDeletePreviews), so what you see is
                      what you save, and the toolbar's Undo brings it back. */}
                  {deleteTool.lifts.filter((lift) => lift.pageIndex === i).map((lift) => (
                    <DeleteLift key={lift.id} lift={lift} onDone={deleteTool.finishLift} />
                  ))}

                  {/* Delete tool's hover targets: only shown while that tool is active,
                      and only for objects still on the page. */}
                  {activeStyle === 'delete' && (
                    <DeletableObjectOverlay
                      objects={deleteTool.deletableObjects.filter((object) => object.pageIndex === i)}
                      markedIds={deleteTool.markedForDeletionIds}
                      onSelect={deleteTool.markObject}
                    />
                  )}
                  {activeStyle === 'delete' && (
                    <DeleteMarquee
                      objects={deleteTool.deletableObjects.filter((object) => object.pageIndex === i && !deleteTool.markedForDeletionIds.has(object.id))}
                      onCommit={deleteTool.markObjects}
                    />
                  )}

                  {find.open && (
                    <FindHighlights
                      matches={find.matchesOnPage(i)}
                      currentId={find.currentId}
                      coveredIds={find.coveredIds}
                      onPick={find.setCurrentId}
                    />
                  )}

                  {brushKind && (
                    <BrushLayer
                      pageIndex={i}
                      kind={brushKind}
                      sizePt={brush.size}
                      color={brushKind === 'whiteout' ? activeColor : undefined}
                      strength={brushKind === 'blur' ? activeBlurStrength : undefined}
                      pageWidthPt={pageSizesPt[i]?.width}
                      pageHeightPt={pageSizesPt[i]?.height}
                      onCommit={addStroke}
                    />
                  )}

                  {/* Render active drawing box */}
                  {drawingState && drawingState.pageIndex === i && (
                    <div
                      ref={drawingPreviewRef}
                      className="redact-drawing-preview"
                      style={{
                        position: 'absolute',
                        left: `${drawingState.startX}%`, top: `${drawingState.startY}%`, width: 0, height: 0,
                        ...redactionDrawingPreviewStyle(drawingState.type, drawingState.color),
                        zIndex: 20,
                        pointerEvents: 'none'
                      }}
                    >
                      {/* No boxHeightPt here (RED-24): this preview's width/height are
                          written straight to the DOM by the drag gesture (writeDOM
                          above), never through drawingState/React, so there is no
                          live, correct box height to give at render time. Omitting it
                          reads as "not known yet" to blurFraction and falls back to
                          the plain factor, same as before RED-24. */}
                      {renderRedactionDrawingPreviewContent(drawingState.type, drawingState.strength)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* RED-36: the one finish row - what will be saved, Download (with
              its progress while saving), what was saved, then Compress it and
              Sign it. The export error and the saved-file check sit under it,
              where the result is. */}
          <RedactFinish
            facts={finishFacts}
            canShare={canSharePdf}
            shareReady={shareReady}
            onDownload={handleDownloadPdf}
            onPrepareShare={() => handleSavePdf('share')}
            onShare={handleSharePdf}
            onHandoff={(tool) => { void requestHandoff(tool); }}
            handoffBusy={handoffBusy}
            handoffFailed={handoffFailed}
          >
            {/* Export error - recoverable, so it renders alongside the still-mounted
                workspace instead of replacing it (see handleSavePdf's catch). */}
            {errorDetail && (
              <ErrorMessage title="The download stopped." fullWidth>
                {errorDetail}
              </ErrorMessage>
            )}
            <SavedFileCheck state={savedCheck.state} onSearch={savedCheck.search} onCover={coverFromCheck} onRemove={removeFromCheck} removing={removing} note={removedNote} />
          </RedactFinish>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <ErrorMessage title="This PDF didn't open." fullWidth>
          <LoadErrorBody />
        </ErrorMessage>
      )}

    </BasePdfTool>
  );
}

// RED-39: a failed load used to leave no way out on a phone - the file is
// already set, so no dropzone shows, and Replace lives in the toolbar that
// never mounted. It renders inside BasePdfTool, so the shell's own Replace
// (FileActions, through useToolShell().requestReplace) is in reach.
function LoadErrorBody() {
  return (
    <>
      It may be damaged, or locked with a password. A locked PDF opens in <a href="/unlock/">Unlock</a> first.
      <FileActions />
    </>
  );
}
