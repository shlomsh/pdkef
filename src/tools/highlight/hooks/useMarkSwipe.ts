import { useEffect, useRef } from 'preact/hooks';
import { startHighlightSwipe } from '#editor-ui/highlight/highlightSwipeGesture.ts';
import type { ElementAction } from '#editor-ui/elementActions.ts';
import type { PageGeometry } from '#editor/geometry/coords.ts';
import type { HistoryLogger } from '#editor/model/actionHistory.ts';
import type { EditorElement, HighlightElement } from '#editor/model/editorModel.ts';
import type { ElementsAction } from '#editor/model/elementsReducer.ts';
import { createElementId } from '#editor/model/ids.ts';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import type { ReadingDirection } from '#lib/pageLayout/bands.ts';
import type { Marker } from '../lib/marker/markerState.ts';
import type { useClickMarks } from './useClickMarks.ts';

type Point = { x: number; y: number };

interface MarkSwipeOptions {
  pageIndex: number;
  geometry: PageGeometry | undefined;
  /** Every element of the document: the new one's place in the history comes from the count. */
  elements: EditorElement[];
  marker: Marker;
  /** The marker is armed for a finger: a one-finger press marks instead of scrolling. */
  touchArmed: boolean;
  getPointerPercent: (event: MouseEvent | TouchEvent, container: HTMLElement, geometry?: PageGeometry) => Point;
  directionAt: (start: Point) => ReadingDirection;
  dispatch: (action: ElementsAction) => void;
  logAction: HistoryLogger<EditorElement>;
  setAnnouncement: (message: string) => void;
  clicks: ReturnType<typeof useClickMarks>;
  /** A press that will lay a mark begins. */
  onPress: () => void;
  /** The swipe committed a mark. */
  onInk: (element: HighlightElement) => void;
}

/** Screen px a press must travel before it becomes a swipe. */
const SWIPE_THRESHOLD_PX = 4;

/** A press by a mouse or a pen marks; a finger scrolls unless the marker is armed for touch. */
const marks = (event: PointerEvent, touchArmed: boolean) => (
  event.pointerType === 'mouse' || event.pointerType === 'pen' || (touchArmed && event.pointerType === 'touch')
);

/**
 * A press on the page starts a swipe that lays the marker's bands; the gesture paints during the swipe
 * and commits once. Returns the pointerdown handler. A press on a highlight starts nothing.
 */
export function useMarkSwipe(o: MarkSwipeOptions): (event: PointerEvent) => void {
  const gestureCancelRef = useRef<(() => void) | null>(null);
  const pendingCancelRef = useRef<(() => void) | null>(null);
  useEffect(() => () => { pendingCancelRef.current?.(); gestureCancelRef.current?.(); }, []);

  return (event) => {
    if (event.button !== 0 || !marks(event, o.touchArmed)) return;
    const isMouse = event.pointerType !== 'touch';
    // A finger's click is not read: the double-click and third click are a mouse's.
    if (isMouse) o.clicks.beginPress();
    if ((event.target as Element | null)?.closest('[data-element-id]')) return;
    const container = event.currentTarget as HTMLElement;
    const start = o.getPointerPercent(event, container, o.geometry);
    const origin = { x: event.clientX, y: event.clientY };
    pendingCancelRef.current?.();
    // Nothing is laid until the pointer has moved: a plain click adds no element and leaves Redo alone.
    // Window listeners, not state: the move is never routed through a store.
    const stop = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', stop);
      window.removeEventListener('touchcancel', stop);
      window.removeEventListener('blur', stop);
      pendingCancelRef.current = null;
    };
    const onMove = (move: MouseEvent | TouchEvent) => {
      const point = 'touches' in move && move.touches?.length ? move.touches[0] : (move as MouseEvent);
      if (Math.hypot(point.clientX - origin.x, point.clientY - origin.y) < SWIPE_THRESHOLD_PX) return;
      stop();
      begin();
    };
    pendingCancelRef.current = stop;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', stop);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', stop);
    window.addEventListener('touchcancel', stop);
    window.addEventListener('blur', stop);

    function begin() {
      o.onPress();
      const id = createElementId();
      const { marker, pageIndex } = o;
      const newEl: HighlightElement = {
        id, type: 'highlight', pageIndex, left: start.x, top: start.y, width: 0, height: 0, bands: [], color: marker.color,
        ...(marker.style === 'underline' ? { style: 'underline' as const } : {}),
        ...(marker.opacity < 1 ? { opacity: marker.opacity } : {}),
        ...(marker.strokeWidth !== undefined ? { strokeWidth: marker.strokeWidth } : {}),
      };
      o.dispatch({ type: 'ADD_ELEMENT', payload: newEl });
      gestureCancelRef.current?.();
      o.clicks.inkStarted(id);
      // The marker stays armed: the swipe's disarm is not an action of this tool's state.
      const swipeDispatch = (action: ElementAction) => {
        if (action.type === 'DISARM_TOOL') return;
        o.dispatch(action);
        o.clicks.noteSwipeAction(id, action);
        if (action.type === 'UPDATE_ELEMENT' && action.payload.id === id && 'bands' in action.payload.changes) {
          o.onInk({ ...newEl, ...action.payload.changes } as HighlightElement);
        }
      };
      startHighlightSwipe({
        dispatch: swipeDispatch, getPointerPercent: o.getPointerPercent, gestureCancelRef, logAction: o.logAction, setAnnouncement: o.setAnnouncement,
        messages: englishSignMessages, nextElementIndex: o.elements.length, pageGeometry: o.geometry,
        direction: o.directionAt(start),
        isMouse,
      }, {
        pageIndex, container, id, newEl, start,
        getElementNode: () => container.querySelector<HTMLElement>(`[data-element-id="${id}"]`) ?? undefined,
      });
    }
  };
}
