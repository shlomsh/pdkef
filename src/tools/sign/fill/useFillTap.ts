/**
 * Fill mode (SNG-15): the adapter between a page overlay's raw pointer and touch events
 * and `fillTapDecision`'s pure decision (docs/sign-fill-mode.md, "Taps", "Hints",
 * "Gestures", "The focus proxy"). This hook decides nothing itself: it turns an event
 * into a `FillTapInput`, asks `fillTapDecision`, and carries out whichever
 * `FillTapDecision` comes back. What a tap *should* do lives in `fillTap.ts`; this file
 * only knows how to read a DOM event and how to act on the answer.
 *
 * A touch tap decides exactly once. `onTouchStart` only sets the aimed key (the
 * droppable look) and never acts. `onTouchEnd` decides, gated by `classifyTouchTap` so a
 * scroll or drag is never read as a tap. It carries out 'focus', 'dismiss' and
 * 'freeSlot' itself and calls `preventDefault`, so iOS synthesizes no click. For
 * 'native' and 'delegate' it lets the click come, and `onClickCapture` carries out that
 * same decision without deciding again: the focus a tap causes can move the page under
 * the finger (iOS scrolls the field into view), so the click's own point is not the tap's.
 * Only a mouse click decides in `onClickCapture`.
 *
 * A free slot's own focus is a special case (MOBI-24): iOS only raises the keyboard for a
 * focus made synchronously inside a touch handler, before the slot's own input even
 * exists to focus. So `act` focuses the hidden proxy input first, synchronously, and only
 * then calls `openFreeSlot` - see docs/sign-fill-mode.md, "The focus proxy".
 */
import { useRef } from 'preact/hooks';
import { clientPointToPagePercent, type PageGeometry } from '../../../editor/geometry/coords.ts';
import { fillTapDecision } from './fillTap.ts';
import { reachTarget } from './fillReach.ts';
import { fillKeyOf, focusFillInput } from './fillDom.ts';
import { classifyTouchTap, type TapGestureSample } from '../tapOutsideDeselect.ts';
import { useFill } from './FillContext.tsx';
import type { FillTapDecision, FillTool, PagePoint, ReachTarget } from './fillTypes.ts';

type OnOverlay = { currentTarget: HTMLElement };

/** How long after a touch tap its synthesized click still belongs to it. */
const TOUCH_CLICK_WINDOW_MS = 1000;
export type FillMouseEvent = MouseEvent & OnOverlay;
export type FillPointerEvent = PointerEvent & OnOverlay;
export type FillTouchEvent = TouchEvent & OnOverlay;

export interface UseFillTapOptions {
  tool: FillTool;
  /** One page's reach targets for the armed tool. */
  targetsOf: (pageIndex: number) => ReachTarget[];
  pageGeometryOf: (pageIndex: number) => PageGeometry | undefined;
  /** A fill input has focus or an element is selected; read at press time. */
  engaged: () => boolean;
  /**
   * Production's own tap path (handlePageClick), at `at` when given. `tool` is set when
   * the decision ran as if a different tool were armed (nothing armed, a tap on a
   * detected tick box: 'symbol').
   */
  delegate: (event: FillMouseEvent, pageIndex: number, at?: PagePoint, tool?: 'symbol') => void;
  /** Finish typing and deselect (PdfWorkspace's deactivateAll). */
  dismiss: () => void;
}

export interface FillTapHandlers {
  onClickCapture: (event: FillMouseEvent, pageIndex: number) => void;
  onMouseDown: () => void;
  onPointerMove: (event: FillPointerEvent, pageIndex: number) => void;
  onPointerLeave: () => void;
  onTouchStart: (event: FillTouchEvent, pageIndex: number) => void;
  onTouchEnd: (event: FillTouchEvent, pageIndex: number) => void;
  onTouchCancel: () => void;
}

export default function useFillTap(options: UseFillTapOptions): FillTapHandlers {
  const { tool, targetsOf, pageGeometryOf, engaged, delegate, dismiss } = options;
  const { setAimedKey, openFreeSlot, proxyRef } = useFill();

  // Touch-gesture tracking, read and cleared once the tracked touch ends or is
  // cancelled. engagedAtPress is set by both a mousedown and a touchstart, and stays
  // untouched by an unrelated touch's end (see onTouchEnd) since decide() below still
  // needs to read it live for the gesture actually in progress.
  const touchStartRef = useRef<TapGestureSample | null>(null);
  const touchIdRef = useRef<number | null>(null);
  const multiTouchRef = useRef(false);
  const engagedAtPress = useRef(false);
  // A touch decides once, at touchend. The click iOS synthesizes afterwards only carries
  // out a 'native' or 'delegate' decision made there, never decides again: by then the
  // focus that tap caused may have moved the page under the finger (the toolbar hides,
  // iOS scrolls the field into view), so the click's own point is no longer the tap's.
  // Measured on iOS 26: deciding again sent the focus to whatever field slid under it.
  const touchTapRef = useRef<{ decision: FillTapDecision; time: number } | null>(null);

  /** A browser client point, on this page, in the percent model fillTap.ts decides over. */
  const pointAt = (clientX: number, clientY: number, overlay: HTMLElement, pageIndex: number): PagePoint => {
    const rect = overlay.getBoundingClientRect();
    return {
      pageIndex,
      ...clientPointToPagePercent(
        { x: clientX, y: clientY },
        { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        pageGeometryOf(pageIndex),
      ),
    };
  };

  /** What the armed tool's own reach finds near `at`. Screen pixels: a finger's precision
   * is a physical size, so pxPerPercent must come from the overlay's own rendered rect. */
  const reachAt = (at: PagePoint, overlay: HTMLElement): ReachTarget | null => {
    const rect = overlay.getBoundingClientRect();
    const scale = window.visualViewport?.scale ?? 1;
    return reachTarget(at, targetsOf(at.pageIndex), { x: (rect.width / 100) * scale, y: (rect.height / 100) * scale });
  };

  // A tap inside an existing element's own DOM (its body, its handles, its toolbar)
  // belongs to production, never to fill mode - unless that DOM is itself a fill input
  // (a placed text element's textarea), which must still fall through to the reach check.
  const ownedByElement = (target: Element | null): boolean =>
    target?.closest('[data-editor-element]') != null && fillKeyOf(target) === null;

  const sample = (touch: Touch): TapGestureSample => ({
    x: touch.clientX,
    y: touch.clientY,
    time: Date.now(),
    viewportScale: window.visualViewport?.scale ?? 1,
    viewportOffsetLeft: window.visualViewport?.offsetLeft ?? 0,
    viewportOffsetTop: window.visualViewport?.offsetTop ?? 0,
    scrollTop: document.scrollingElement?.scrollTop ?? 0,
  });

  const decide = (target: Element | null, at: PagePoint, overlay: HTMLElement): FillTapDecision =>
    fillTapDecision({
      onFillInput: fillKeyOf(target) !== null,
      typing: engagedAtPress.current,
      tool,
      reach: reachAt(at, overlay),
      at,
    });

  /** Carries out a decision this hook can resolve on its own. 'native' and 'delegate'
   * are the caller's job (native focus, or production's handlePageClick) and do nothing
   * here. */
  const act = (decision: FillTapDecision): boolean => {
    if (decision.type === 'focus') {
      focusFillInput(decision.key);
      return true;
    }
    if (decision.type === 'dismiss') {
      dismiss();
      return true;
    }
    if (decision.type === 'freeSlot') {
      // Proxy first, synchronously, before the slot (and its own input) exists - MOBI-24.
      proxyRef.current?.focus({ preventScroll: true });
      openFreeSlot(decision.at);
      return true;
    }
    return false;
  };

  const onMouseDown = () => {
    // Read now: on desktop, mousedown itself blurs whatever was focused before the click
    // fires, so onClickCapture's own engaged() read would already be too late.
    engagedAtPress.current = engaged();
  };

  const onClickCapture = (event: FillMouseEvent, pageIndex: number) => {
    const touchTap = touchTapRef.current;
    touchTapRef.current = null;
    if (touchTap && Date.now() - touchTap.time < TOUCH_CLICK_WINDOW_MS) {
      if (touchTap.decision.type === 'delegate') delegate(event, pageIndex, touchTap.decision.at, touchTap.decision.tool);
      // 'native': the input already has focus. A click that lands on the page after the
      // shift must not reach the workspace's blank-area deselect and take it away.
      else event.stopPropagation();
      return;
    }
    const target = event.target as Element | null;
    if (ownedByElement(target)) {
      // Exactly production's own path: no corrected point, since nothing here found a
      // reach target to correct it to.
      delegate(event, pageIndex);
      return;
    }
    const at = pointAt(event.clientX, event.clientY, event.currentTarget, pageIndex);
    const decision = decide(target, at, event.currentTarget);
    if (decision.type === 'delegate') {
      delegate(event, pageIndex, decision.at, decision.tool);
      return;
    }
    if (act(decision)) {
      // Stops the workspace's own blank-area deselect from also running on this click.
      event.preventDefault();
      event.stopPropagation();
    }
    // 'native': nothing else to do, the browser focuses the input on its own.
  };

  const onPointerMove = (event: FillPointerEvent, pageIndex: number) => {
    // Pointer events, not mouse events: the mouse events iOS synthesizes after a tap
    // must never set a hover aim. A real mouse hovering has buttons === 0.
    if (event.pointerType !== 'mouse' || event.buttons !== 0) return;
    const target = event.target as Element | null;
    if (ownedByElement(target)) {
      setAimedKey(null);
      return;
    }
    const at = pointAt(event.clientX, event.clientY, event.currentTarget, pageIndex);
    setAimedKey(reachAt(at, event.currentTarget)?.key ?? null);
  };

  const onPointerLeave = () => {
    setAimedKey(null);
  };

  const onTouchStart = (event: FillTouchEvent, pageIndex: number) => {
    if (event.touches.length > 1) {
      multiTouchRef.current = true;
      setAimedKey(null);
      return;
    }
    const touch = event.changedTouches[0];
    touchTapRef.current = null;
    touchStartRef.current = sample(touch);
    touchIdRef.current = touch.identifier;
    multiTouchRef.current = false;
    engagedAtPress.current = engaged();
    const target = event.target as Element | null;
    if (!ownedByElement(target)) {
      const at = pointAt(touch.clientX, touch.clientY, event.currentTarget, pageIndex);
      setAimedKey(reachAt(at, event.currentTarget)?.key ?? null);
    }
    // Never preventDefault here: scrolling and pinch stay native.
  };

  const onTouchEnd = (event: FillTouchEvent, pageIndex: number) => {
    setAimedKey(null);
    const touch = Array.from(event.changedTouches).find((candidate) => candidate.identifier === touchIdRef.current);
    if (!touch) return;
    const start = touchStartRef.current;
    const multiTouch = multiTouchRef.current;
    touchStartRef.current = null;
    touchIdRef.current = null;
    multiTouchRef.current = false;
    // A scroll or drag is not a tap - event.touches is empty by touchend, so the point
    // and the decision below both read clientX/Y off this changedTouches entry instead.
    if (!start || !classifyTouchTap(start, sample(touch), { multiTouch })) return;
    const target = event.target as Element | null;
    if (ownedByElement(target)) {
      // Production's own tap: the click carries it out exactly as production would.
      touchTapRef.current = { decision: { type: 'delegate' }, time: Date.now() };
      return;
    }
    const at = pointAt(touch.clientX, touch.clientY, event.currentTarget, pageIndex);
    const decision = decide(target, at, event.currentTarget);
    if (act(decision)) {
      // Suppresses the click iOS would otherwise synthesize from this touch.
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    // 'native' and 'delegate': the synthesized click carries this decision out as is.
    touchTapRef.current = { decision, time: Date.now() };
  };

  const onTouchCancel = () => {
    touchTapRef.current = null;
    touchStartRef.current = null;
    touchIdRef.current = null;
    multiTouchRef.current = false;
    setAimedKey(null);
  };

  return { onClickCapture, onMouseDown, onPointerMove, onPointerLeave, onTouchStart, onTouchEnd, onTouchCancel };
}
