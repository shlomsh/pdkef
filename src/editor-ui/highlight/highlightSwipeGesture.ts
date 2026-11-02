/**
 * The highlight's swipe (SIGN-46). The bands come from the page's own pixels, so every move only
 * reads the canvas and repaints the element's draft layer; state commits once on release.
 */
import { startGesture } from '#lib/gestures/controller.ts';
import { swallowNextClick } from '#lib/gestures/swallowNextClick.ts';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { captureAddedElement, type HistoryLogger } from '#editor/model/actionHistory.ts';
import type { EditorElement, EditorElementPatch } from '#editor/model/editorModel.ts';
import type { PageGeometry } from '#editor/geometry/coords.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import { signElementTypeLabel } from '#editor/registry/signLabels.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { PAGE_HEIGHT_DEFAULT_PTS } from '#editor/model/signGeometry.js';
import type { Band } from '#lib/pageLayout/bands.ts';
import type { ReadingDirection } from '#lib/pageLayout/bands.ts';
import { createSwipeReader, paintHighlightDraft } from '#lib/pageLayout/swipeReader.ts';
import { highlightGeometry } from '#lib/pageLayout/swipe.ts';
import type { ElementAction } from '../elementActions.ts';

type PointerPercent = (event: MouseEvent | TouchEvent, container: HTMLElement, geometry?: PageGeometry) => { x: number; y: number };

type SwipeReader = NonNullable<ReturnType<typeof createSwipeReader>>;

interface HighlightSwipeDeps {
  dispatch: (action: ElementAction) => void;
  getPointerPercent: PointerPercent;
  gestureCancelRef: { current: (() => void) | null };
  logAction: HistoryLogger<EditorElement>;
  setAnnouncement: (message: string) => void;
  messages: SignMessages;
  nextElementIndex: number;
  pageGeometry?: PageGeometry;
  direction?: ReadingDirection;
  /** A reader the caller already made for this press (null: no canvas). Absent: the gesture makes its own. */
  reader?: SwipeReader | null;
  /** The swipe started with a mouse press: its trailing click must not reach the page (touch already suppresses it). */
  isMouse?: boolean;
}

interface HighlightSwipeTarget {
  pageIndex: number;
  container: HTMLElement;
  id: string;
  newEl: EditorElement;
  start: { x: number; y: number };
  getElementNode: () => HTMLElement | undefined;
}

export function startHighlightSwipe(deps: HighlightSwipeDeps, target: HighlightSwipeTarget): void {
  const { dispatch, getPointerPercent, gestureCancelRef, logAction, setAnnouncement, messages: t, nextElementIndex, pageGeometry, direction, isMouse } = deps;
  const given = deps.reader;
  const { pageIndex, container, id, newEl, start, getElementNode } = target;
  const reader = given !== undefined ? given : createSwipeReader(
    container.parentElement?.querySelector<HTMLCanvasElement>('canvas') ?? null, pageGeometry?.height || PAGE_HEIGHT_DEFAULT_PTS, direction,
  );
  const color = newEl.type === 'highlight' ? newEl.color : '';
  const clearDraft = () => {
    const node = getElementNode();
    if (node) paintHighlightDraft(node, [], color);
  };
  gestureCancelRef.current = startGesture<{ pageBands: Band[] }>({
    computePatch: (moveEvent) => {
      if ('touches' in moveEvent && moveEvent.touches && moveEvent.cancelable) moveEvent.preventDefault();
      return { pageBands: reader?.bandsBetween(start, getPointerPercent(moveEvent, container, pageGeometry)) ?? [] };
    },
    writeDOM: ({ pageBands }) => {
      const node = getElementNode();
      if (!node) return;
      const geometry = highlightGeometry(pageBands);
      if (!geometry) {
        paintHighlightDraft(node, [], color);
        return;
      }
      node.style.left = `${geometry.left}%`;
      node.style.top = `${geometry.top}%`;
      node.style.width = `${geometry.width}%`;
      node.style.height = `${geometry.height}%`;
      paintHighlightDraft(node, geometry.bands, color);
    },
    commit: (patch) => {
      gestureCancelRef.current = null;
      if (isMouse) swallowNextClick();
      // A tap never moved: one band on the row under the finger.
      const geometry = highlightGeometry(patch ? patch.pageBands : reader?.bandsBetween(start, start) ?? []);
      clearDraft();
      if (!geometry) {
        dispatch({ type: 'DELETE_ELEMENT', payload: id });
        dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
        return;
      }
      const changes = { ...geometry, ...(direction === 'rtl' ? { direction } : {}) };
      dispatch({ type: 'UPDATE_ELEMENT', payload: { id, changes: changes as EditorElementPatch } });
      dispatch({ type: 'DISARM_TOOL' });
      recordAction('place_mark');
      const label = signElementTypeLabel(t, 'highlight');
      const finalElement = { ...newEl, ...changes } as EditorElement;
      logAction('add', 'ADD_SHAPE', pageIndex, formatMessage(t.addedShapeDescriptionTemplate, { label }), [captureAddedElement(finalElement, nextElementIndex)]);
      setAnnouncement(formatMessage(t.addedShapeAnnouncementTemplate, { label }));
    },
    cancel: () => {
      gestureCancelRef.current = null;
      if (isMouse) swallowNextClick();
      clearDraft();
      dispatch({ type: 'DELETE_ELEMENT', payload: id });
      dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
    },
  });
}
