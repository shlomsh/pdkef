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
import MarkHatch from './MarkHatch.tsx';
import MarkOutline from './MarkOutline.tsx';
import type { OpenMarks } from '../hooks/useOpenMarks.ts';
import { useClickMarks } from '../hooks/useClickMarks.ts';
import { useMarkFocus } from '../hooks/useMarkFocus.ts';
import { useMarkSwipe } from '../hooks/useMarkSwipe.ts';
import { useRestToolbar } from '../hooks/useRestToolbar.ts';
import { cursorValue } from '../lib/marker/cursor.ts';
import { inkEnd } from '../lib/marker/inkEnd.ts';
import { markCommands } from '../lib/marks/markCommands.ts';
import { clickAnchor, focusAnchor } from '../lib/marker/panelAnchor.ts';
import type { Marker } from '../lib/marker/markerState.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import RestToolbar, { MarkHint } from './RestToolbar.tsx';
import { NOTES_W } from '../lib/zoom/fit.ts';
import notes from './NotesColumn.module.css';
import styles from './HighlightPage.module.css';

const noop = () => {};

/**
 * One page card: its header, the page, and a wrapper per highlight on it. While armed, a press from any pointer on the
 * page starts a swipe that lays the marker's bands; the gesture paints during the swipe and commits once.
 */
export default function HighlightPage({ pdfDocument, pageIndex, widthPx, chrome = 1, elements, marker, armed = true, pickedId, openMarks, onPickMark, onRemoved, rearm, dispatch, logAction, setAnnouncement, cardRef, rail, pageTurns = {}, onComment, onRotate, onClear }: {
  pdfDocument: PDFDocumentProxy | null;
  pageIndex: number;
  /** The page's width in CSS px at the current zoom. */
  widthPx: number;
  /** How much the header and the rail scale (CSS zoom): 1 in the normal view, the page's zoom in the lamp. The notes column is NOTES_W of it. */
  chrome?: number;
  /** Every element of the document: the page draws its own, and the new one's place in the history comes from the count. */
  elements: EditorElement[];
  marker: Marker;
  /** The marker is in the hand, for any pointer: put down, the page lays no ink and wears the ordinary cursor. On touch, armed means a one-finger sideways swipe that starts on a line marks; the vertical scroll stays the browser's (R52). */
  armed?: boolean;
  /** The mark the panel up top is editing, on touch; it shows a ring. */
  pickedId?: string | null;
  /** READ-13: the mark that wears the pencil outline, and the one the pointer's note card points at (a faint pass). */
  openMarks?: OpenMarks;
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
  /** READ-24: a mark was deleted from its row; `at` is where the row stood, for its Undo. */
  onRemoved?: (at: { x: number; y: number }) => void;
  /** READ-19, the workspace's Comment, which opens the phone's writing page on a narrow workspace. */
  onComment?: (mark: HighlightElement) => void;
  /** One quarter turn, handed the page as it is shown now (the turn's starting point). */
  onRotate: (geometry: PageGeometry) => void;
  onClear: () => void;
}) {
  const { geometry, textRunsRef } = usePageGeometry(pdfDocument, pageIndex, turnsOf(pageTurns, pageIndex));
  const { getPointerPercent } = usePdfCoordinates();
  const rest = useRestToolbar();
  const coarse = useCoarsePointer();
  const lastPointerType = useRef('mouse');
  // R14: over the page the cursor is the pen in the hand, once it is picked up. A finger has no cursor.
  const pen = useMemo(() => (coarse || !armed ? undefined : cursorValue(marker)), [coarse, armed, marker.color, marker.style, marker.opacity]);
  // The touch-only style (no scroll, no selection) never reaches a fine pointer.
  const touchArmed = armed && coarse;
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const marks = elements.filter((el): el is HighlightElement => el.type === 'highlight' && el.pageIndex === pageIndex);
  const markFocus = useMarkFocus({ elements, openFor: (id) => { if (coarse) onPickMark?.(id); else rest.openFor(id, focusAnchor(marks.find((m) => m.id === id)?.direction === 'rtl')); } });

  const target = rest.targetId === null ? undefined : marks.find((m) => m.id === rest.targetId);
  const closeRest = rest.close;
  // A toolbar whose highlight is gone (deleted, undone) goes with it.
  useEffect(() => { if (rest.targetId !== null && !target) closeRest(); }, [rest.targetId, target, closeRest]);

  const anchorKey = rest.anchor ? `${rest.anchor.x}:${rest.anchor.y}` : undefined;
  /** READ-24: the full outline on an open mark or row, the faint pass on a resting pointer or a hovered card. */
  const outlineOf = (id: string) => (id === target?.id || id === openMarks?.openId ? 'open' : id === rest.restId || id === openMarks?.hoverId ? 'faint' : null);

  const commands = markCommands({ elements, dispatch, logAction, rearm, setAnnouncement });

  /** The way a mark laid at `start` reads: the text under it, else the page, else the reader. */
  const textDirectionAt = (start: { x: number; y: number }) => directionAtPoint(textRunsRef.current, start) ?? pageTextDirection(textRunsRef.current.map((r) => r.str));
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

  /** R52: a finger marks only from a line of text. One reader per press; no page canvas to read yet (null): on a line. */
  const readerAt = (point: { x: number; y: number }) => {
    const canvas = overlayRef.current?.parentElement?.querySelector<HTMLCanvasElement>('canvas') ?? null;
    return createSwipeReader(canvas, geometry?.height || PAGE_HEIGHT_DEFAULT_PTS, directionAt(point));
  };

  const startSwipe = useMarkSwipe({
    pageIndex, geometry, turns: turnsOf(pageTurns, pageIndex), elements, marker, armed, getPointerPercent, directionAt, textDirectionAt, dispatch, logAction, setAnnouncement, clicks,
    onPress: rest.clearHint, onInk: inkLanded, readerAt,
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
            // R2, R7: a single click or tap opens the highlight under it, unless the press just laid ink (that keeps the rest wait and hint).
            const node = (event.target as Element | null)?.closest('[data-element-id]');
            const id = node?.getAttribute('data-element-id');
            if (!node || !id || event.detail > 1 || (lastPointerType.current !== 'touch' && clicks.laidInk())) return;
            rest.clearHint();
            if (coarse) onPickMark?.(id); else rest.openFor(id, clickAnchor(node.getBoundingClientRect(), marks.find((m) => m.id === id)?.bands ?? [], event));
          }}
        >
          {marks.map((mark) => (
            <div
              key={mark.id} data-element-id={mark.id} data-editor-element-id={mark.id} data-picked={mark.id === pickedId ? '' : undefined} className={styles.mark} {...markFocus.markProps(mark.id)}
              style={{ left: `${mark.left}%`, top: `${mark.top}%`, width: `${mark.width}%`, height: `${mark.height}%` }}
            >
              <HighlightNode
                element={mark} isActive={false} onResizeStart={noop} turns={turnsOf(pageTurns, pageIndex)}
                boxPts={geometry ? { width: (mark.width / 100) * geometry.width, height: (mark.height / 100) * geometry.height } : undefined}
                hatch={geometry && mark.style === 'pencil' ? <MarkHatch mark={mark} boxPts={{ width: (mark.width / 100) * geometry.width, height: (mark.height / 100) * geometry.height }} /> : undefined}
              />
              {geometry && outlineOf(mark.id) && (
                <MarkOutline
                  mark={mark} turns={turnsOf(pageTurns, pageIndex)} faint={outlineOf(mark.id) === 'faint'}
                  boxPts={{ width: (mark.width / 100) * geometry.width, height: (mark.height / 100) * geometry.height }}
                />
              )}
              {mark.id === target?.id && rest.anchor && <span key={anchorKey} data-panel-anchor class={styles.panelAnchor} style={{ left: `${rest.anchor.x}%`, top: `${rest.anchor.y}%`, height: `${rest.anchor.bottom - rest.anchor.y}%`, translate: `${rest.anchor.pull}% 0` }} />}
            </div>
          ))}
        </div>
        {rest.hint && <MarkHint anchor={rest.hint} text={coarse ? t.tapHint : t.restHint} />}
        {target && !coarse && (
          <RestToolbar
            key={target.id} mark={target} anchorKey={anchorKey}
            onChange={(change) => commands.change(target, change)} onDelete={(at) => { commands.remove(target); rest.close(); onRemoved?.(at); }}
            onComment={() => { (onComment ?? commands.comment)(target); rest.close(); }} onClose={rest.close}
          />
        )}
      </div>
      {rail && <div className={notes.rail} data-notes-rail style={chrome === 1 ? undefined : { zoom: chrome }} onPointerDown={(event) => event.stopPropagation()}>{rail}</div>}
    </div>
  );
}
