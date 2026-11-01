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
import { directionAtPoint, readerTextDirection, resolveHighlightDirection } from '#editor/highlight/resolveDirection.ts';
import type { Marker } from '../lib/marker/markerState.ts';
import styles from './HighlightPage.module.css';

const noop = () => {};

/** A press by a mouse or a pen marks; a finger scrolls. */
const isFinePointer = (event: PointerEvent) => event.pointerType === 'mouse' || event.pointerType === 'pen';

/**
 * One page card: its header, the page, and a wrapper per highlight on it. A fine-pointer press on the
 * page starts a swipe that lays the marker's bands; the gesture paints during the swipe and commits once.
 */
export default function HighlightPage({ pdfDocument, pageIndex, widthPx, elements, marker, dispatch, logAction, setAnnouncement, cardRef }: {
  pdfDocument: PDFDocumentProxy | null;
  pageIndex: number;
  /** The page's width in CSS px at the current zoom. */
  widthPx: number;
  /** Every element of the document: the page draws its own, and the new one's place in the history comes from the count. */
  elements: EditorElement[];
  marker: Marker;
  dispatch: (action: ElementsAction) => void;
  logAction: HistoryLogger<EditorElement>;
  setAnnouncement: (message: string) => void;
  cardRef: (node: HTMLDivElement | null) => void;
}) {
  const gestureCancelRef = useRef<(() => void) | null>(null);
  const [geometry, setGeometry] = useState<PageGeometry | undefined>(undefined);
  const { getPointerPercent } = usePdfCoordinates();

  useEffect(() => {
    setGeometry(undefined);
    if (!pdfDocument) return;
    let live = true;
    void pdfDocument.getPage(pageIndex + 1).then((page) => {
      if (live) setGeometry(pageGeometryFromPdfJsPage(page));
    });
    return () => { live = false; };
  }, [pdfDocument, pageIndex]);

  useEffect(() => () => gestureCancelRef.current?.(), []);

  const marks = elements.filter((el): el is HighlightElement => el.type === 'highlight' && el.pageIndex === pageIndex);

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !isFinePointer(event)) return;
    if ((event.target as Element | null)?.closest('[data-element-id]')) return;
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
    const swipeDispatch = (action: ElementAction) => { if (action.type !== 'DISARM_TOOL') dispatch(action); };
    startHighlightSwipe({
      dispatch: swipeDispatch, getPointerPercent, gestureCancelRef, logAction, setAnnouncement, messages: englishSignMessages,
      nextElementIndex: elements.length, pageGeometry: geometry,
      direction: resolveHighlightDirection({ atPress: directionAtPoint([], start), page: undefined, pages: [], elements, readerDirection: readerTextDirection() }),
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
        <div data-page-overlay className={workspaceStyles['page-overlay']} onPointerDown={onPointerDown}>
          {marks.map((mark) => (
            <div
              key={mark.id} data-element-id={mark.id} className={styles.mark}
              style={{ left: `${mark.left}%`, top: `${mark.top}%`, width: `${mark.width}%`, height: `${mark.height}%` }}
            >
              <HighlightNode element={mark} isActive={false} onResizeStart={noop} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
