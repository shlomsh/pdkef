import { useEffect, useRef, useState } from 'preact/hooks';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import PdfPageCanvas from '#editor-ui/PdfPageCanvas.tsx';
import EditorPageHeader from '#editor-ui/EditorPageHeader.tsx';
import HighlightNode from '#editor-ui/highlight/HighlightNode.tsx';
import { startHighlightSwipe } from '#editor-ui/highlight/highlightSwipeGesture.ts';
import type { ElementAction } from '#editor-ui/elementActions.ts';
import usePdfCoordinates from '#editor-ui/hooks/usePdfCoordinates.ts';
import workspaceStyles from '#editor-ui/Workspace.module.css';
import type { HistoryLogger } from '#editor/model/actionHistory.ts';
import type { EditorElement, HighlightElement } from '#editor/model/editorModel.ts';
import type { ElementsAction } from '#editor/model/elementsReducer.ts';
import { createElementId } from '#editor/model/ids.ts';
import { pageGeometryFromPdfJsPage, type PageGeometry } from '#editor/geometry/coords.ts';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import { toPageTextRuns } from '#editor/geometry/textRuns.ts';
import { pageTextDirection } from '#editor/text/textDirection.js';
import { readTextItems } from '#lib/pdf/pdfTextItems.ts';
import { directionAtPoint, readerTextDirection, resolveHighlightDirection } from '#editor/highlight/resolveDirection.ts';
import { captureElementSnapshots, type ActionHistoryEntry } from '#editor/model/actionHistory.ts';
import type { EditorElementPatch } from '#editor/model/editorModel.ts';
import { deletedWith } from '#editor/model/elementsReducer.ts';
import { signElementTypeLabel, signUpdateDescription } from '#editor/registry/signLabels.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import useCoarsePointer from '#editor-ui/hooks/useCoarsePointer.ts';
import { useRestToolbar } from '../hooks/useRestToolbar.ts';
import { inkEnd } from '../lib/marker/inkEnd.ts';
import { buildMarkEdit } from '../lib/marker/markEdit.ts';
import type { Marker } from '../lib/marker/markerState.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import RestToolbar, { MarkHint } from './RestToolbar.tsx';
import styles from './HighlightPage.module.css';

const noop = () => {};

/** A press by a mouse or a pen marks; a finger scrolls. */
const isFinePointer = (event: PointerEvent) => event.pointerType === 'mouse' || event.pointerType === 'pen';

/**
 * One page card: its header, the page, and a wrapper per highlight on it. A fine-pointer press on the
 * page starts a swipe that lays the marker's bands; the gesture paints during the swipe and commits once.
 */
export default function HighlightPage({ pdfDocument, pageIndex, widthPx, elements, marker, rearm, dispatch, logAction, setAnnouncement, cardRef }: {
  pdfDocument: PDFDocumentProxy | null;
  pageIndex: number;
  /** The page's width in CSS px at the current zoom. */
  widthPx: number;
  /** Every element of the document: the page draws its own, and the new one's place in the history comes from the count. */
  elements: EditorElement[];
  marker: Marker;
  /** Every change made on a highlight becomes the marker for the next stroke (R5). */
  rearm: (change: Partial<Marker>) => void;
  dispatch: (action: ElementsAction) => void;
  logAction: HistoryLogger<EditorElement>;
  setAnnouncement: (message: string) => void;
  cardRef: (node: HTMLDivElement | null) => void;
}) {
  const gestureCancelRef = useRef<(() => void) | null>(null);
  const [geometry, setGeometry] = useState<PageGeometry | undefined>(undefined);
  const { getPointerPercent } = usePdfCoordinates();
  const rest = useRestToolbar();
  const coarse = useCoarsePointer();
  const lastPointerType = useRef('mouse');
  // The page's printed text in percent, kept for the swipe's reading direction; never state.
  const textRunsRef = useRef<ReturnType<typeof toPageTextRuns>>([]);

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

  useEffect(() => () => gestureCancelRef.current?.(), []);

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
    const snapshots = captureElementSnapshots(elements, deletedWith(el.id));
    dispatch({ type: 'DELETE_ELEMENT', payload: el.id });
    logAction('delete', 'DELETE_ELEMENT', el.pageIndex, formatMessage(englishSignMessages.deletedElementDescriptionTemplate, { label: signElementTypeLabel(englishSignMessages, 'highlight') }), snapshots);
    recordAction('delete_mark');
    setAnnouncement(englishSignMessages.removedElement);
    rest.close();
  };

  const onPointerDown = (event: PointerEvent) => {
    lastPointerType.current = event.pointerType;
    if (event.button !== 0 || !isFinePointer(event)) return;
    if ((event.target as Element | null)?.closest('[data-element-id]')) return;
    rest.clearHint();
    const container = event.currentTarget as HTMLElement;
    const start = getPointerPercent(event, container, geometry);
    const id = createElementId();
    const newEl: HighlightElement = {
      id, type: 'highlight', pageIndex, left: start.x, top: start.y, width: 0, height: 0, bands: [], color: marker.color,
      ...(marker.style === 'underline' ? { style: 'underline' as const } : {}),
      ...(marker.opacity < 1 ? { opacity: marker.opacity } : {}),
    };
    dispatch({ type: 'ADD_ELEMENT', payload: newEl });
    gestureCancelRef.current?.();
    // The marker stays armed: the swipe's disarm is not an action of this tool's state.
    const swipeDispatch = (action: ElementAction) => {
      if (action.type === 'DISARM_TOOL') return;
      dispatch(action);
      // The stroke committed its bands: rest waits for the pointer to leave this spot, and the first mark gets its hint.
      if (action.type === 'UPDATE_ELEMENT' && action.payload.id === id && 'bands' in action.payload.changes) {
        rest.strokeEnd();
        const end = inkEnd({ ...newEl, ...action.payload.changes } as HighlightElement);
        rest.showHint({ x: end.x, bottom: end.bottom, rtl: (action.payload.changes as Partial<HighlightElement>).direction === 'rtl' });
      }
    };
    startHighlightSwipe({
      dispatch: swipeDispatch, getPointerPercent, gestureCancelRef, logAction, setAnnouncement, messages: englishSignMessages,
      nextElementIndex: elements.length, pageGeometry: geometry,
      direction: resolveHighlightDirection({ atPress: directionAtPoint(textRunsRef.current, start), page: pageTextDirection(textRunsRef.current.map((r) => r.str)), pages: [], elements, readerDirection: readerTextDirection() }),
      isMouse: true,
    }, {
      pageIndex, container, id, newEl, start,
      getElementNode: () => container.querySelector<HTMLElement>(`[data-element-id="${id}"]`) ?? undefined,
    });
  };

  return (
    <div data-editor-page-card ref={cardRef}>
      <EditorPageHeader pageNumber={pageIndex + 1} onClear={null} />
      <div className={`${workspaceStyles['page-wrapper']} ${styles.page}`} data-page-wrapper style={{ width: `${widthPx}px` }}>
        <PdfPageCanvas pdfDocument={pdfDocument} pageNum={pageIndex + 1} pageGeometry={geometry} />
        <div
          data-page-overlay className={workspaceStyles['page-overlay']} onPointerDown={onPointerDown}
          onPointerMove={rest.onPointerMove} onPointerLeave={rest.onPointerLeave}
          onClick={(event) => {
            // R7: a tap with a finger opens the highlight under it. A mouse opens it by resting.
            const id = (event.target as Element | null)?.closest('[data-element-id]')?.getAttribute('data-element-id');
            if (id && lastPointerType.current === 'touch') { rest.clearHint(); rest.openFor(id); }
          }}
        >
          {marks.map((mark) => (
            <div
              key={mark.id} data-element-id={mark.id} className={styles.mark}
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
            onChange={(change) => changeMark(target, change)} onDelete={() => deleteMark(target)} onClose={rest.close}
          />
        )}
      </div>
    </div>
  );
}
