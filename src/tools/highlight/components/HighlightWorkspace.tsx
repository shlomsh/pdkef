import type { ComponentChildren, ComponentProps } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import FeedbackButton from '#editor-ui/FeedbackButton.tsx';
import ReadingCapsule from './capsule/ReadingCapsule.tsx';
import UndoRedoButtons from '#editor-ui/UndoRedoButtons.tsx';
import EditorExportActions from '#editor-ui/EditorExportActions.tsx';
import toolbarStyles from '#editor-ui/SignToolbar.module.css';
import useCurrentPage from '#editor-ui/hooks/useCurrentPage.js';
import workspaceStyles from '#editor-ui/Workspace.module.css';
import type { useHighlightMarks } from '../hooks/useHighlightMarks.ts';
import type { WorkspaceZoom } from '../hooks/useWorkspaceZoom.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import ZoomMenu from './ZoomMenu.tsx';
import HighlightPage from './HighlightPage.tsx';
import MarkerButton from './MarkerButton.tsx';
import PenHint from './PenHint.tsx';
import PhoneNotes from './PhoneNotes.tsx';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import DownloadDone from './DownloadDone.tsx';
import type { useSaveToDrive } from '#shell/pageWorkspace/useSaveToDrive.ts';
import DriveSaveMenu from '#shell/DriveSaveMenu.tsx';
import LampCord from './LampCord.tsx';
import LampStage from './LampStage.tsx';
import ToolShell, { FILE_ACTIONS, useToolShell } from '#shell/ToolShell.tsx';
import { englishShellMessages } from '#shell/shellMessages.ts';
import PrintMenu, { PrintDropdown } from './PrintMenu.tsx';
import type { useHighlightComments } from '../hooks/useHighlightComments.ts';
import type { HighlightAction } from '../lib/marks/highlightState.ts';
import { clearPageActions, rotatePageAction } from '../lib/marks/pageEditActions.ts';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { NOTES_W } from '../lib/zoom/fit.ts';
import { markOf } from '../lib/marker/markEdit.ts';
import type { HighlightElement } from '#editor/model/editorModel.ts';
import { coarsePointer, useMarkerArming } from '../hooks/useMarkerArming.ts';
import { useMarkPanel } from '../hooks/useMarkPanel.ts';
import type { Marker } from '../lib/marker/markerState.ts';
import UndoChip from '#shell/UndoChip.tsx';
import { markCommands } from '../lib/marks/markCommands.ts';
import { withPhoneWriting } from '../lib/notes/phoneWriting.ts';
import { activeAfterPick } from '../lib/notes/notePane.ts';
import { historyShortcuts, isMacPlatform } from '../lib/marker/historyShortcuts.ts';
import type { useHighlightShare } from '../hooks/useHighlightShare.ts';
import { usePrint } from '../hooks/usePrint.ts';
import { hasComments } from '../lib/print/printMenu.ts';
import styles from './HighlightWorkspace.module.css';

/** What Share needs from useHighlightShare. */
type ShareProps = ReturnType<typeof useHighlightShare>;

function emitter<A extends unknown[]>() {
  const subs = new Set<(...args: A) => void>();
  return {
    subscribe(fn: (...args: A) => void) { subs.add(fn); return () => { subs.delete(fn); }; },
    emit(...args: A) { subs.forEach((fn) => fn(...args)); },
  };
}

interface HighlightWorkspaceProps {
  pdfDocument: PDFDocumentProxy;
  numPages: number;
  fileName: string;
  zoom: WorkspaceZoom;
  marks: ReturnType<typeof useHighlightMarks>;
  /** Undo and redo through the notes room, so a note coming or going keeps its line in place. */
  undo(): void;
  redo(): void;
  /** Sign's comments view over these marks (R27 to R29); its container is this workspace. */
  comments: ReturnType<typeof useHighlightComments>;
  /** The marks' dispatch, as the notes room wraps it: opening the first card makes room in the same event. */
  dispatch: (action: HighlightAction) => void;
  setAnnouncement(message: string): void;
  onDownload(): void;
  /** The saved file's name while the done strip stands (normal view only), else null. */
  doneName?: string | null;
  onCloseDone?(): void;
  drive?: ReturnType<typeof useSaveToDrive>;
  shareProps?: ShareProps;
  /** The card that floats over page 1 (PE-07); nothing moves when it appears. The lamp has no room for it. */
  offer?: ComponentChildren;
  workspaceRef: { current: HTMLDivElement | null };
  columnRef: { current: HTMLDivElement | null };
  fullscreen: boolean;
  /** The lamp stands in for fullscreen: iPhone Safari has none, and a wheel or a refused request gets none. */
  pseudoFullscreen: boolean;
  onToggleFullscreen(): void;
}

/** The page column: the card at its own width, or in the reading lamp a board the reader pans and zooms. */
export default function HighlightWorkspace({ pdfDocument, numPages, fileName, zoom, marks, undo, redo, comments, dispatch, setAnnouncement, onDownload, doneName, onCloseDone, drive, shareProps, workspaceRef, columnRef, fullscreen, pseudoFullscreen, onToggleFullscreen, offer }: HighlightWorkspaceProps) {
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const { scrollEvents, pagePressEvents } = useMemo(() => ({ scrollEvents: emitter<[number]>(), pagePressEvents: emitter<[]>() }), []);
  const currentPage = useCurrentPage({ active: fullscreen, rootRef: workspaceRef, pageRefs, numPages });

  useEffect(() => {
    const ws = workspaceRef.current;
    if (!ws || !fullscreen) return;
    let last = ws.scrollTop;
    const onScroll = () => { scrollEvents.emit(ws.scrollTop - last); last = ws.scrollTop; };
    ws.addEventListener('scroll', onScroll, { passive: true });
    return () => ws.removeEventListener('scroll', onScroll);
  }, [workspaceRef, fullscreen, scrollEvents]);

  // The comments view measures the workspace's width to choose the margin rail or the bottom note pane.
  const commentsContainer = comments.containerRef;
  const setWorkspace = useCallback((node: HTMLDivElement | null) => {
    workspaceRef.current = node;
    commentsContainer(node);
  }, [workspaceRef, commentsContainer]);
  // R29: the column grows by the notes column while the rail shows; it scales with the page only in the lamp (chrome).
  const notesW = comments.showRail ? NOTES_W * zoom.chrome : 0;

  const widest = zoom.pages.reduce((w, p) => Math.max(w, p.width), 0);
  const columnW = widest * zoom.zoom + notesW;
  const menu = (onOpenChange?: (open: boolean) => void) => (
    <ZoomMenu
      zoom={zoom.zoom} setting={zoom.setting} labels={t} onOpenChange={onOpenChange}
      onSetting={(mode) => zoom.apply(mode)} onStep={(dir) => zoom.step(dir)} onActual={() => zoom.actual()}
    />
  );
  // R15: in the lamp, More holds Replace, the shell's own action (it asks before it costs anything, then opens the picker).
  const { requestReplace, messages: shellMessages = englishShellMessages } = useToolShell();
  const moreItems = [{ label: shellMessages.replaceLabel, onSelect: requestReplace }];
  const print = usePrint({ pdfDocument, elements: marks.state.elements, pageTurns: marks.pageTurns });
  const [printOpen, setPrintOpen] = useState(false);
  const [printAnchor, setPrintAnchor] = useState<{ top: number; left: number; right: number } | undefined>();
  // The menu opens 8 px under the capsule's own Print button, start edges aligned.
  const openPrint = () => {
    const button = workspaceRef.current?.querySelector('[role="toolbar"]')?.querySelector(`button[aria-label="${t.capsule.print}"]`);
    const rect = button?.getBoundingClientRect();
    setPrintAnchor(rect ? { top: rect.bottom + 8, left: rect.left, right: rect.right } : undefined);
    setPrintOpen(true);
  };
  const withComments = hasComments(marks.state.elements);
  // With no comment there is one way to print, so Print prints; the menu is only for a choice.
  const printNow = () => print.print('none');
  const printMenu = {
    anchor: printAnchor, open: printOpen,
    onChoose: print.print, onClose: () => setPrintOpen(false),
  };
  // One menu at a time: it belongs to the row or to the capsule, so changing view puts it away.
  const toggleView = () => { setPrintOpen(false); onToggleFullscreen(); };
  const touch = useMarkerArming();
  // A tapped highlight: the Marker panel shows and edits its look until the panel is dismissed.
  const elements = marks.state.elements;
  const panel = useMarkPanel(elements, workspaceRef);
  // READ-13: the open mark wears the pencil outline, and the other marks step back while one is open.
  // READ-24: Delete offers its Undo, where the row stood on a fine pointer, at the foot of the screen on touch.
  const { openMarks, removal } = panel;
  const pickMark = (id: string) => {
    panel.pick(id);
    const next = activeAfterPick(elements, marks.state.activeElementId, id);
    if (next !== marks.state.activeElementId) dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: next });
  };
  const picked = panel.markId ? elements.find((el) => el.id === panel.markId) as HighlightElement | undefined : undefined;
  const commands = withPhoneWriting(markCommands({ elements, dispatch, logAction: marks.logAction, rearm: marks.rearm, setAnnouncement }), elements, comments);
  const mark = picked && pickedMark(picked, commands, () => removal.show(null), panel.release);

  return (
    <>
    {/* Stays mounted in the lamp, hidden: the page's restore veil lifts only while a [data-tool-shell] exists. The lamp's exit slides it back in. */}
    <div hidden={fullscreen} style={fullscreen ? undefined : { display: 'contents' }} data-lamp-part="site">
      <TileRow
        marks={marks} undo={undo} redo={redo} touch={touch} mark={fullscreen ? undefined : mark} printMenu={{ ...printMenu, open: printMenu.open && !fullscreen }} withComments={withComments}
        onPrintOpenChange={setPrintOpen} onToggleView={toggleView} onDownload={onDownload} doneName={doneName} onCloseDone={onCloseDone} drive={drive} shareProps={shareProps}
      />
    </div>
    <div
      className={`${workspaceStyles.workspace} ${styles.workspace}${pseudoFullscreen ? ` ${workspaceStyles['pseudo-fullscreen']}` : ''}`}
      ref={setWorkspace} role="region" aria-label={fileName} data-workspace data-mark-open={openMarks.openId ? '' : undefined} data-lamp={fullscreen || undefined} data-pseudo-fullscreen={pseudoFullscreen || undefined}
    >
      {fullscreen && (
        <div class={styles.floating} data-lamp-part="capsule">
          <ReadingCapsule
            fileName={fileName} page={currentPage} pageCount={numPages}
            onJumpToPage={(n) => pageRefs.current[n - 1]?.scrollIntoView()}
            zoomSlot={menu}
            markerSlot={(onOpenChange) => <MarkerButton marker={marks.marker} armed={touch.armed} onTap={touch.arm} onDisarm={touch.disarm} mark={mark} onOpenChange={onOpenChange} />}
            onUndo={undo} onRedo={redo} canUndo={marks.canUndo} canRedo={marks.canRedo}
            onPrint={withComments ? openPrint : printNow}
            onDownload={onDownload} moreItems={moreItems} onExit={toggleView}
            scrollEvents={scrollEvents} pagePressEvents={pagePressEvents} labels={t.capsule}
          />
        </div>
      )}
      {fullscreen && <PrintMenu {...printMenu} />}
      {print.sheets}
      <LampStage />
      <div className={fullscreen ? `${styles.board} ${styles.lampBoard}` : styles.board} data-lamp-part="board" style={{ width: `${fullscreen ? zoom.board.boardWidth : columnW}px` }}>
      <div
        className={styles.column} ref={columnRef}
        style={{ width: `${columnW}px`, marginLeft: `${zoom.board.slack}px`, ...(zoom.chrome !== 1 ? { '--chrome': zoom.chrome } : {}) }}
        onPointerDown={() => pagePressEvents.emit()}
      >
        {!fullscreen && offer}
        {zoom.pages.map((box, i) => (
          <HighlightPage
            key={i} pdfDocument={pdfDocument} pageIndex={i} widthPx={box.width * zoom.zoom}
            elements={marks.state.elements} marker={marks.marker} rearm={marks.rearm} dispatch={dispatch} logAction={marks.logAction}
            setAnnouncement={setAnnouncement} armed={touch.armed} pickedId={panel.markId} openMarks={openMarks} onPickMark={pickMark} cardRef={(el) => { pageRefs.current[i] = el; }} chrome={zoom.chrome} rail={comments.rail(i, (box.height * zoom.zoom) / zoom.chrome)}
            pageTurns={marks.pageTurns} onComment={commands.comment} onRemoved={removal.show} onRotate={(geometry) => { dispatch(rotatePageAction(i, geometry)); recordAction('rotate'); }}
            onClear={() => { const actions = clearPageActions(marks.state.elements, i); actions.forEach((a) => dispatch(a)); if (actions.length) recordAction('delete_mark'); }}
          />
        ))}
      </div>
      </div>
      {removal.removed && <UndoChip message={t.markRemoved} undoLabel={t.capsule.undo} onUndo={undo} style={chipAt(removal.removed.at)} />}
      <PhoneNotes wide={comments.wide} elements={marks.state.elements} activeElementId={marks.state.activeElementId} messages={englishSignMessages} labels={t.notes} writer={comments.writer} onEdit={commands.editNote}
          onSelect={(id) => dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: id })} {...comments.actions} onUndo={undo} onReturnFocus={comments.returnFocus} />
    </div>
    </>
  );
}

/** Outside the lamp: the editor card Sign and Redact show, with Highlight's tiles in Sign's grammar. */
/** What the panel shows and does for the picked mark. */
const pickedMark = (picked: HighlightElement, commands: ReturnType<typeof markCommands>, onRemoved: () => void, onRelease: () => void) => ({
  id: picked.id, look: markOf(picked), onChange: (change: Partial<Marker>) => commands.change(picked, change),
  onComment: () => commands.comment(picked), onDelete: () => { commands.remove(picked); onRemoved(); }, onRelease,
});

/** The chip stands where the row stood, or keeps its own place at the foot of the screen. */
const chipAt = (at: { x: number; y: number } | null) => (at ? { left: `${at.x}px`, top: `${at.y}px`, right: 'auto', bottom: 'auto' } : undefined);

function TileRow({ marks, undo, redo, touch, mark, printMenu, withComments, onPrintOpenChange, onToggleView, onDownload, doneName, onCloseDone, drive, shareProps }: {
  marks: ReturnType<typeof useHighlightMarks>;
  undo(): void;
  redo(): void;
  touch: ReturnType<typeof useMarkerArming>;
  mark: ComponentProps<typeof MarkerButton>['mark'];
  printMenu: ComponentProps<typeof PrintMenu>;
  withComments: boolean;
  onPrintOpenChange(open: boolean): void;
  onToggleView(): void;
  onDownload(): void;
  doneName?: string | null;
  onCloseDone?(): void;
  drive?: ReturnType<typeof useSaveToDrive>;
  shareProps?: ShareProps;
}) {
  const { requestReplace, messages: shellMessages = englishShellMessages } = useToolShell();
  const shortcuts = historyShortcuts(typeof navigator !== 'undefined' && isMacPlatform(navigator.platform));
  return (
    <ToolShell
      editor statusBeside status={touch.armed && !mark && coarsePointer() ? <PenHint marker={marks.marker} text={t.armedAction} /> : null}
    >
      <div className={`${toolbarStyles.toolbar} ${styles.toolRow}`} role="toolbar" aria-label={t.toolbarLabel} data-editor-toolbar data-finish="tile">
        <MarkerButton marker={marks.marker} armed={touch.armed} onTap={touch.arm} onDisarm={touch.disarm} mark={mark} buttonClass={toolbarStyles.button} />
        <UndoRedoButtons
          onUndo={undo} onRedo={redo} canUndo={marks.canUndo} canRedo={marks.canRedo}
          labels={{ undoTitle: shortcuts.undo, undoButton: t.capsule.undo, redoTitle: shortcuts.redo, redoButton: t.capsule.redo }}
        />
        <FeedbackButton tool={{ name: t.feedback.name, body: t.feedback.body }} className={toolbarStyles.button} labelClassName={toolbarStyles.label} label={t.feedback.label} title={t.feedback.title} />
        <button type="button" className={toolbarStyles.button} onClick={requestReplace} title={shellMessages.replaceTitle} aria-label={shellMessages.replaceLabel}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d={FILE_ACTIONS.replace.icon} />
          </svg>
          <span className={toolbarStyles.label}>{shellMessages.replaceShort}</span>
        </button>
        <PrintDropdown open={printMenu.open} onOpenChange={onPrintOpenChange} withComments={withComments} onChoose={printMenu.onChoose} />
        <EditorExportActions
          variant="toolbar" canShare={!!shareProps?.canShare} shareReady={!!shareProps?.shareReady} disabled={false}
          onDownload={onDownload} onPrepareShare={() => void shareProps?.onPrepareShare()} onShare={() => void shareProps?.onShare()}
          downloadLabel={t.capsule.download} shareLabel={t.capsule.share} keepDownloadOnPhone
          downloadMenu={drive && <DriveSaveMenu drive={drive} />}
        />
      </div>
      {doneName && <DownloadDone name={doneName} onClose={() => onCloseDone?.()} />}
      <LampCord onPull={onToggleView} />
    </ToolShell>
  );
}
