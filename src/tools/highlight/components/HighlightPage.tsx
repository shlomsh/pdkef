import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import PdfPageCanvas from '#editor-ui/PdfPageCanvas.tsx';
import HighlightNode from '#editor-ui/highlight/HighlightNode.tsx';
import usePdfCoordinates from '#editor-ui/hooks/usePdfCoordinates.ts';
import workspaceStyles from '#editor-ui/Workspace.module.css';
import type { HistoryLogger } from '#editor/model/actionHistory.ts';
import type { EditorElement, HighlightElement } from '#editor/model/editorModel.ts';
import type { ElementsAction } from '#editor/model/elementsReducer.ts';
import { turnsOf, type PageTurns } from '#editor/geometry/pageTurn.ts';
import type { PageGeometry } from '#editor/geometry/coords.ts';
import { pageTextDirection } from '#editor/text/textDirection.js';
import { directionAtPoint, readerTextDirection, resolveHighlightDirection } from '#editor/highlight/resolveDirection.ts';
import useCoarsePointer from '#editor-ui/hooks/useCoarsePointer.ts';
import { createSwipeReader } from '#lib/pageLayout/swipeReader.ts';
import { PAGE_HEIGHT_DEFAULT_PTS } from '#editor/model/signGeometry.js';
import { usePageGeometry } from '../hooks/usePageGeometry.ts';
import HighlightPageHeader from './HighlightPageHeader.tsx';
import { useClickMarks } from '../hooks/useClickMarks.ts';
import { useMarkFocus } from '../hooks/useMarkFocus.ts';
import { useMarkSwipe } from '../hooks/useMarkSwipe.ts';
import { useRestToolbar } from '../hooks/useRestToolbar.ts';
import { cursorValue } from '../lib/marker/cursor.ts';
import { inkEnd } from '../lib/marker/inkEnd.ts';
import { markCommands } from '../lib/marks/markCommands.ts';
import type { Marker } from '../lib/marker/markerState.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import RestToolbar, { MarkHint } from './RestToolbar.tsx';
import { NOTES_W } from '../lib/zoom/fit.ts';
import notes from './NotesColumn.module.css';
import styles from './HighlightPage.module.css';

const noop = () => {};

/**
 * One page card: its header, the page, and a wrapper per highlight on it. A fine-pointer press on the
 * page starts a swipe that lays the marker's bands; the gesture paints during the swipe and commits once.
 */
export default function HighlightPage({ pdfDocument, pageIndex, widthPx, chrome = 1, elements, marker, touchArmed = false, pickedId, onPickMark, rearm, dispatch, logAction, setAnnouncement, cardRef, rail, pageTurns = {}, onRotate, onClear }: {
  pdfDocument: PDFDocumentProxy | null;
  pageIndex: number;
  /** The page's width in CSS px at the current zoom. */
  widthPx: number;
  /** How much the header and the rail scale (CSS zoom): 1 in the normal view, the page's zoom in the lamp. The notes column is NOTES_W of it. */
  chrome?: number;
  /** Every element of the document: the page draws its own, and the new one's place in the history comes from the count. */
  elements: EditorElement[];
  marker: Marker;
  /** The marker is armed for a finger (touch devices): a one-finger press marks and the page does not scroll. */
  touchArmed?: boolean;
  /** The mark the panel up top is editing, on touch; it shows a ring. */
  pickedId?: string | null;
  /** On touch a tap on a highlight picks it for the panel up top, instead of opening a toolbar on the page. */
  onPickMark?: (id: string) => void;
  /** Every change made on a highlight becomes the marker for the next stroke (R5). */
  rearm: (change: Partial<Marker>) => void;
  dispatch: (action: ElementsAction) => void;
  logAction: HistoryLogger<EditorElement>;
  setAnnouncement: (message: string) => void;
  cardRef: (node: HTMLDivElement | null) => void;
  /** R29: this page's comments rail, drawn inside the card beside the page so a pinch carries it with its passages. */
  rail?: ComponentChildren;
  /** The quarter turns the person gave each page; this page is drawn, and marked, as turned. */
  pageTurns?: PageTurns;
  /** One quarter turn, handed the page as it is shown now (the turn's starting point). */
  onRotate: (geometry: PageGeometry) => void;
  onClear: () => void;
}) {
  const { geometry, textRunsRef } = usePageGeometry(pdfDocument, pageIndex, turnsOf(pageTurns, pageIndex));
  const { getPointerPercent } = usePdfCoordinates();
  const rest = useRestToolbar();
  const coarse = useCoarsePointer();
  const lastPointerType = useRef('mouse');
  // R14: over the page the cursor is the pen in the hand. A finger has no cursor.
  const pen = useMemo(() => (coarse ? undefined : cursorValue(marker)), [coarse, marker.color, marker.style, marker.opacity]);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const marks = elements.filter((el): el is HighlightElement => el.type === 'highlight' && el.pageIndex === pageIndex);
  const markFocus = useMarkFocus({ elements, openFor: rest.openFor });

  const target = rest.targetId === null ? undefined : marks.find((m) => m.id === rest.targetId);
  const closeRest = rest.close;
  // A toolbar whose highlight is gone (deleted, undone) goes with it.
  useEffect(() => { if (rest.targetId !== null && !target) closeRest(); }, [rest.targetId, target, closeRest]);

  const commands = markCommands({ elements, dispatch, logAction, rearm, setAnnouncement });

  /** The way a mark laid at `start` reads: the text under it, else the page, else the reader. */
  const directionAt = (start: { x: number; y: number }) => resolveHighlightDirection({
    atPress: directionAtPoint(textRunsRef.current, start), page: pageTextDirection(textRunsRef.current.map((r) => r.str)), pages: [], elements, readerDirection: readerTextDirection(),
  });

  /** A mark landed, by a swipe or a click: rest waits for the pointer to leave this spot, and the first mark gets its hint. */
  const inkLanded = (element: HighlightElement) => {
    rest.strokeEnd();
    const end = inkEnd(element);
    rest.showHint({ x: end.x, bottom: end.bottom, rtl: element.direction === 'rtl' });
  };

  const clicks = useClickMarks({
    overlayRef, pageIndex, geometry, elements, marker, textRuns: () => textRunsRef.current, getPointerPercent, directionAt,
    dispatch, logAction, setAnnouncement, onMark: inkLanded,
  });

  /** R52: a finger marks only from a line of text. No page canvas to read yet: it is on a line. */
  const startsOnLine = (point: { x: number; y: number }) => {
    const canvas = overlayRef.current?.parentElement?.querySelector<HTMLCanvasElement>('canvas') ?? null;
    const reader = createSwipeReader(canvas, geometry?.height || PAGE_HEIGHT_DEFAULT_PTS, directionAt(point));
    return reader ? reader.onLine(point) : true;
  };

  const startSwipe = useMarkSwipe({
    pageIndex, geometry, elements, marker, touchArmed, getPointerPercent, directionAt, dispatch, logAction, setAnnouncement, clicks,
    onPress: rest.clearHint, onInk: inkLanded, startsOnLine,
  });
  const onPointerDown = (event: PointerEvent) => {
    lastPointerType.current = event.pointerType;
    startSwipe(event);
  };

  return (
    <div
      data-editor-page-card ref={cardRef} className={rail ? notes.withRail : undefined}
      style={rail ? { '--page-w': `${widthPx}px`, '--notes-w': `${NOTES_W * chrome}px` } : undefined}
    >
      <div data-page-header style={chrome === 1 ? undefined : { zoom: chrome }}>
        <HighlightPageHeader pageIndex={pageIndex} hasMarks={elements.some((el) => el.pageIndex === pageIndex)} onRotate={() => { if (geometry) onRotate(geometry); }} onClear={onClear} />
      </div>
      <div className={`${workspaceStyles['page-wrapper']} ${styles.page}`} data-page-wrapper data-page-turns={turnsOf(pageTurns, pageIndex) || undefined} style={{ width: `${widthPx}px`, ...(pen ? { cursor: pen } : {}) }}>
        <PdfPageCanvas pdfDocument={pdfDocument} pageNum={pageIndex + 1} pageGeometry={geometry} />
        <div
          ref={overlayRef} data-page-overlay data-touch-armed={touchArmed ? '' : undefined} className={touchArmed ? `${workspaceStyles['page-overlay']} ${styles.touchArmed}` : workspaceStyles['page-overlay']} onPointerDown={onPointerDown}
          onPointerMove={rest.onPointerMove} onPointerLeave={rest.onPointerLeave}
          onClick={(event) => {
            // R7: a single click or tap opens the highlight under it, unless the press just laid ink (that keeps the rest wait and hint).
            const id = (event.target as Element | null)?.closest('[data-element-id]')?.getAttribute('data-element-id');
            if (!id || event.detail > 1 || (lastPointerType.current !== 'touch' && clicks.laidInk())) return;
            rest.clearHint();
            if (coarse) onPickMark?.(id); else rest.openFor(id);
          }}
        >
          {marks.map((mark) => (
            <div
              key={mark.id} data-element-id={mark.id} data-editor-element-id={mark.id} data-picked={mark.id === pickedId ? '' : undefined} className={styles.mark} {...markFocus.markProps(mark.id)}
              style={{ left: `${mark.left}%`, top: `${mark.top}%`, width: `${mark.width}%`, height: `${mark.height}%` }}
            >
              <HighlightNode element={mark} isActive={false} onResizeStart={noop} />
            </div>
          ))}
        </div>
        {rest.hint && <MarkHint anchor={rest.hint} text={coarse ? t.tapHint : t.restHint} />}
        {target && !coarse && (
          <RestToolbar
            key={target.id} mark={target}
            onChange={(change) => commands.change(target, change)} onDelete={() => { commands.remove(target); rest.close(); }}
            onComment={() => { commands.comment(target); rest.close(); }} onClose={rest.close}
          />
        )}
      </div>
      {rail && <div className={notes.rail} data-notes-rail style={chrome === 1 ? undefined : { zoom: chrome }} onPointerDown={(event) => event.stopPropagation()}>{rail}</div>}
    </div>
  );
}
