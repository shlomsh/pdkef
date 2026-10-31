/**
 * The Comment tool's gesture. A swipe across text anchors the comment to that passage (bands read from
 * the page's own pixels, like a highlight); a press that barely moves, or a swipe that finds no text,
 * drops a pin at the press. Moves only repaint the draft layer; state commits once on release and
 * leaves the comment active so its card opens. No history entry: it is recorded on the first save.
 */
import { startGesture } from '#lib/gestures/controller.ts';
import { swallowNextClick } from '#lib/gestures/swallowNextClick.ts';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import type { EditorElement, EditorElementPatch } from '#editor/model/editorModel.ts';
import type { PageGeometry } from '#editor/geometry/coords.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import { signElementTypeLabel } from '#editor/registry/signLabels.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { PAGE_HEIGHT_DEFAULT_PTS, PAGE_WIDTH_DEFAULT_PTS } from '#editor/model/signGeometry.js';
import type { Band, ReadingDirection } from '../lib/highlight/bands.ts';
import { createSwipeReader, paintHighlightDraft } from '../lib/highlight/swipeReader.ts';
import { highlightGeometry } from '../lib/highlight/swipe.ts';
import { pinBox } from '../lib/comments/pinBox.ts';
import type { WorkspaceGestureAction } from './useWorkspaceGestures.ts';

type PointerPercent = (event: MouseEvent | TouchEvent, container: HTMLElement, geometry?: PageGeometry) => { x: number; y: number };
type Point = { x: number; y: number };

/** Less than this many CSS px of travel is a tap. */
const TAP_PX = 4;
const TINT = 'var(--color-comment-anchor)';

interface CommentGestureDeps {
  dispatch: (action: WorkspaceGestureAction) => void;
  getPointerPercent: PointerPercent;
  gestureCancelRef: { current: (() => void) | null };
  setAnnouncement: (message: string) => void;
  messages: SignMessages;
  pageGeometry?: PageGeometry;
  direction?: ReadingDirection;
  /** The press was a mouse press: its trailing click must not reach the page (touch already suppresses it). */
  isMouse?: boolean;
}

interface CommentGestureTarget {
  pageIndex: number;
  container: HTMLElement;
  id: string;
  newEl: EditorElement;
  start: Point;
  getElementNode: () => HTMLElement | undefined;
}

export function startCommentGesture(deps: CommentGestureDeps, target: CommentGestureTarget): void {
  const { dispatch, getPointerPercent, gestureCancelRef, setAnnouncement, messages: t, pageGeometry, direction, isMouse } = deps;
  const { container, id, start, getElementNode } = target;
  const canvas = container.parentElement?.querySelector<HTMLCanvasElement>('canvas') ?? null;
  const reader = createSwipeReader(canvas, pageGeometry?.height || PAGE_HEIGHT_DEFAULT_PTS, direction);
  const rect = container.getBoundingClientRect();
  const page = { width: pageGeometry?.width || PAGE_WIDTH_DEFAULT_PTS, height: pageGeometry?.height || PAGE_HEIGHT_DEFAULT_PTS };
  // The farthest the pointer has been from the press, in CSS px. Read-only bookkeeping for the tap test.
  let travelPx = 0;
  // A swipe that starts on blank page is a pin too, not a passage of nothing.
  const startsOnText = !!reader?.onText(start);
  const clearDraft = () => {
    const node = getElementNode();
    if (!node) return;
    paintHighlightDraft(node, [], TINT);
    node.removeAttribute('data-comment-swiping');
  };
  gestureCancelRef.current = startGesture<{ pageBands: Band[] }>({
    computePatch: (moveEvent) => {
      if ('touches' in moveEvent && moveEvent.touches && moveEvent.cancelable) moveEvent.preventDefault();
      const at = getPointerPercent(moveEvent, container, pageGeometry);
      travelPx = Math.max(travelPx, Math.hypot(((at.x - start.x) / 100) * rect.width, ((at.y - start.y) / 100) * rect.height));
      return { pageBands: travelPx < TAP_PX || !startsOnText ? [] : reader?.bandsBetween(start, at) ?? [] };
    },
    writeDOM: ({ pageBands }) => {
      const node = getElementNode();
      const geometry = highlightGeometry(pageBands);
      if (!node) return;
      if (!geometry) {
        paintHighlightDraft(node, [], TINT);
        node.removeAttribute('data-comment-swiping');
        return;
      }
      node.setAttribute('data-comment-swiping', '');
      node.style.left = `${geometry.left}%`;
      node.style.top = `${geometry.top}%`;
      node.style.width = `${geometry.width}%`;
      node.style.height = `${geometry.height}%`;
      paintHighlightDraft(node, geometry.bands, TINT);
    },
    commit: (patch) => {
      gestureCancelRef.current = null;
      if (isMouse) swallowNextClick();
      const geometry = travelPx < TAP_PX || !startsOnText ? null : highlightGeometry(patch?.pageBands ?? []);
      clearDraft();
      const changes = geometry
        ? { left: geometry.left, top: geometry.top, width: geometry.width, height: geometry.height, anchor: { kind: 'passage', bands: geometry.bands, ...(direction === 'rtl' ? { direction } : {}) } }
        : { ...pinBox(start, page), anchor: { kind: 'point' } };
      dispatch({ type: 'UPDATE_ELEMENT', payload: { id, changes: changes as EditorElementPatch } });
      dispatch({ type: 'DISARM_TOOL' });
      recordAction('place_mark');
      setAnnouncement(formatMessage(t.addedShapeAnnouncementTemplate, { label: signElementTypeLabel(t, 'comment') }));
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
