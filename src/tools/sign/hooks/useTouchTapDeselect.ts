// MOBI-30: a touch tap on blank page area deselects, moved out of PdfWorkspace.tsx unchanged.
import { useCallback, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';
import {
  classifyTouchTap,
  isBlankAreaTarget,
  readTapSample,
  type TapGestureSample,
} from '#lib/gestures/tapOutsideDeselect.ts';
import formFieldHintStyles from '../components/FormFieldHints.module.css';
import { fillKeyOf } from '../lib/fill/fillDom.ts';

// MOBI-30: a touch tap that lands on any of these (an element, its toolbar,
// its resize handles, the page header's Clear button, a form-field hint, or
// any other ordinary control) is never "blank page area" - see
// onTouchEnd below. `[data-editor-actions]` and
// `[data-editor-resizer]` are already inside `[data-editor-element]` in the
// current DOM (DraggableWrapper.tsx), but are named explicitly rather than
// relied on transitively, since nothing here enforces that nesting.
const BLANK_AREA_EXCLUDED_SELECTOR = [
  '[data-editor-element]',
  '[data-editor-actions]',
  '[data-editor-resizer]',
  '[data-editor-page-header]',
  `.${formFieldHintStyles['field-hints']}`,
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[contenteditable="true"]',
].join(', ');

export function useTouchTapDeselect({ workspaceRef, selectedTool, dispatch }: {
  workspaceRef: RefObject<HTMLElement>;
  selectedTool: string | null;
  dispatch: (action: { type: 'SET_ACTIVE_ELEMENT_ID'; payload: null }) => void;
}) {
  const deactivateAll = useCallback(() => {
    // MOBI-30: the keyboard should go down with the box. A real mouse click
    // elsewhere blurs the textarea for free (focus just moves), but the
    // touch-tap path below never moves focus anywhere - nothing else asks
    // for it - so it has to be done explicitly here, which also covers the
    // ordinary mouse/onClick path for free.
    // Fill mode (SNG-15): a slot is an <input>, and it goes down the same way.
    const active = document.activeElement;
    if (active instanceof HTMLTextAreaElement || (active instanceof HTMLElement && fillKeyOf(active) !== null)) {
      active.blur();
    }
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
  }, [dispatch]);
  // --- MOBI-30: touch-tap-outside deselect (see tapOutsideDeselect.ts) ---
  //
  // `onClick={deactivateAll}` below only ever fires from a browser-synthesised
  // `click`, which a real iPhone can suppress entirely: a tap with a few
  // points of finger jitter (worse while pinch-zoomed) reads to iOS as the
  // start of a pan, so it fires `pointercancel` and never synthesises a
  // click - but `touchstart`/`touchend` still fire. This is a one-shot
  // recognition on release, not a live gesture: nothing here runs during
  // `touchmove` (there is no `touchmove` listener at all), and the only refs
  // held across the gesture are the start sample and the touch identifier -
  // see the gesture golden rule in `.claude/rules/editor.md`.
  //
  // Skipped entirely while a tool is armed: `useWorkspaceGestures`' overlay
  // handlers own that tap (placing an element, or a drag-tool's own
  // `touchstart` already having called `stopPropagation`), and re-checked at
  // release since arming never changes mid-gesture but the check is cheap
  // enough not to assume it.
  const touchTapStartRef = useRef<TapGestureSample | null>(null);
  const touchTapIdRef = useRef<number | null>(null);
  const touchTapMultiRef = useRef(false);

  const readScrollTop = () =>
    (workspaceRef.current?.scrollTop || 0) + (document.scrollingElement?.scrollTop || 0);

  const resetTouchTap = () => {
    touchTapStartRef.current = null;
    touchTapIdRef.current = null;
    touchTapMultiRef.current = false;
  };

  const handlePagesContainerTouchStart = (e: TouchEvent) => {
    if (e.touches.length > 1) {
      // A second finger joining disqualifies the whole sequence, even the
      // touch that started it - a pinch always disqualifies, never resets
      // into tracking the newest finger.
      touchTapMultiRef.current = true;
      return;
    }
    const touch = e.changedTouches[0];
    if (!touch) return;
    touchTapStartRef.current = readTapSample(touch, Date.now(), readScrollTop());
    touchTapIdRef.current = touch.identifier;
    touchTapMultiRef.current = false;
  };

  const handlePagesContainerTouchEnd = (e: TouchEvent) => {
    const start = touchTapStartRef.current;
    const trackedId = touchTapIdRef.current;
    if (!start || trackedId == null) return;
    const endTouch = Array.from(e.changedTouches).find((t) => t.identifier === trackedId);
    if (!endTouch) return; // some other touch ended; the tracked one is still down
    const multiTouch = touchTapMultiRef.current;
    const end = readTapSample(endTouch, Date.now(), readScrollTop());
    resetTouchTap();

    // A touchend another handler already preventDefault()ed (e.g. useFillTap's
    // fill-mode tap-to-place, `?next=1`) was a tap on something, not blank space -
    // don't undo what that handler just did by deselecting here.
    if (e.defaultPrevented) return;
    if (selectedTool) return; // an armed tool's own overlay gesture owns this tap
    if (!classifyTouchTap(start, end, { multiTouch })) return;
    if (!isBlankAreaTarget(e.target, BLANK_AREA_EXCLUDED_SELECTOR)) return;

    deactivateAll();
  };

  const handlePagesContainerTouchCancel = () => {
    resetTouchTap();
  };

  return { deactivateAll, onTouchStart: handlePagesContainerTouchStart, onTouchEnd: handlePagesContainerTouchEnd, onTouchCancel: handlePagesContainerTouchCancel };
}
