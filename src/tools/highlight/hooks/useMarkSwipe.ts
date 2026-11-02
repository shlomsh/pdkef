import { useEffect, useRef } from 'preact/hooks';
import { paintMarkDraft } from '../lib/marks/paintMarkDraft.ts';
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
import { directionLatch, isMultiTouch, sidewaysEnough, swipeIntent } from '../lib/marker/swipeIntent.ts';
import type { createSwipeReader } from '#lib/pageLayout/swipeReader.ts';
import type { useClickMarks } from './useClickMarks.ts';

type Point = { x: number; y: number };
type SwipeReader = NonNullable<ReturnType<typeof createSwipeReader>>;

interface MarkSwipeOptions {
  pageIndex: number;
  geometry: PageGeometry | undefined;
  /** The page's quarter turns, which a sketched underline's preview follows like the committed mark. */
  turns?: number;
  /** Every element of the document: the new one's place in the history comes from the count. */
  elements: EditorElement[];
  marker: Marker;
  /** The marker is in the hand, for any pointer: put down, a press does nothing here. A finger's press then marks instead of scrolling. */
  armed: boolean;
  getPointerPercent: (event: MouseEvent | TouchEvent, container: HTMLElement, geometry?: PageGeometry) => Point;
  directionAt: (start: Point) => ReadingDirection;
  /** The direction the page's text gives a mark laid at `start`, none on a scan. Given: with none, the swipe's own direction decides. */
  textDirectionAt?: (start: Point) => ReadingDirection | undefined;
  dispatch: (action: ElementsAction) => void;
  logAction: HistoryLogger<EditorElement>;
  setAnnouncement: (message: string) => void;
  clicks: ReturnType<typeof useClickMarks>;
  /** The page's reader for a finger pressed here (page percent), read once per press. Off a line it moves the page and never marks. Absent or null (no canvas): on a line. */
  readerAt?: (point: Point) => SwipeReader | null;
  /** A press that will lay a mark begins. */
  onPress: () => void;
  /** The swipe committed a mark. */
  onInk: (element: HighlightElement) => void;
}

/** Screen px a press must travel before it becomes a swipe. */
const SWIPE_THRESHOLD_PX = 4;

/** A press by a mouse, a pen or a finger marks while the marker is armed; put down, none does. */
const marks = (event: PointerEvent, armed: boolean) => (
  armed && (event.pointerType === 'mouse' || event.pointerType === 'pen' || event.pointerType === 'touch')
);

// R52 under the browser's zoom: a zoomed page pans sideways with one finger whatever touch-action says, so a finger on a
// line claims a move as sideways as a mark, and every move once it marks. At 1x the page cannot move sideways and
// nothing is claimed, so a scroll is never held up. WebKit reads the touch listeners in place when a touch starts, so
// the claim listens while the marker is armed and a press only names the finger.
function useLineTouchClaim(armed: boolean) {
  const lineTouchRef = useRef<{ x: number; y: number; marking: boolean } | null>(null);
  useEffect(() => {
    if (!armed) return undefined;
    const claim = (move: TouchEvent) => {
      const press = lineTouchRef.current;
      if (!press || !move.cancelable || move.touches?.length !== 1 || (window.visualViewport?.scale ?? 1) <= 1) return;
      const dx = move.touches[0].clientX - press.x, dy = move.touches[0].clientY - press.y;
      if (press.marking || sidewaysEnough(dx, dy)) move.preventDefault();
    };
    const release = (touch: TouchEvent) => { if (touch.type !== 'touchstart' || isMultiTouch(touch)) lineTouchRef.current = null; };
    window.addEventListener('touchmove', claim, { passive: false });
    window.addEventListener('touchstart', release);
    window.addEventListener('touchend', release);
    window.addEventListener('touchcancel', release);
    return () => {
      window.removeEventListener('touchmove', claim);
      window.removeEventListener('touchstart', release);
      window.removeEventListener('touchend', release);
      window.removeEventListener('touchcancel', release);
    };
  }, [armed]);
  return lineTouchRef;
}

/** Keeps `offset` at the pointer's screen offset from `origin` until the press ends. */
function followPointerOffset(origin: Point, offset: { dx: number; dy: number }) {
  const follow = (move: MouseEvent | TouchEvent) => {
    const point = 'touches' in move && move.touches?.length ? move.touches[0] : (move as MouseEvent);
    offset.dx = point.clientX - origin.x;
    offset.dy = point.clientY - origin.y;
  };
  const ends = ['mouseup', 'touchend', 'touchcancel', 'blur'] as const;
  const unfollow = () => {
    window.removeEventListener('mousemove', follow);
    window.removeEventListener('touchmove', follow);
    for (const type of ends) window.removeEventListener(type, unfollow);
  };
  window.addEventListener('mousemove', follow);
  window.addEventListener('touchmove', follow);
  for (const type of ends) window.addEventListener(type, unfollow);
}

/**
 * A press on the page starts a swipe that lays the marker's bands; the gesture paints during the swipe
 * and commits once. Returns the pointerdown handler. A mouse press on a highlight starts nothing.
 */
export function useMarkSwipe(o: MarkSwipeOptions): (event: PointerEvent) => void {
  const gestureCancelRef = useRef<(() => void) | null>(null);
  const pendingCancelRef = useRef<(() => void) | null>(null);
  const abandonRef = useRef<(() => void) | null>(null);
  useEffect(() => () => { pendingCancelRef.current?.(); abandonRef.current?.(); gestureCancelRef.current?.(); }, []);
  const lineTouchRef = useLineTouchClaim(o.armed);

  return (event) => {
    // A second finger is a pinch or a pan, never a press (R62).
    if (event.isPrimary === false) return;
    if (event.button !== 0 || !marks(event, o.armed)) return;
    const isMouse = event.pointerType !== 'touch';
    // A finger's click is not read: the double-click and third click are a mouse's.
    if (isMouse) o.clicks.beginPress();
    // A mouse press on a highlight is a click that picks it. A finger on one is on a line of text (R52): a tap still
    // picks it, a sideways start lays a new band, and a vertical one is the browser's scroll.
    const onMark = !!(event.target as Element | null)?.closest('[data-element-id]');
    if (isMouse && onMark) return;
    const container = event.currentTarget as HTMLElement;
    const start = o.getPointerPercent(event, container, o.geometry);
    const origin = { x: event.clientX, y: event.clientY };
    // The pointer's screen offset from the press, for the swipe's own direction.
    const offset = { dx: 0, dy: 0 };
    // A finger that starts off the text moves the page sideways and never marks; the browser keeps the vertical scroll.
    const reader = !isMouse && !onMark ? o.readerAt?.(start) : undefined;
    const pans = !!reader && !reader.onLine(start);
    const scroller = pans ? container.closest<HTMLElement>('[data-workspace]') : null;
    const startScrollLeft = scroller?.scrollLeft ?? 0;
    pendingCancelRef.current?.();
    lineTouchRef.current = !isMouse && !pans ? { ...origin, marking: false } : null;
    // Nothing is laid until the pointer has moved: a plain click adds no element and leaves Redo alone.
    // Window listeners, not state: the move is never routed through a store.
    const stop = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('touchstart', onSecondFinger);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', stop);
      window.removeEventListener('touchcancel', stop);
      window.removeEventListener('blur', stop);
      pendingCancelRef.current = null;
    };
    // A second finger is a pinch or a pan: it never marks.
    const onSecondFinger = (touch: Event) => { if (isMultiTouch(touch)) stop(); };
    const onMove = (move: MouseEvent | TouchEvent) => {
      if (isMultiTouch(move)) { stop(); return; }
      const point = 'touches' in move && move.touches?.length ? move.touches[0] : (move as MouseEvent);
      const dx = point.clientX - origin.x;
      const dy = point.clientY - origin.y;
      offset.dx = dx;
      offset.dy = dy;
      if (pans) {
        // DOM only: the browser clamps it, and nothing here is state.
        if (scroller) scroller.scrollLeft = startScrollLeft - dx;
        return;
      }
      if (isMouse) {
        if (Math.hypot(dx, dy) < SWIPE_THRESHOLD_PX) return;
      } else {
        // A finger that starts mostly vertical is a scroll the browser takes; only a sideways start marks.
        const intent = swipeIntent(dx, dy);
        if (intent === 'wait') return;
        if (intent === 'scroll') { lineTouchRef.current = null; stop(); return; }
      }
      stop();
      if (lineTouchRef.current) lineTouchRef.current.marking = true;
      begin();
    };
    pendingCancelRef.current = stop;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', stop);
    window.addEventListener('touchstart', onSecondFinger);
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
        ...(marker.style !== 'highlight' ? { style: marker.style } : {}),
        ...(marker.opacity < 1 ? { opacity: marker.opacity } : {}),
        ...(marker.style !== 'pencil' && marker.strokeWidth !== undefined ? { strokeWidth: marker.strokeWidth } : {}),
        ...(marker.style !== 'pencil' && marker.stroke ? { stroke: marker.stroke } : {}),
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
      // A second finger landing mid-swipe turns it into a pinch or a pan: the engine's cancel leaves nothing behind.
      const abandon = (touch: Event) => {
        if (!gestureCancelRef.current) { done(); return; }
        if (isMultiTouch(touch)) { done(); gestureCancelRef.current(); }
      };
      const done = () => {
        window.removeEventListener('touchstart', abandon);
        window.removeEventListener('touchmove', abandon);
        window.removeEventListener('touchend', done);
        window.removeEventListener('touchcancel', done);
        abandonRef.current = null;
      };
      if (!isMouse) {
        abandonRef.current?.();
        window.addEventListener('touchstart', abandon);
        window.addEventListener('touchmove', abandon);
        window.addEventListener('touchend', done);
        window.addEventListener('touchcancel', done);
        abandonRef.current = done;
      }
      const fallback = o.directionAt(start);
      const latch = o.textDirectionAt ? directionLatch(o.textDirectionAt(start), fallback) : null;
      if (latch) followPointerOffset(origin, offset);
      startHighlightSwipe({
        dispatch: swipeDispatch, getPointerPercent: o.getPointerPercent, gestureCancelRef, logAction: o.logAction, setAnnouncement: o.setAnnouncement,
        messages: englishSignMessages, nextElementIndex: o.elements.length, pageGeometry: o.geometry,
        direction: fallback,
        ...(latch ? { directionAt: () => latch(offset.dx, offset.dy) } : {}),
        ...(reader !== undefined ? { reader } : {}),
        isMouse,
        // The preview draws the mark as it will stand (sketch, underline, clean), so the release changes nothing.
        paintDraft: (node, g) => {
          const boxPts = g && o.geometry ? { width: (g.width / 100) * o.geometry.width, height: (g.height / 100) * o.geometry.height } : undefined;
          paintMarkDraft(node, { ...newEl, ...(g ?? {}) } as HighlightElement, g ? g.bands : [], boxPts, o.turns ?? 0);
        },
      }, {
        pageIndex, container, id, newEl, start,
        getElementNode: () => container.querySelector<HTMLElement>(`[data-element-id="${id}"]`) ?? undefined,
      });
    }
  };
}
