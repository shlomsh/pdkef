import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import ReadingCapsule, { ReadingLampIcon } from '#editor-ui/capsule/ReadingCapsule.tsx';
import useCurrentPage from '#editor-ui/hooks/useCurrentPage.js';
import workspaceStyles from '#editor-ui/Workspace.module.css';
import { formatMessage } from '#lib/text/formatMessage.ts';
import type { useHighlightMarks } from '../hooks/useHighlightMarks.ts';
import type { WorkspaceZoom } from '../hooks/useWorkspaceZoom.ts';
import { zoomPercent } from '../lib/zoom/percent.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import ZoomMenu from './ZoomMenu.tsx';
import HighlightPage from './HighlightPage.tsx';
import MarkerButton from './MarkerButton.tsx';
import ArmedChip from './ArmedChip.tsx';
import { useToolShell } from '#shell/ToolShell.tsx';
import { englishShellMessages } from '#shell/shellMessages.ts';
import PrintMenu from './PrintMenu.tsx';
import { useHighlightComments } from '../hooks/useHighlightComments.ts';
import { NOTES_W } from '../lib/zoom/fit.ts';
import { useTouchArming } from '../hooks/useTouchArming.ts';
import { usePrint } from '../hooks/usePrint.ts';
import { hasComments } from '../lib/print/printMenu.ts';
import ZoomReadout from './ZoomReadout.tsx';
import styles from './HighlightWorkspace.module.css';

function emitter<A extends unknown[]>() {
  const subs = new Set<(...args: A) => void>();
  return {
    subscribe(fn: (...args: A) => void) { subs.add(fn); return () => { subs.delete(fn); }; },
    emit(...args: A) { subs.forEach((fn) => fn(...args)); },
  };
}

const MODE_LABEL = { width: t.fitWidth, text: t.fitText, page: t.fitPage } as const;

/** The page column: the card at its own width, or in the reading lamp a board the reader pans and zooms. */
export default function HighlightWorkspace({ pdfDocument, numPages, fileName, zoom, marks, setAnnouncement, onDownload, workspaceRef, columnRef, fullscreen, pseudoFullscreen, onToggleFullscreen }: {
  pdfDocument: PDFDocumentProxy;
  numPages: number;
  fileName: string;
  zoom: WorkspaceZoom;
  marks: ReturnType<typeof useHighlightMarks>;
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

  // R27 to R29: Sign's comments mechanism over Highlight's marks. Its container is the workspace, whose width it measures.
  const comments = useHighlightComments({ state: marks.state, dispatch: marks.dispatch, logAction: marks.logAction, announce: setAnnouncement });
  const commentsContainer = comments.containerRef;
  const setWorkspace = useCallback((node: HTMLDivElement | null) => {
    workspaceRef.current = node;
    commentsContainer.current = node;
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
  // R15: More holds Replace, the shell's own action (it asks before it costs anything, then opens the picker).
  const { requestReplace, messages: shellMessages = englishShellMessages } = useToolShell();
  const moreItems = [{ label: shellMessages.replaceLabel, onSelect: requestReplace }];
  const print = usePrint({ pdfDocument, elements: marks.state.elements });
  const [printOpen, setPrintOpen] = useState(false);
  const printMenu = {
    open: printOpen, withComments: hasComments(marks.state.elements),
    onChoose: print.print, onClose: () => setPrintOpen(false),
  };
  // One menu at a time: it belongs to the row or to the capsule, so changing view puts it away.
  const toggleView = () => { setPrintOpen(false); onToggleFullscreen(); };
  const touch = useTouchArming();
  const markerButton = <MarkerButton marker={marks.marker} onChange={marks.rearm} armed={touch.armed} onTap={touch.arm} />;
  const readout = typeof zoom.setting === 'number'
    ? `${zoomPercent(zoom.zoom)}%`
    : formatMessage(t.readout, { mode: MODE_LABEL[zoom.setting], percent: zoomPercent(zoom.zoom) });

  return (
    <div
      className={`${workspaceStyles.workspace} ${styles.workspace}${pseudoFullscreen ? ` ${workspaceStyles['pseudo-fullscreen']}` : ''}`}
      ref={setWorkspace} data-workspace data-lamp={fullscreen || undefined} data-pseudo-fullscreen={pseudoFullscreen || undefined}
    >
      {fullscreen ? (
        <div class={styles.floating}>
          <ReadingCapsule
            fileName={fileName} page={currentPage} pageCount={numPages}
            onJumpToPage={(n) => pageRefs.current[n - 1]?.scrollIntoView()}
            zoomSlot={menu()}
            markerSlot={markerButton}
            onUndo={marks.undo} onRedo={marks.redo} canUndo={marks.canUndo} canRedo={marks.canRedo}
            onPrint={() => setPrintOpen(true)}
            onDownload={onDownload} moreItems={moreItems} onExit={toggleView}
            scrollEvents={scrollEvents} pagePressEvents={pagePressEvents} labels={t.capsule}
          />
        </div>
      ) : (
        <div className={styles.top}>
          {markerButton}
          <button type="button" className={styles.download} onClick={onDownload}>{t.capsule.download}</button>
          <PrintMenu {...printMenu}>
            <button type="button" className={styles.download} aria-haspopup="menu" aria-expanded={printOpen} onClick={() => setPrintOpen((o) => !o)}>{t.capsule.print}</button>
          </PrintMenu>
          <button type="button" className={styles.enter} onClick={toggleView}><ReadingLampIcon size={20} />{t.enterLamp}</button>
        </div>
      )}
      {fullscreen && <ZoomReadout text={readout} />}
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
            elements={marks.state.elements} marker={marks.marker} rearm={marks.rearm} dispatch={marks.dispatch} logAction={marks.logAction}
            setAnnouncement={setAnnouncement} touchArmed={touch.armed} cardRef={(el) => { pageRefs.current[i] = el; }} rail={comments.rail(i)}
          />
        ))}
      </div>
      </div>
      {comments.sheet}
    </div>
  );
}
