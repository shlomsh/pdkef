import type { ComponentProps } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import ReadingCapsule, { PrintIcon } from '#editor-ui/capsule/ReadingCapsule.tsx';
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
import ArmedChip from './ArmedChip.tsx';
import FullscreenButton from '#editor-ui/FullscreenButton.tsx';
import ToolShell, { FILE_ACTIONS, useToolShell } from '#shell/ToolShell.tsx';
import { englishShellMessages } from '#shell/shellMessages.ts';
import PrintMenu from './PrintMenu.tsx';
import type { useHighlightComments } from '../hooks/useHighlightComments.ts';
import type { HighlightAction } from '../lib/marks/highlightState.ts';
import { clearPageActions, rotatePageAction } from '../lib/marks/pageEditActions.ts';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { NOTES_W } from '../lib/zoom/fit.ts';
import { useTouchArming } from '../hooks/useTouchArming.ts';
import { usePrint } from '../hooks/usePrint.ts';
import { hasComments } from '../lib/print/printMenu.ts';
import styles from './HighlightWorkspace.module.css';

function emitter<A extends unknown[]>() {
  const subs = new Set<(...args: A) => void>();
  return {
    subscribe(fn: (...args: A) => void) { subs.add(fn); return () => { subs.delete(fn); }; },
    emit(...args: A) { subs.forEach((fn) => fn(...args)); },
  };
}

/** The page column: the card at its own width, or in the reading lamp a board the reader pans and zooms. */
export default function HighlightWorkspace({ pdfDocument, numPages, fileName, zoom, marks, undo, redo, comments, dispatch, setAnnouncement, onDownload, workspaceRef, columnRef, fullscreen, pseudoFullscreen, onToggleFullscreen }: {
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
  workspaceRef: { current: HTMLDivElement | null };
  columnRef: { current: HTMLDivElement | null };
  fullscreen: boolean;
  /** The lamp stands in for fullscreen: iPhone Safari has none, and a wheel or a refused request gets none. */
  pseudoFullscreen: boolean;
  onToggleFullscreen(): void;
}) {
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollEvents = useMemo(() => emitter<[number]>(), []);
  const pagePressEvents = useMemo(() => emitter<[]>(), []);
  const currentPage = useCurrentPage({ active: fullscreen, rootRef: workspaceRef, pageRefs, numPages });

  useEffect(() => {
    const ws = workspaceRef.current;
    if (!ws || !fullscreen) return;
    let last = ws.scrollTop;
    const onScroll = () => { scrollEvents.emit(ws.scrollTop - last); last = ws.scrollTop; };
    ws.addEventListener('scroll', onScroll, { passive: true });
    return () => ws.removeEventListener('scroll', onScroll);
  }, [workspaceRef, fullscreen, scrollEvents]);

  // The comments view measures the workspace's width to choose the rail or the sheet.
  const commentsContainer = comments.containerRef;
  const setWorkspace = useCallback((node: HTMLDivElement | null) => {
    workspaceRef.current = node;
    commentsContainer(node);
  }, [workspaceRef, commentsContainer]);
  // R29: the column grows by the notes column while the rail shows.
  const notesW = comments.showRail ? NOTES_W : 0;

  const widest = zoom.pages.reduce((w, p) => Math.max(w, p.width), 0);
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
  const [printTop, setPrintTop] = useState<number | undefined>();
  // The menu opens 8 px under the toolbar, wherever the toolbar is in this view.
  const openPrint = () => {
    const bar = workspaceRef.current?.querySelector('[role="toolbar"]');
    setPrintTop(bar ? bar.getBoundingClientRect().bottom + 8 : undefined);
    setPrintOpen(true);
  };
  const withComments = hasComments(marks.state.elements);
  // With no comment there is one way to print, so Print prints; the menu is only for a choice.
  const printNow = () => print.print(false);
  const printMenu = {
    top: printTop, open: printOpen, withComments,
    onChoose: print.print, onClose: () => setPrintOpen(false),
  };
  // One menu at a time: it belongs to the row or to the capsule, so changing view puts it away.
  const toggleView = () => { setPrintOpen(false); onToggleFullscreen(); };
  const touch = useTouchArming();
  const markerButton = <MarkerButton marker={marks.marker} onChange={marks.rearm} armed={touch.armed} onTap={touch.arm} />;

  return (
    <>
    {/* Stays mounted in the lamp, hidden: the page's restore veil lifts only while a [data-tool-shell] exists. */}
    <div hidden={fullscreen} style={fullscreen ? undefined : { display: 'contents' }}>
      <TileRow
        marks={marks} undo={undo} redo={redo} touch={touch} printMenu={{ ...printMenu, open: printMenu.open && !fullscreen }} printOpen={printOpen && !fullscreen}
        onTogglePrint={withComments ? () => setPrintOpen((o) => !o) : printNow} onToggleView={toggleView} onDownload={onDownload}
      />
    </div>
    <div
      className={`${workspaceStyles.workspace} ${styles.workspace}${pseudoFullscreen ? ` ${workspaceStyles['pseudo-fullscreen']}` : ''}`}
      ref={setWorkspace} role="region" aria-label={fileName} data-workspace data-lamp={fullscreen || undefined} data-pseudo-fullscreen={pseudoFullscreen || undefined}
    >
      {fullscreen && (
        <div class={styles.floating}>
          <ReadingCapsule
            fileName={fileName} page={currentPage} pageCount={numPages}
            onJumpToPage={(n) => pageRefs.current[n - 1]?.scrollIntoView()}
            zoomSlot={menu()}
            markerSlot={markerButton}
            onUndo={undo} onRedo={redo} canUndo={marks.canUndo} canRedo={marks.canRedo}
            onPrint={withComments ? openPrint : printNow}
            onDownload={onDownload} moreItems={moreItems} onExit={toggleView}
            scrollEvents={scrollEvents} pagePressEvents={pagePressEvents} labels={t.capsule}
          />
        </div>
      )}
      {fullscreen && <PrintMenu {...printMenu} placement="floating" />}
      {print.sheets}
      <ArmedChip armed={touch.armed} onStop={touch.disarm} />
      <div className={styles.board} style={{ width: `${zoom.board.boardWidth + notesW}px` }}>
      <div
        className={styles.column} ref={columnRef}
        style={{ width: `${widest * zoom.zoom + notesW}px`, marginLeft: `${zoom.board.slack}px` }}
        onPointerDown={() => pagePressEvents.emit()}
      >
        {zoom.pages.map((box, i) => (
          <HighlightPage
            key={i} pdfDocument={pdfDocument} pageIndex={i} widthPx={box.width * zoom.zoom}
            elements={marks.state.elements} marker={marks.marker} rearm={marks.rearm} dispatch={dispatch} logAction={marks.logAction}
            setAnnouncement={setAnnouncement} touchArmed={touch.armed} cardRef={(el) => { pageRefs.current[i] = el; }} rail={comments.rail(i)}
            pageTurns={marks.pageTurns} onRotate={(geometry) => { dispatch(rotatePageAction(i, geometry)); recordAction('rotate'); }}
            onClear={() => { const actions = clearPageActions(marks.state.elements, i); actions.forEach((a) => dispatch(a)); if (actions.length) recordAction('delete_mark'); }}
          />
        ))}
      </div>
      </div>
      {comments.sheet}
    </div>
    </>
  );
}

/** Outside the lamp: the editor card Sign and Redact show, with Highlight's tiles in Sign's grammar. */
function TileRow({ marks, undo, redo, touch, printMenu, printOpen, onTogglePrint, onToggleView, onDownload }: {
  marks: ReturnType<typeof useHighlightMarks>;
  undo(): void;
  redo(): void;
  touch: ReturnType<typeof useTouchArming>;
  printMenu: ComponentProps<typeof PrintMenu>;
  printOpen: boolean;
  onTogglePrint(): void;
  onToggleView(): void;
  onDownload(): void;
}) {
  const { requestReplace, messages: shellMessages = englishShellMessages } = useToolShell();
  return (
    <ToolShell editor>
      <div className={`${toolbarStyles.toolbar} ${styles.toolRow}`} role="toolbar" aria-label={t.toolbarLabel} data-editor-toolbar>
        <MarkerButton marker={marks.marker} onChange={marks.rearm} armed={touch.armed} onTap={touch.arm} buttonClass={toolbarStyles.button} />
        <UndoRedoButtons
          onUndo={undo} onRedo={redo} canUndo={marks.canUndo} canRedo={marks.canRedo}
          labels={{ undoTitle: t.capsule.undo, undoButton: t.capsule.undo, redoTitle: t.capsule.redo, redoButton: t.capsule.redo }}
        />
        <FullscreenButton isFullscreen={false} toggleFullscreen={onToggleView} />
        <button type="button" className={toolbarStyles.button} onClick={requestReplace} title={shellMessages.replaceTitle} aria-label={shellMessages.replaceLabel}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d={FILE_ACTIONS.replace.icon} />
          </svg>
          <span className={toolbarStyles.label}>{shellMessages.replaceShort}</span>
        </button>
        <PrintMenu {...printMenu} top={undefined} wrapClass={toolbarStyles.dropdown}>
          <button type="button" className={toolbarStyles.button} aria-label={t.capsule.print} title={t.capsule.print} aria-haspopup={printMenu.withComments ? 'menu' : undefined} aria-expanded={printMenu.withComments ? printOpen : undefined} onClick={onTogglePrint}>
            <PrintIcon />
            <span className={toolbarStyles.label}>{t.capsule.print}</span>
          </button>
        </PrintMenu>
        <EditorExportActions
          variant="toolbar" canShare={false} shareReady={false} disabled={false}
          onDownload={onDownload} onPrepareShare={() => {}} onShare={() => {}}
          downloadLabel={t.capsule.download} downloadTitle={t.capsule.download} keepDownloadOnPhone
        />
      </div>
    </ToolShell>
  );
}
