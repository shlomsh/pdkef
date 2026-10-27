import { useReducer, useRef, useEffect, useCallback, useState, useMemo } from 'preact/hooks';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import { withIslandBoundary } from '../../lib/IslandErrorBoundary.tsx';
import RedactVerb from './verb/RedactVerb.tsx';
import PdfPageCanvas from '../../editor-ui/PdfPageCanvas.tsx';
import { uniqueId } from '../../editor/model/ids.ts';
import { useEditorFileSession } from '../../editor-ui/hooks/useEditorFileSession.ts';
import { toggleWorkspaceFullscreen, useFullscreenChange } from '../../editor-ui/hooks/workspaceFullscreen.ts';
import { recordAction } from '../../lib/actionTrail.ts';
import { startGesture } from '../../lib/gestures/controller.ts';
import usePdfCoordinates from '../../editor-ui/hooks/usePdfCoordinates.js';
import { redactionDrawingPreviewStyle, renderRedactionDrawingPreviewContent } from '../../editor/registry/redactionSurface.ts';
import { isDraftElement } from '../../editor/registry/draftValidation.ts';
import { useRecentWhiteoutColors } from '../../editor-ui/whiteout/useRecentWhiteoutColors.ts';
import { getAppStyle, rememberAppStyle, getEditorPreference } from '../../editor/workspace/preferenceStore.ts';
import useDeleteTool from './hooks/useDeleteTool.ts';
import useRedactCommands from './hooks/useRedactCommands.ts';
import RedactToolbar from './components/RedactToolbar.tsx';
import RedactBox from './components/RedactBox.tsx';
import usePeekAll from './hooks/usePeekAll.ts';
import BrushLayer, { type CommittedStroke } from './components/BrushLayer.tsx';
import { resolveWhiteoutColor, resolveRedactBlurStrength } from './lib/redactStyle.ts';
import BrushControls, { brushStyleOf, resolveBrush, type BrushSettings } from './components/BrushControls.tsx';
import { useEyedropper, sampleRingColor } from '../../editor-ui/whiteout/pageSampling.ts';
import { autoColorChanges, type PercentBox } from '../../editor-ui/whiteout/pageColor.ts';
import { checkBoxesFromElements } from './lib/check/checkBoxes.ts';
import usePageSizesPt, { needsPageSizes } from './hooks/usePageSizesPt.ts';
import DeletableObjectOverlay from './components/DeletableObjectOverlay.tsx';
import DeleteLift from './components/DeleteLift.tsx';
import DeleteMarquee from './components/DeleteMarquee.tsx';
import { groupMembers, repeatCopies } from './lib/repeatGroup.ts';
import { findSetMembers } from './lib/findSet.ts';
import useLinkedBoxes from './hooks/useLinkedBoxes.ts';
import { isDeleteElement, type RedactElement } from './lib/redactElements.ts';
import EditorPageHeader from '../../editor-ui/EditorPageHeader.tsx';
import FindBar from './components/FindBar.tsx';
import SavedFileCheck from './components/SavedFileCheck.tsx';
import { removedMessage, type InPlaceFinding } from './lib/check/checkCopy.ts';
import { DetailsFooter } from './components/details/DetailsFooter.tsx';
import { DetailsSheet } from './components/details/DetailsSheet.tsx';
import { useDocumentDetails } from './hooks/details/useDocumentDetails.ts';
import { describeDetails, detailsSummary, changesPieces } from './lib/details/describeDetails.ts';
import type { DetailEdits } from './lib/detailEdits.js';
import useSavedFileCheck, { traceLocale } from './hooks/useSavedFileCheck.ts';
import { deletedTerms } from './lib/check/deletedTerms.ts';
import { uncoveredMatches } from './lib/find/findMatches.ts';
import type { CheckBox, CheckTerm, SavedPlace } from './lib/check/types.ts';
import FindHighlights from './components/FindHighlights.tsx';
import useFind from './hooks/useFind.ts';
import { useTapOutsideDeselect } from './hooks/useTapOutsideDeselect.ts';
import type { FindMatch } from './lib/find/types.ts';
import type { ActionHistoryEntry, HistoryPlace, PlaceHistoryEntry } from '../../editor/model/actionHistory.ts';
import {
  initialRedactState, redactReducer, brushKindOf, finishPhaseOf, isDirty, isFullscreenActive as isFullscreenActiveOf,
  canRedo as canRedoOf, restoredNoteVisible, selectRemovedPlaces, selectDetailEdits, type SavedExport,
} from './state/redactState.ts';
import { type ElementUpdateKind } from '../../editor/model/updateKind.ts';
import { useHistoryShortcuts } from '../../lib/history/useHistoryShortcuts.js';
import { usePdfShare } from '../../lib/usePdfShare.js';
import { useHoldUpdate } from '../../lib/useHoldUpdate.ts';
import { useLatestRun } from '../../lib/useLatestRun.ts';
import { useNavigatingAway } from '../../lib/useNavigatingAway.ts';
import ErrorMessage from '../../shell/ErrorMessage.tsx';
import { FileActions } from '../../shell/ToolShell.tsx';
import RedactFinish from './components/RedactFinish.tsx';
import RedactDoneStrip from './components/RedactDoneStrip.tsx';
import RatingPrompt, { useDownloaded } from '../../shell/RatingPrompt.tsx';
import NeedsUnlock, { type NeedsUnlockKind } from '../../shell/NeedsUnlock.tsx';
import { finishStatusText, type FinishFacts, type FinishPhase } from './lib/finishState.ts';
import { redactedFileName } from './lib/redactFileName.ts';
import workspaceStyles from '../../editor-ui/Workspace.module.css';
import styles from './PdfRedactTool.module.css';
import { describeFile } from '../../lib/format.js';
import useCurrentPage from '../../editor-ui/hooks/useCurrentPage.js';
import type { RedactToolType } from '../../editor/model/editorModel.ts';
import type { BlurStrength } from '../../editor/model/blurStrength.ts';
import { dropCause, reportError } from '../../lib/errorReport.ts';
import { sendHandoff } from '../../lib/sendHandoff.ts';
import { reportToolLifecycleEvent } from '../../lib/productAnalytics.ts';
import { formatMessage } from '../../lib/formatMessage.ts';
import { englishRedactMessages as t } from './messages.ts';

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

/** A call right after a dispatch passes the fresh values the closure has not seen yet (removedPlaces newest first). */
type ExportOverrides = { removedPlaces?: HistoryPlace[]; details?: DetailEdits };

export default withIslandBoundary(function PdfRedactTool() {
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

  const { file, numPages, pdfDocument, sizedPageCount, status, errorDetail, progress, showWelcomeTip } = state.document;
  useHoldUpdate(status === 'redacting'); // finishPhase 'exporting' is this same state
  const { exportedForHandoff, handoffFailed, removing, removedNote } = state.finish;

  // A returning person already knows this editor contains saved work. Do not
  // spend the identity row repeating the neutral newcomer tip after that work
  // restores; tool-specific instructions remain available whenever a tool is
  // armed. Manual picks deliberately reset this to the welcoming default.
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
  // Read by the invalidation effect below, which fires after the render that
  // already moved status on (a replacement file sets 'loading' in the same
  // batch as `file`), so it must ask what the workspace is showing now.
  const statusRef = useRef(status);
  statusRef.current = status;
  // Export errors are recoverable without unmounting the editor - status stays
  // 'editing' and this renders alongside the workspace. A failed document load
  // still uses status='error', which unmounts the workspace (see below).
  // RED-36: an edit retired a running export. Said where it is seen (the
  // status line and the finish row), not only to a screen reader; cleared by
  // the next export or the next file.
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
    if (tool) recordAction('arm_tool');
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

  // RED-53: the last custom colours, offered on a whiteout's toolbar. Only a
  // deliberate pick is recorded, never an automatic sample or a brush drag step.
  const [recentColors, rememberRecentColor] = useRecentWhiteoutColors();

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
  const [handoffBusy, setHandoffBusy] = useNavigatingAway();

  const workspaceRef = useRef<HTMLDivElement | null>(null);

  useFullscreenChange(workspaceRef, (active) => dispatch({ type: 'FULLSCREEN_CHANGED', active }));

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

  const toggleFullscreen = () => toggleWorkspaceFullscreen(
    workspaceRef.current,
    isPseudoFullscreen,
    (active) => dispatch({ type: 'PSEUDO_FULLSCREEN_CHANGED', active }),
  );

  const pageWrapperRefs = useRef<(HTMLDivElement | null)[]>([]);
  // RED-51: the page's colour just outside a box, read from that page's canvas.
  const samplePage = (pageIndex: number, box: PercentBox) => sampleRingColor(pageWrapperRefs.current[pageIndex]?.querySelector('canvas'), box);
  // The restored document's 77 page canvases acquire their intrinsic size
  // asynchronously. Keep the informational content below the editor out of
  // paint until all of those dimensions are real: otherwise it visibly walks
  // down once per canvas while Redact reconstructs a long saved document.
  // This is deliberately Redact-local; Sign's workspace has its own render
  // path and this is not a layout contract shared with Merge.
  const renderedPageNumbersRef = useRef(new Set<number>());
  // ENC-02: a protected PDF is not a failed load. It gets one quiet state in place of the editor
  // (src/shell/NeedsUnlock.tsx), reset whenever a new file is chosen.
  const [needsUnlock, setNeedsUnlock] = useState<NeedsUnlockKind | null>(null);
  useEffect(() => () => {
    // An export resolving after the editor has left the tree must not fire a
    // download for a tool the person walked away from (Sign does the same
    // with its own useLatestRun).
    exportRun.invalidate();
  }, []);

  const handlePageViewportReady = useCallback((pageNum: number) => {
    // PdfPageCanvas calls this immediately after it gives the canvas its real
    // viewport dimensions. A Set makes repeated React effects harmless and
    // correctly accepts a legitimate 300×150 PDF page.
    if (renderedPageNumbersRef.current.has(pageNum)) return;
    renderedPageNumbersRef.current.add(pageNum);
    dispatch({ type: 'PAGE_SIZED', sizedPageCount: renderedPageNumbersRef.current.size });
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
    dispatch({ type: 'SAVED_EXPORT_DISCARDED' });
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
    dispatch({ type: 'EXPORT_CANCELLED', announcement: t.exportSuperseded });
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

  // loadPdf.ts reports a coarse status; each one is its own transition here.
  const setLoadStatus = (next: 'loading' | 'editing' | 'error') =>
    dispatch({ type: next === 'loading' ? 'FILE_LOAD_STARTED' : next === 'editing' ? 'FILE_LOADED' : 'FILE_LOAD_FAILED' });

  // The file session (load, add, recents, unique ids, draft, "Open with") is shared with Sign.
  const { handleFilesAdded, fileBytesRef, draftSaveState, isRestoring } = useEditorFileSession<RedactElement>({
    tool: 'redact',
    file,
    pdfDocument,
    status,
    setLoadStatus,
    setAnnouncement,
    messages: { invalidPdf: t.invalidPdf, needsPassword: t.needsPassword, ownerRestricted: t.ownerRestricted },
    onNeedsUnlock: setNeedsUnlock,
    initialize: ({ file: selected, preset, restored }) => {
      setNeedsUnlock(null);
      renderedPageNumbersRef.current = new Set();
      deleteTool.clearLifts(); // a lift from the last file must never show over this one
      // RED-39: a new file starts clean - no tool armed, nothing selected, Find
      // closed with its term. None of that belongs to the file just left.
      find.setOpen(false);
      find.setTerm('');
      find.setPreset(null);
      // RED-40: a restored document keeps its own colour and strength.
      const brush = resolveBrush(preset.carried, getAppStyle());
      const color = resolveWhiteoutColor(preset.carried, getAppStyle(), getEditorPreference('lastWhiteoutColor'));
      const strength = resolveRedactBlurStrength(preset.carried, getAppStyle(), getEditorPreference('lastBlurStrength'));
      // A restored draft has no redoable future - future is never persisted.
      dispatch({
        type: 'FILE_INITIALIZED', file: selected, restored, elements: preset.elements || [], past: preset.actionHistory,
        carried: preset.carried, details: preset.details ?? {}, brush, activeColor: color, activeBlurStrength: strength,
      });
    },
    onDocument: (doc, isCurrent) => {
      if (!isCurrent()) return;
      dispatch({ type: 'DOCUMENT_READY', pdfDocument: doc, numPages: doc.numPages });
    },
    draft: {
      elements,
      actionHistory,
      carried,
      details: state.edits.details,
      isDirty: isDirty(state),
      isElement: isRedactElement,
    },
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
    const color = type === 'blackout' ? '#000000' : undefined;
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
        // RED-51: a whiteout takes the page's own colour (a synchronous read of
        // the canvas, inside this one-shot commit) and keeps following it.
        const element: RedactElement = {
          id, pageIndex, ...patch, type,
          ...(type === 'whiteout' ? { color: samplePage(pageIndex, patch) ?? '#ffffff', colorMode: 'auto' as const } : {}),
          ...(type === 'blackout' ? { color } : {}),
          ...(type === 'blur' ? { strength: activeBlurStrength } : {}),
        };
        commands.add([element], { type: `ADD_${type.toUpperCase()}`, description: formatMessage(t.addedBox, { type }) });
        recordAction('place_mark');
        setAnnouncement(formatMessage(t.addedBoxAnnounce, { type }));
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
    const word = stroke.type === 'blurStroke' ? t.strokeBlur : t.strokeWhiteout;
    commands.add([stroke as RedactElement], { type: 'ADD_STROKE', description: formatMessage(t.paintedStroke, { kind: word }) });
    recordAction('place_mark');
    setAnnouncement(formatMessage(t.paintedStrokeAnnounce, { kind: word }));
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
      type: 'DELETE_ELEMENT', description: formatMessage(t.removedBox, { type: el.type }), pageIndex: el.pageIndex, chipMessage: formatMessage(t.removedBox, { type: el.type }),
    });
    recordAction('delete_mark');
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
    derive: (element, changes) => (isDeleteElement(element) ? {} : autoColorChanges(element, changes as Partial<typeof element>, samplePage)),
  });
  const { unlinkFromGroup, clearPageOptions } = linkedBoxes;
  // The trail names what the edit was: a patch that reaches width or height is a resize, one that
  // only moves left/top is a move, anything else (colour, strength) a style edit. Names only.
  const updateElement = (id: string, changes: Partial<RedactElement>) => {
    linkedBoxes.updateElement(id, changes);
    recordAction('width' in changes || 'height' in changes ? 'resize_mark' : 'left' in changes || 'top' in changes ? 'move_mark' : 'edit_mark');
  };
  const duplicateElement = (id: string) => { linkedBoxes.duplicateElement(id); recordAction('place_mark'); };
  const repeatOnEveryPage = (id: string) => { linkedBoxes.repeatOnEveryPage(id); recordAction('place_mark'); };
  const removeLinked = (id: string, kind: Parameters<typeof linkedBoxes.removeLinked>[1]) => { linkedBoxes.removeLinked(id, kind); recordAction('delete_mark'); };
  const clearPage = (pageIndex: number) => { linkedBoxes.clearPage(pageIndex); recordAction('delete_mark'); };
  const keepOnlyThis = (id: string) => { linkedBoxes.keepOnlyThis(id); recordAction('delete_mark'); };

  // Cmd/Ctrl+Z reverts the single newest command; the reducer reads the
  // current `past`, so two undo keydowns landing in the same task (key
  // auto-repeat) are two distinct reverts. Nothing to undo reverts nothing.
  const undoLast = () => { dispatch({ type: 'UNDO', announceTemplate: t.undone }); if (actionHistory.length > 0) recordAction('undo'); };

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
    dispatch({ type: 'UNDO', entryId, announceTemplate: t.undone });
    recordAction('undo');
  };

  // Shift+Cmd/Ctrl+Z or Ctrl+Y: reapplies the single most recently undone
  // command, the exact mirror of undoLast.
  const redoLast = () => { dispatch({ type: 'REDO', announceTemplate: t.redone }); if (canRedoOf(state)) recordAction('redo'); };

  useHistoryShortcuts(undoLast, redoLast);

  // RED-51: a picked colour stops the box following the page and is remembered
  // like any choice; an automatic sample never goes through rememberColor.
  const pickColor = (id: string, color: string) => {
    updateElement(id, { color, colorMode: 'custom' });
    rememberColor(color);
    rememberRecentColor(color);
  };
  const matchPage = (id: string) => updateElement(id, { colorMode: 'auto' });
  const pickBrushColor = (color: string) => {
    rememberColor(color);
    rememberRecentColor(color);
  };

  // Two pipettes, one active at a time: the brush's, or the selected whiteout's.
  const selectedEl = elements.find((el) => el.id === selectedBoxId);
  const hasBrushTarget = brushKind === 'whiteout';
  const selectedWhiteoutId = selectedEl && (selectedEl.type === 'whiteout' || selectedEl.type === 'whiteoutStroke') ? selectedEl.id : null;
  useEyedropper(
    (eyedropping === 'brush' && hasBrushTarget) || (eyedropping === 'box' && selectedWhiteoutId !== null),
    (color) => (eyedropping === 'box' && selectedWhiteoutId !== null ? pickColor(selectedWhiteoutId, color) : pickBrushColor(color)),
    () => dispatch({ type: 'EYEDROPPER_STOPPED' }),
    '.redact-draw-area',
  );
  useEffect(() => {
    dispatch({ type: 'EYEDROPPER_STOPPED' });
  }, [hasBrushTarget, selectedWhiteoutId]);

  // Passed to RedactBoxToolbar for blur boxes: applies the strength and
  // remembers it, as pickColor above does for a whiteout's chosen colour.
  const changeBlurStrength = (id: string, strength: BlurStrength) => {
    updateElement(id, { strength });
    rememberBlurStrength(strength);
  };

  // RED-02: find and redact. Every box of every chosen match (one per line
  // the match covers) is added as one history entry, so one Undo takes back
  // a whole "Redact all".
  const find = useFind(pdfDocument, numPages, elements);
  // RED-52: reading sizes only for blur left whiteout and blackout boxes deaf
  // to the arrow keys; needsPageSizes names everything that needs them.
  const pageSizesPt = usePageSizesPt(pdfDocument, numPages, needsPageSizes(elements, brushKind !== null));

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
    recordAction('place_mark');
    setAnnouncement(`${description}.`);
    find.setCurrentId(nextId);
  };

  // RED-17: the check of each saved export. Every page with a box is saved
  // as a picture, with no text layer at all (redact.js), so those are the
  // pages text search can't see.
  const checkBoxes: CheckBox[] = checkBoxesFromElements(elements);
  // RED-59: what the file says about itself, as it was opened.
  const traces = useDocumentDetails(fileBytesRef.current, pdfDocument !== null);
  const rows = useMemo(() => (traces ? describeDetails(traces, { locale: traceLocale(), now: new Date() }) : []), [traces]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsAtOpenRef = useRef<DetailEdits>({});
  const openDetails = () => { detailsAtOpenRef.current = state.edits.details; setDetailsOpen(true); };
  const savedCheck = useSavedFileCheck({
    pdfDocument,
    originalBytes: fileBytesRef.current,
    announce: setAnnouncement,
    detailEdits: state.edits.details,
    detailRows: rows,
    saved: exportedForHandoff?.blob ?? null,
    boxes: checkBoxes,
    deletedWords: deletedTerms(elements),
    picturePages: [...new Set(checkBoxes.map((box) => box.pageIndex))].sort((a, b) => a - b),
    measure: find.measure,
  });
  const coverFromCheck = (term: CheckTerm, pageIndex: number) => {
    if (savedCheck.state.status !== 'done') return;
    const pages = savedCheck.state.outcome.context.original.filter((page) => page.text.pageIndex === pageIndex);
    redactMatches(uncoveredMatches(pages, term.finder, checkBoxes, find.measure));
  };

  // RED-60: a change that takes something out of the saved file is a history
  // step, and the file is saved again through the normal export (which replays
  // every step). The edit bumps `documentRevision`, whose invalidation effect
  // retires any export begun before the render, so the export starts from an
  // effect declared after it, once the new revision is the current one.
  const pendingExportRef = useRef<null | { overrides: ExportOverrides; done: (ok: boolean) => void }>(null);
  useEffect(() => {
    const pending = pendingExportRef.current;
    if (!pending) return;
    pendingExportRef.current = null;
    // expected: handleSavePdf reports its own failures; a rejection here only releases the waiting button
    handleSavePdf('download', pending.overrides).then(pending.done, () => pending.done(false));
  }, [documentRevision]);

  const reexport = async (change: () => void, overrides: ExportOverrides, note?: string) => {
    if (removing || savedCheck.state.status !== 'done' || !exportedForHandoff) return;
    dispatch({ type: 'REMOVE_STARTED' });
    try {
      const exported = new Promise<boolean>((resolve) => { pendingExportRef.current = { overrides, done: resolve }; });
      change();
      if ((await exported) && note) dispatch({ type: 'REMOVAL_NOTED', note });
    } finally {
      dispatch({ type: 'REMOVE_SETTLED' });
    }
  };

  // RED-25: Remove it.
  const removeFromCheck = async (finding: InPlaceFinding) => {
    if (savedCheck.state.status !== 'done') return;
    const place = savedCheck.state.outcome.context.saved.places[finding.placeIndex];
    if (!place) return;
    const entry: PlaceHistoryEntry = {
      id: uniqueId(),
      type: 'place',
      operation: 'remove-place',
      place,
      pageIndex: place.pageIndex ?? 0,
      description: removedMessage(place).replace(/ Saved again and downloaded\.$/, '').replace(/\.$/, ''),
      timestamp: Date.now(),
    };
    await reexport(
      () => dispatch({ type: 'PLACE_REMOVED', entry }),
      { removedPlaces: [place, ...selectRemovedPlaces(state)] },
      removedMessage(place),
    );
  };

  // RED-59: closing the sheet commits what changed in it. An existing export
  // is made again with the new details; otherwise the commit only saves the draft.
  const closeDetails = () => {
    setDetailsOpen(false);
    if (JSON.stringify(state.edits.details) === JSON.stringify(detailsAtOpenRef.current)) return;
    const commit = () => dispatch({ type: 'DETAILS_COMMITTED' });
    if (removing || savedCheck.state.status !== 'done' || !exportedForHandoff) { commit(); return; }
    return reexport(commit, { details: state.edits.details });
  };

  const exportRedacted = async (exportAction: 'download' | 'share' | 'handoff' = 'download', overrides: ExportOverrides = {}): Promise<SavedExport | null> => {
    if (!file) return null;
    if (elements.length === 0) {
      setAnnouncement(t.drawFirst);
      return null;
    }

    const hasBoxes = elements.some((el) => el.type !== 'delete');
    dispatch({
      type: 'EXPORT_STARTED',
      announcement: hasBoxes ? 'Saving the redacted PDF…' : 'Deleting what you chose…',
    });
    recordAction('export');
    reportToolLifecycleEvent('tool_operation_started', 'redact');

    // DEBT-18: everything this run is an export *of*, captured before the
    // first await. `sourceFile` is used below instead of `file` so the name
    // on the result can never be a newer file's.
    const run = exportRun.begin();
    const sourceFile = file;
    // DEBT-51: the bytes read at load time, so a file moved on disk after
    // picking cannot fail the export (the browser rejects a second read).
    const sourceBytes = fileBytesRef.current ?? sourceFile;

    try {
      // DEBT-20: applyPageEdits pulls in @cantoo/pdf-lib, which is only needed
      // to write the export. Importing it here instead of at module scope keeps
      // it out of everything /redact/ downloads and compiles before a file is
      // even open. A failed chunk load lands in the same catch as a failed
      // export, which is the right outcome: the boxes stay, the message is
      // "try again". Repeat exports reuse the module registry's copy.
      const [{ applyPageEdits }, { removePlaces }] = await Promise.all([
        import('./lib/applyPageEdits.js'),
        import('./lib/check/removePlaces.ts'),
      ]);
      // RED-60: every removal replays, oldest first, onto the new document.
      const places = [...(overrides.removedPlaces ?? selectRemovedPlaces(state))].reverse();
      const { blob: redactedBlob } = await applyPageEdits(sourceBytes, elements, (p) => {
        if (run.isCurrent()) dispatch({ type: 'EXPORT_PROGRESS', progress: p });
      }, {
        finish: (doc) => removePlaces(doc, places as SavedPlace[]),
        details: overrides.details ?? selectDetailEdits(state),
      });
      if (!run.isCurrent()) return null;
      run.settle();
      const filename = redactedFileName(sourceFile.name);
      // Finding #4: a successful export (either export path - Download or
      // Share - counts) is what unlocks the "Compress" hand-off below.
      const saved = { blob: redactedBlob, name: filename };
      dispatch({ type: 'EXPORT_SAVED', saved });

      if (exportAction === 'handoff') {
        // The chips want the file, not a download: make it, keep it, deliver nothing.
        dispatch({ type: 'EXPORT_DELIVERED', announcement: t.readyHandoff });
      } else if (exportAction === 'share' && prepare(redactedBlob, filename)) {
        dispatch({ type: 'EXPORT_DELIVERED', announcement: t.readyShare });
        reportToolLifecycleEvent('tool_result_ready', 'redact');
      } else {
        recordAction('download');
        download(redactedBlob, filename);
        dispatch({ type: 'EXPORT_DELIVERED', announcement: t.savedStarted });
        reportToolLifecycleEvent('tool_result_ready', 'redact');
      }
      return saved;
    } catch (err) {
      reportError('redact', err, 'export');
      console.error(err);
      // ENC-02: the load gate should have caught a protected file, so this is reported above (a gate
      // miss), but the person gets the way on rather than a Try again that can never work.
      const name = Reflect.get(Object(err), 'name');
      const message = String(Reflect.get(Object(err), 'message') ?? '');
      if (run.isCurrent() && (name === 'EncryptedPDFError' || message.includes('is encrypted'))) {
        run.settle();
        setNeedsUnlock('owner-restricted');
        dispatch({ type: 'EXPORT_FAILED', detail: '', announcement: t.pdfProtected });
        return null;
      }
      // A failure nobody is waiting for any more: the invalidation effect has
      // already put the editor back, and reporting it would blame the user's
      // current boxes for a run they replaced.
      if (!run.isCurrent()) return null;
      run.settle();
      reportToolLifecycleEvent('tool_operation_failed', 'redact');
      // Recoverable: keep the workspace mounted so the boxes that caused the
      // failure are still there to fix, instead of unmounting the editor
      // behind a dead-end error screen (status='error' is reserved for a
      // failed document load, which never gets this far).
      // A tab left open across a deploy asks for chunks the new deploy no longer serves, so a retry
      // fails the same way (seen 2026-10-22: one tab, four tries). A reload fixes it and restores the draft.
      const detail = dropCause(err) === 'module_load'
        ? t.exportUpdated
        : t.exportFailed;
      dispatch({ type: 'EXPORT_FAILED', detail, announcement: formatMessage(t.downloadStoppedDetail, { detail }) });
      return null;
    }
  };

  // The export Download, Share and the hand-off chips all run: makes the redacted file
  // and keeps it as exportedForHandoff. Saving it to the device is exportRedacted's
  // delivery step, chosen by exportAction, so a hand-off never triggers a download.
  const handleSavePdf = async (exportAction: 'download' | 'share' = 'download', overrides: ExportOverrides = {}): Promise<boolean> =>
    (await exportRedacted(exportAction, overrides)) !== null;

  // Skips regenerating the redacted PDF when a Share-prepared file already
  // matches the current elements (usePdfShare.downloadPrepared - cleared
  // automatically by the effect above whenever file/elements change, so this
  // never serves a stale export). Mirrors PdfSignTool's handleDownloadPdf.
  const handleDownloadPdf = () => {
    dispatch({ type: 'EXPORT_ERROR_CLEARED' });
    if (downloadPrepared()) {
      setAnnouncement(t.downloadStarted);
      recordAction('download');
      return;
    }
    void handleSavePdf('download'); // reason: exportRedacted catches and reports its own failure
  };

  const handleSharePdf = async () => {
    const result = await sharePrepared();
    if (result.status === 'shared') {
      setAnnouncement(t.shared);
      recordAction('share');
    } else if (result.status === 'canceled') {
      setAnnouncement(t.shareCanceled);
    } else if (result.status === 'error') {
      console.error(result.error);
      setAnnouncement(t.shareError);
    }
  };

  // Finding #4: hands the redacted bytes to Compress or Sign without
  // re-picking, the same one-shot baton Merge's own hand-off uses
  // (draftStore.js's saveHandoff/takeHandoff, consumed on the other end by
  // useHandoffIntake.ts) - reused here rather than copied, since Redact is
  // a tool and cannot import another tool's PdfMergeTool.tsx (module
  // boundaries). The chips show whenever Download is enabled: an export that
  // still matches the document (any edit drops it) is handed on as is, else
  // the same export Download runs is made first, without saving it to the device.
  const requestHandoff = async (tool: import('../../lib/toolIds.ts').RedactHandoffTarget) => {
    if (handoffBusy) return;
    setHandoffBusy(true);
    dispatch({ type: 'HANDOFF_STARTED' });
    try {
      const exported = exportedForHandoff ?? await exportRedacted('handoff');
      if (!exported) throw new Error('export');
      await sendHandoff(tool, { fileName: exported.name, fileType: 'application/pdf', fileBytes: await exported.blob.arrayBuffer() });
    } catch (err) {
      // expected: saveHandoff reports its own failure, this shows the handoff-failed state
      console.error(err);
      dispatch({ type: 'HANDOFF_FAILED' });
      setHandoffBusy(false);
    }
  };

  // RED-36: everything the finish row and the status line say, from state
  // that already exists. A page with any box is saved as a picture; a page
  // with only deletions keeps its text (applyPageEdits.js).
  const finishPhase: FinishPhase = finishPhaseOf(state);
  const finishFacts: FinishFacts = {
    phase: finishPhase,
    progress,
    fileName: exportedForHandoff?.name ?? (file ? redactedFileName(file.name) : ''),
    pageCount: numPages,
    picturePages: new Set(elements.filter((el) => el.type !== 'delete').map((el) => el.pageIndex)).size,
    boxCount: elements.filter((el) => el.type !== 'delete').length,
    deletionCount: elements.filter((el) => el.type === 'delete').length,
    fileSize: exportedForHandoff?.blob.size ?? null,
  };

  // RED-66: the toolbar Download finishes where the person is looking. It asks
  // for the strip under the sticky toolbar; the strip shows once the save lands,
  // stays up through a re-export (Download again, Remove it) so the rating ask in
  // it is not lost, and goes with the next edit (which ends the 'saved' phase), a
  // failed save or the ✕. The toolbar button says "Saved" for a moment after each
  // of its own clicks lands, never after a save started elsewhere.
  const [stripOpen, setStripOpen] = useState(false);
  const [toolbarSaves, setToolbarSaves] = useState(0);
  const [downloadConfirmed, setDownloadConfirmed] = useState(false);
  const confirmedSaveRef = useRef(0);
  const showStrip = stripOpen && (finishPhase === 'saved' || (finishPhase === 'exporting' && exportedForHandoff !== null));
  useEffect(() => {
    if (finishPhase !== 'exporting' && finishPhase !== 'saved') setStripOpen(false);
  }, [finishPhase]);
  // An edit discards the saved export (and a Remove it re-export starts from
  // there): that is the next edit, so the strip goes even if a save follows.
  const hadExportRef = useRef(false);
  useEffect(() => {
    if (hadExportRef.current && exportedForHandoff === null) setStripOpen(false);
    hadExportRef.current = exportedForHandoff !== null;
  }, [exportedForHandoff]);
  useEffect(() => {
    if (!stripOpen || finishPhase !== 'saved' || confirmedSaveRef.current === toolbarSaves) return;
    confirmedSaveRef.current = toolbarSaves;
    setDownloadConfirmed(true);
  }, [stripOpen, finishPhase, toolbarSaves]);
  useEffect(() => {
    if (!downloadConfirmed) return;
    const timer = setTimeout(() => setDownloadConfirmed(false), 2000);
    return () => clearTimeout(timer);
  }, [downloadConfirmed]);
  const handleToolbarDownload = () => {
    setStripOpen(true);
    setToolbarSaves((n) => n + 1);
    handleDownloadPdf();
  };
  // SEO-46's ask, mounted once: in the strip while it is open, else last in the
  // bottom row. Two mounted copies would race for the one device-wide ask.
  const downloaded = useDownloaded();
  const rating = <RatingPrompt tool="redact" downloaded={downloaded} />;

  return (
    <BasePdfTool
      hasFiles={!!file}
      onFilesAdded={handleFilesAdded}
      intake={{ multiple: false, accept: '.pdf,application/pdf' }}
      identity={{
        file,
        // Finding #5/#6: a real page-1 thumbnail (FilePreview.tsx, via `file`)
        // instead of the generic glyph, and the identity row names what
        // Download will actually produce once there is something to redact -
        // rename-in-place is not required, so this stays derived rather than
        // becoming its own editable field the way Merge's output name is.
        label: elements.length > 0 && file ? redactedFileName(file.name) : file?.name,
        meta: describeFile(file, numPages, isFullscreenActive ? currentPage : null),
      }}
      empty={{ art: <RedactVerb />, message: 'Select or drop a PDF to redact' }}
      draft={{ saveState: draftSaveState, checking: isRestoring }}
      analytics={{ tool: 'redact' }}
      owns={{ shell: true, rating: true }}
    >
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      {/* No loading-state message: pdf.js parses fast enough that a text block
          here just added its own undersized-then-replaced flicker (see
          Workspace.module.css's fade-in on .workspace, which softens the real
          jump from nothing to a loaded document instead). */}

      {needsUnlock && <NeedsUnlock kind={needsUnlock} file={file} bytes={fileBytesRef.current} from="redact" toolName="Redact" verb="redact" />}

      {!needsUnlock && (status === 'editing' || status === 'redacting') && pdfDocument && (
        <div
          className={`${workspaceStyles.workspace}${isPseudoFullscreen ? ` ${workspaceStyles['pseudo-fullscreen']}` : ''}${status === 'redacting' ? ` ${workspaceStyles['is-processing']}` : ''}`}
          ref={workspaceRef}
          data-pseudo-fullscreen={isPseudoFullscreen || undefined}
          aria-busy={status === 'redacting'}
          data-redact-workspace-ready={numPages > 0 && sizedPageCount === numPages ? 'true' : 'false'}
        >
          <RedactToolbar
            tool={{ active: activeStyle, locked: toolLocked, set: setTool, brushMode: brushKind !== null }}
            announce={setAnnouncement}
            fullscreen={{ active: isFullscreenActive, toggle: toggleFullscreen }}
            output={{
              download: handleToolbarDownload,
              prepareShare: () => handleSavePdf('share'),
              share: handleSharePdf,
              canShare: canSharePdf,
              shareReady,
              exporting: status === 'redacting',
              downloadConfirmed,
            }}
            history={{ entries: actionHistory, undo: undoLast, redo: redoLast, canRedo: canRedoOf(state) }}
            undoChip={{
              action: undoAction && {
                message: undoAction.message,
                extra: undoAction.extra && {
                  label: undoAction.extra.label,
                  // Pressing it spends the chip, like Undo; the action it runs may register its own.
                  onSelect: () => { const run = undoAction.extra!.onSelect; clearUndoChip(); run(); },
                },
              },
              run: runUndoChip,
            }}
            elementsCount={elements.length}
            status={{
              message: showStrip ? null : finishStatusText(finishFacts),
              welcomeTip: showWelcomeTip,
              restoredNote: restoredNoteVisible(state),
            }}
            find={{
              open: find.open,
              toggle: () => find.setOpen(!find.open),
              bar: find.open && (
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
                  onRedactCurrent={() => { if (find.current) redactMatches([find.current]); }}
                  onRedactAll={() => redactMatches(find.openMatches)}
                  onClose={() => find.setOpen(false)}
                />
              ),
            }}
            slots={{
              brushControls: (activeStyle === 'blur' || activeStyle === 'whiteout') && (
                <BrushControls
                  tool={activeStyle}
                  settings={brush}
                  onSettings={(next) => { changeBrush(next); recordAction('change_setting'); }}
                  color={activeColor}
                  onColor={(color) => { rememberColor(color); recordAction('change_setting'); }}
                  eyedropping={eyedropping === 'brush'}
                  onToggleEyedropper={() => dispatch({ type: 'EYEDROPPER_TOGGLED', target: 'brush' })}
                />
              ),
              doneStrip: showStrip && (
                <RedactDoneStrip
                  facts={finishFacts}
                  handoffBusy={handoffBusy}
                  handoffFailed={handoffFailed}
                  onHandoff={(tool) => { void requestHandoff(tool); /* reason: requestHandoff catches its own failure and shows the hand-off error */ }}
                  onClose={() => setStripOpen(false)}
                >
                  {rating}
                </RedactDoneStrip>
              ),
            }}
            peek={{ active: peekAll, onChange: setPeekAll }}
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
                  data-eyedropper-surface
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
                  {elements.filter((el): el is Exclude<RedactElement, { type: 'delete' }> => el.pageIndex === i && el.type !== 'delete').map(el => {
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
                        peekAll={peekAll}
                        pageSize={{ width: pageSizesPt[el.pageIndex]?.width, height: pageSizesPt[el.pageIndex]?.height }}
                        pointer={{
                          onSelect: (id: string) => dispatch({ type: 'BOX_SELECTED', id }),
                          onChange: updateElement,
                          getPageWrapper: () => pageWrapperRefs.current[el.pageIndex],
                          onHoverEnter: () => dispatch({ type: 'BOX_HOVERED', id: el.id }),
                          onHoverLeave: () => dispatch({ type: 'BOX_UNHOVERED', id: el.id }),
                        }}
                        actions={{ onDelete: deleteElement, onDuplicate: duplicateElement, onChangeStrength: changeBlurStrength }}
                        color={{
                          onPick: pickColor,
                          onMatchPage: matchPage,
                          recent: recentColors,
                          eyedropping: eyedropping === 'box',
                          onToggleEyedropper: () => dispatch({ type: 'EYEDROPPER_TOGGLED', target: 'box' }),
                        }}
                        repeatGroup={{
                          size: selected ? groupMembers(elements, el.id).length : undefined,
                          onRepeatOnEveryPage: canRepeat ? repeatOnEveryPage : undefined,
                          onUnlink: () => unlinkFromGroup(el.id),
                          onKeepOnlyThisPage: () => keepOnlyThis(el.id),
                          onRemove: () => removeLinked(el.id, 'repeatGroup'),
                        }}
                        findSet={{
                          size: selected ? findSetMembers(elements, el.id).length : undefined,
                          onRemove: () => removeLinked(el.id, 'findSet'),
                        }}
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
                      onSelect={(...args) => { deleteTool.markObject(...args); recordAction('delete_mark'); }}
                    />
                  )}
                  {activeStyle === 'delete' && (
                    <DeleteMarquee
                      objects={deleteTool.deletableObjects.filter((object) => object.pageIndex === i && !deleteTool.markedForDeletionIds.has(object.id))}
                      onCommit={(...args) => { deleteTool.markObjects(...args); recordAction('delete_mark'); }}
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

          <DetailsFooter summary={detailsSummary(rows, state.edits.details)} onReview={openDetails} reading={traces === null} />

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
            onHandoff={(tool) => { void requestHandoff(tool); /* reason: requestHandoff catches its own failure and shows the hand-off error */ }}
            handoffBusy={handoffBusy}
            handoffFailed={handoffFailed}
            rating={showStrip ? null : rating}
          >
            {/* Export error - recoverable, so it renders alongside the still-mounted
                workspace instead of replacing it (see handleSavePdf's catch). */}
            {errorDetail && (
              <ErrorMessage title={t.downloadStopped} fullWidth>
                {errorDetail}
              </ErrorMessage>
            )}
            <SavedFileCheck state={savedCheck.state} onSearch={savedCheck.search} onCover={coverFromCheck} onRemove={removeFromCheck} removing={removing} note={removedNote} detailsChanged={changesPieces(rows, state.edits.details)} detailsSurvived={savedCheck.detailsSurvived} onReviewDetails={openDetails} />
          </RedactFinish>
        </div>
      )}

      <DetailsSheet
        open={detailsOpen}
        rows={rows}
        edits={state.edits.details}
        onEdit={(id, edit) => dispatch({ type: 'DETAIL_EDITED', id, edit })}
        onRestore={(id) => dispatch({ type: 'DETAIL_RESTORED', id })}
        onClose={closeDetails}
      />

      {/* Error */}
      {status === 'error' && !needsUnlock && (
        <ErrorMessage title={t.didntOpen} fullWidth>
          <LoadErrorBody />
        </ErrorMessage>
      )}

    </BasePdfTool>
  );
});

// RED-39: a failed load used to leave no way out on a phone - the file is
// already set, so no dropzone shows, and Replace lives in the toolbar that
// never mounted. It renders inside BasePdfTool, so the shell's own Replace
// (FileActions, through useToolShell().requestReplace) is in reach.
function LoadErrorBody() {
  return (
    <>
      {t.loadErrorLead} <a href="/unlock/">{t.loadErrorUnlock}</a> {t.loadErrorTail}
      <FileActions />
    </>
  );
}
