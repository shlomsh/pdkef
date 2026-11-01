import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import PdfPageCanvas from '#editor-ui/PdfPageCanvas.tsx';
import EditorPageHeader from '#editor-ui/EditorPageHeader.tsx';
import HighlightNode from '#editor-ui/highlight/HighlightNode.tsx';
import usePdfCoordinates from '#editor-ui/hooks/usePdfCoordinates.ts';
import workspaceStyles from '#editor-ui/Workspace.module.css';
import type { HistoryLogger } from '#editor/model/actionHistory.ts';
import type { EditorElement, HighlightElement } from '#editor/model/editorModel.ts';
import type { ElementsAction } from '#editor/model/elementsReducer.ts';
import { pageGeometryFromPdfJsPage, type PageGeometry } from '#editor/geometry/coords.ts';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import { toPageTextRuns } from '#editor/geometry/textRuns.ts';
import { pageTextDirection } from '#editor/text/textDirection.js';
import { readTextItems } from '#lib/pdf/pdfTextItems.ts';
import { directionAtPoint, readerTextDirection, resolveHighlightDirection } from '#editor/highlight/resolveDirection.ts';
import type { ActionHistoryEntry } from '#editor/model/actionHistory.ts';
import type { EditorElementPatch } from '#editor/model/editorModel.ts';
import { signUpdateDescription } from '#editor/registry/signLabels.ts';
import { createElementId } from '#editor/model/ids.ts';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import useCoarsePointer from '#editor-ui/hooks/useCoarsePointer.ts';
import { useClickMarks } from '../hooks/useClickMarks.ts';
import { useMarkSwipe } from '../hooks/useMarkSwipe.ts';
import { useRestToolbar } from '../hooks/useRestToolbar.ts';
import { cursorValue } from '../lib/marker/cursor.ts';
import { inkEnd } from '../lib/marker/inkEnd.ts';
import { buildMarkEdit } from '../lib/marker/markEdit.ts';
import { deleteWithComments } from '../lib/notes/deleteElement.ts';
import { openCommentFor } from '../lib/notes/openComment.ts';
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
export default function HighlightPage({ pdfDocument, pageIndex, widthPx, elements, marker, touchArmed = false, rearm, dispatch, logAction, setAnnouncement, cardRef, rail }: {
  pdfDocument: PDFDocumentProxy | null;
  pageIndex: number;
  /** The page's width in CSS px at the current zoom. */
  widthPx: number;
  /** Every element of the document: the page draws its own, and the new one's place in the history comes from the count. */
  elements: EditorElement[];
  marker: Marker;
  /** The marker is armed for a finger (touch devices): a one-finger press marks and the page does not scroll. */
  touchArmed?: boolean;
  /** Every change made on a highlight becomes the marker for the next stroke (R5). */
  rearm: (change: Partial<Marker>) => void;
  dispatch: (action: ElementsAction) => void;
  logAction: HistoryLogger<EditorElement>;
  setAnnouncement: (message: string) => void;
  cardRef: (node: HTMLDivElement | null) => void;
  /** R29: this page's comments rail, drawn inside the card beside the page so a pinch carries it with its passages. */
  rail?: ComponentChildren;
}) {
  const [geometry, setGeometry] = useState<PageGeometry | undefined>(undefined);
  const { getPointerPercent } = usePdfCoordinates();
  const rest = useRestToolbar();
  const coarse = useCoarsePointer();
  const lastPointerType = useRef('mouse');
  // R14: over the page the cursor is the pen in the hand. A finger has no cursor.
  const pen = useMemo(() => (coarse ? undefined : cursorValue(marker)), [coarse, marker.color, marker.style, marker.opacity]);
  // The page's printed text in percent, kept for the swipe's reading direction; never state.
  const textRunsRef = useRef<ReturnType<typeof toPageTextRuns>>([]);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setGeometry(undefined);
    textRunsRef.current = [];
    if (!pdfDocument) return;
    let live = true;
    void pdfDocument.getPage(pageIndex + 1).then(async (page) => {
      if (!live) return;
      const pageGeometry = pageGeometryFromPdfJsPage(page);
      setGeometry(pageGeometry);
      try {
        const items = await readTextItems(page);
        if (live) textRunsRef.current = toPageTextRuns(items, pageGeometry);
      } catch {
        // No text to read the direction from: the swipe falls back to the reader's own.
      }
    });
    return () => { live = false; };
  }, [pdfDocument, pageIndex]);

  const marks = elements.filter((el): el is HighlightElement => el.type === 'highlight' && el.pageIndex === pageIndex);

  const target = rest.targetId === null ? undefined : marks.find((m) => m.id === rest.targetId);
  const closeRest = rest.close;
  // A toolbar whose highlight is gone (deleted, undone) goes with it.
  useEffect(() => { if (rest.targetId !== null && !target) closeRest(); }, [rest.targetId, target, closeRest]);

  const changeMark = (el: HighlightElement, change: Partial<Marker>) => {
    const { changes, entry } = buildMarkEdit(el, change, (kind) => signUpdateDescription(englishSignMessages, kind, 'highlight'));
    dispatch({ type: 'UPDATE_ELEMENT', payload: { id: el.id, changes: changes as EditorElementPatch } });
    if (entry) dispatch({ type: 'ADD_ACTION_HISTORY', payload: entry as ActionHistoryEntry<EditorElement> });
    rearm(change);
    recordAction('edit_mark');
  };

  const deleteMark = (el: HighlightElement) => {
    deleteWithComments(elements, el.id, englishSignMessages, { dispatch, logAction });
    recordAction('delete_mark');
    setAnnouncement(englishSignMessages.removedElement);
    rest.close();
  };

  /** The way a mark laid at `start` reads: the text under it, else the page, else the reader. */
  const directionAt = (start: { x: number; y: number }) => resolveHighlightDirection({
    atPress: directionAtPoint(textRunsRef.current, start), page: pageTextDirection(textRunsRef.current.map((r) => r.str)), pages: [], elements, readerDirection: readerTextDirection(),
  });

  /** R27: Comment opens the mark's comment card; a blank one is added first, unlogged (it is saved, and logged, with its text). */
  const commentOn = (el: HighlightElement) => {
    const { add, activeId } = openCommentFor(elements, el, createElementId());
    if (add) dispatch({ type: 'ADD_ELEMENT', payload: add });
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: activeId });
    rest.close();
  };

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

  const startSwipe = useMarkSwipe({
    pageIndex, geometry, elements, marker, touchArmed, getPointerPercent, directionAt, dispatch, logAction, setAnnouncement, clicks,
    onPress: rest.clearHint, onInk: inkLanded,
  });
  const onPointerDown = (event: PointerEvent) => {
    lastPointerType.current = event.pointerType;
    startSwipe(event);
  };

  return (
    <div
      data-editor-page-card ref={cardRef} className={rail ? notes.withRail : undefined}
      style={rail ? { '--page-w': `${widthPx}px`, '--notes-w': `${NOTES_W}px` } : undefined}
    >
      <EditorPageHeader pageNumber={pageIndex + 1} onClear={null} />
      <div className={`${workspaceStyles['page-wrapper']} ${styles.page}`} data-page-wrapper style={{ width: `${widthPx}px`, ...(pen ? { cursor: pen } : {}) }}>
        <PdfPageCanvas pdfDocument={pdfDocument} pageNum={pageIndex + 1} pageGeometry={geometry} />
        <div
          ref={overlayRef} data-page-overlay data-touch-armed={touchArmed ? '' : undefined} className={touchArmed ? `${workspaceStyles['page-overlay']} ${styles.touchArmed}` : workspaceStyles['page-overlay']} onPointerDown={onPointerDown}
          onPointerMove={rest.onPointerMove} onPointerLeave={rest.onPointerLeave}
          onClick={(event) => {
            // R7: a tap with a finger opens the highlight under it. A mouse opens it by resting.
            const id = (event.target as Element | null)?.closest('[data-element-id]')?.getAttribute('data-element-id');
            if (id && lastPointerType.current === 'touch') { rest.clearHint(); rest.openFor(id); }
          }}
        >
          {marks.map((mark) => (
            <div
              key={mark.id} data-element-id={mark.id} data-editor-element-id={mark.id} className={styles.mark}
              style={{ left: `${mark.left}%`, top: `${mark.top}%`, width: `${mark.width}%`, height: `${mark.height}%` }}
            >
              <HighlightNode element={mark} isActive={false} onResizeStart={noop} />
            </div>
          ))}
        </div>
        {rest.hint && <MarkHint anchor={rest.hint} text={coarse ? t.tapHint : t.restHint} />}
        {target && (
          <RestToolbar
            key={target.id} mark={target}
            onChange={(change) => changeMark(target, change)} onDelete={() => deleteMark(target)} onComment={() => commentOn(target)} onClose={rest.close}
          />
        )}
      </div>
      {rail && <div className={notes.rail} onPointerDown={(event) => event.stopPropagation()}>{rail}</div>}
    </div>
  );
}
