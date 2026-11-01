import { useEffect, useMemo, useRef } from 'preact/hooks';
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
export default function HighlightWorkspace({ pdfDocument, numPages, fileName, zoom, marks, setAnnouncement, onDownload, workspaceRef, columnRef, fullscreen, onToggleFullscreen }: {
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

  const widest = zoom.pages.reduce((w, p) => Math.max(w, p.width), 0);
  const menu = (onOpenChange?: (open: boolean) => void) => (
    <ZoomMenu
      zoom={zoom.zoom} setting={zoom.setting} labels={t} onOpenChange={onOpenChange}
      onSetting={(mode) => zoom.apply(mode)} onStep={(dir) => zoom.step(dir)} onActual={() => zoom.actual()}
    />
  );
  const readout = typeof zoom.setting === 'number'
    ? `${zoomPercent(zoom.zoom)}%`
    : formatMessage(t.readout, { mode: MODE_LABEL[zoom.setting], percent: zoomPercent(zoom.zoom) });

  return (
    <div className={`${workspaceStyles.workspace} ${styles.workspace}`} ref={workspaceRef} data-workspace>
      {fullscreen ? (
        <div class={styles.floating}>
          <ReadingCapsule
            fileName={fileName} page={currentPage} pageCount={numPages}
            onJumpToPage={(n) => pageRefs.current[n - 1]?.scrollIntoView()}
            zoomSlot={menu()}
            onUndo={marks.undo} onRedo={marks.redo} canUndo={marks.canUndo} canRedo={marks.canRedo}
            onDownload={onDownload} moreItems={[]} onExit={onToggleFullscreen}
            scrollEvents={scrollEvents} pagePressEvents={pagePressEvents} labels={t.capsule}
          />
        </div>
      ) : (
        <div className={styles.top}>
          <button type="button" className={styles.download} onClick={onDownload}>{t.capsule.download}</button>
          <button type="button" className={styles.enter} onClick={onToggleFullscreen}><ReadingLampIcon size={20} />{t.enterLamp}</button>
        </div>
      )}
      {fullscreen && <ZoomReadout text={readout} />}
      <div className={styles.board} style={{ width: `${zoom.board.boardWidth}px` }}>
      <div
        className={styles.column} ref={columnRef}
        style={{ width: `${widest * zoom.zoom}px`, marginLeft: `${zoom.board.slack}px` }}
        onPointerDown={() => pagePressEvents.emit()}
      >
        {zoom.pages.map((box, i) => (
          <HighlightPage
            key={i} pdfDocument={pdfDocument} pageIndex={i} widthPx={box.width * zoom.zoom}
            elements={marks.state.elements} marker={marks.marker} rearm={marks.rearm} dispatch={marks.dispatch} logAction={marks.logAction}
            setAnnouncement={setAnnouncement} cardRef={(el) => { pageRefs.current[i] = el; }}
          />
        ))}
      </div>
      </div>
    </div>
  );
}
