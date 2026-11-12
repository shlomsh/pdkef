import { useRef, useEffect, useState } from 'preact/hooks';
import useDraggableElement from '#editor-ui/hooks/useDraggableElement.js';
import useElementResize from '#editor-ui/hooks/useElementResize.js';
import { getElementDefinition } from '#editor/registry/index.ts';
import { getEffectiveTextDirection } from '#editor/text/textDirection.js';
import { textElementLayout } from '#editor/text/textLayout.js';
import { LINE_TOOLBAR_MARGIN_TOP_PX, DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE_PT } from '#editor/model/signGeometry.js';
import { topKeepingInkCentre } from '../lib/combPlacement.ts';
import ElementToolbar from './ElementToolbar.tsx';
import elementStyles from '#editor-ui/EditorElement.module.css';
import useCoarsePointer from '#editor-ui/hooks/useCoarsePointer.ts';
import useElementToolbarFloating from '#editor-ui/hooks/useElementToolbarFloating.ts';
import controlStyles from '#editor-ui/EditorControls.module.css';
import { revealFieldAfterKeyboard } from '../hooks/useFieldNavigation.ts';
import { useFill, useTextFill } from './fill/FillContext.tsx';
import { keepFillFocus } from '../lib/fill/fillDom.ts';
import compactBarFor from './compactBar.ts';

import { cloneElement, toChildArray } from 'preact';
import type { ComponentChildren, VNode } from 'preact';
import type { PageGeometry } from '#editor/geometry/coords.ts';
import type { EditorElement, EditorElementPatch } from '#editor/model/editorModel.ts';
import type { NodeResizeStart } from '#editor-ui/nodeProps.ts';
// Type-only import kept separate from the value import below for the same
// non-cycle reasoning as nodeProps.ts's own.
import { englishSignMessages } from '../messages';
import type { SignMessages } from '#editor/registry/messages.ts';

type DraggableChildProps = {
  element?: EditorElement;
  isActive?: boolean;
  isEditing?: boolean;
  onBeginEdit?: () => void;
  onResizeStart?: NodeResizeStart;
  handlePointerDown?: (event: MouseEvent | TouchEvent) => void;
  isSpanResizing?: boolean;
};

export default function DraggableWrapper<T extends EditorElement>({
  element,
  isActive,
  // Forwarded to the node untouched, like onResizeStart: only the text node
  // has an edit session, and the wrapper stays type-agnostic about it.
  isEditing = false,
  onBeginEdit,
  onSelect,
  onChange,
  onDelete,
  onClone,
  pageWidthPoints,
  pageGeometry,
  children,
  messages,
  fieldNav = null,
}: {
  element: T;
  isActive: boolean;
  isEditing?: boolean;
  onBeginEdit: () => void;
  onSelect: (event: Event) => void;
  onChange: (changes: EditorElementPatch<T>) => void;
  onDelete: () => void;
  onClone: (clone: EditorElement) => void;
  pageWidthPoints: number;
  pageGeometry?: PageGeometry;
  children?: ComponentChildren;
  /** LOC-16 stage 2-5: threaded to ElementToolbar. Optional and
   * English-default; Redact (which renders its own boxes, not this wrapper)
   * never supplies it. */
  messages?: Partial<SignMessages>;
  /** MOBI-16: Next/Previous across the document's detected fields, supplied
   * only for the element currently being typed into (PdfWorkspace.tsx passes
   * `null` for every other element, so this never re-renders a wrapper that
   * isn't the one in an edit session). Non-null is also the signal that a
   * touch device may collapse the toolbar down to this control plus a
   * disclosure - see `useCompactEditingBar` below. */
  fieldNav?: {
    hasNext: boolean;
    hasPrevious: boolean;
    onNext: () => void;
    onPrevious: () => void;
    direction: 'ltr' | 'rtl';
  } | null;
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const t: SignMessages = { ...englishSignMessages, ...messages };
  // Font browsing is intentionally local and temporary. Hovering a picker row
  // must repaint the element without writing a draft/update or creating undo
  // history; only the picker's click flows through the real onChange callback.
  const [previewFontFamily, setPreviewFontFamily] = useState<string | null>(null);
  // MOBI-16: on a phone, the full formatting bar for a text box in an edit
  // session wraps to two or three rows (a dozen buttons against a ~340px
  // page cap) and covers the fields just filled - measured on the practice
  // form as ~84px of document. Desktop (a fine pointer) never sees this - the
  // full toolbar renders exactly as before.
  const isCoarsePointer = useCoarsePointer();
  // SNG-15: on a coarse pointer, a focused fill input needs no MOBI-21
  // synchronous-focus dance (docs/sign-fill-mode.md) - a tap there is already
  // native focus, since fill mode's textarea is focusable and writable with
  // no edit session open. That is the only difference fill mode makes here:
  // the element options bar and TextNode's resize handles render exactly as
  // production's do (parity is the product goal), and production's own field
  // navigation (`fieldNav`, `.quick-field-nav`) stays off in fill mode
  // because PdfWorkspace.tsx never supplies it while `fill.enabled`. Both
  // hooks are called unconditionally, every render - `&&` may only combine
  // their results, never decide which one runs. Null/false outside fill
  // mode, so `nativeFocus` is always false there and the one branch below
  // that reads it is a no-op.
  const textFill = useTextFill();
  const fillContext = useFill();
  const nativeFocus = textFill !== null && fillContext.coarse;
  // Starts collapsed on every fresh edit session (a new field reached by
  // Next/Previous mounts its own DraggableWrapper instance with this at its
  // default false; re-entering an edit session on the same box resets it via
  // the effect below), and the "Aa" button is the only way to open it - see
  // the render branch this feeds.
  const [showFormatting, setShowFormatting] = useState(false);
  useEffect(() => {
    if (!isEditing) setShowFormatting(false);
  }, [isEditing]);
  // Whether this element could show the one-row bar at all - typing on a
  // touch device, on the one element actually in the edit session (fieldNav
  // is null for every other DraggableWrapper - see the prop doc above).
  // SNG-17: also eligible in fill mode, which never supplies a fieldNav
  // (docs/sign-fill-mode.md - the keyboard's own Next/Previous covers it
  // there) but still renders text elements inside the same phone-width page
  // wrapper the full bar overflows. See compactBar.ts for the rule itself.
  const compactEditingEligible = compactBarFor({
    isText: element.type === 'text',
    isEditing,
    coarse: isCoarsePointer,
    hasFieldNav: !!fieldNav,
    fillMode: fillContext.enabled,
  });
  // MOBI-16's proposed shape: Previous, Next, Aa replaces the full toolbar by
  // default; tapping Aa reveals today's controls, and the same toggle folds
  // back - see the collapse button beside the full toolbar below. SNG-17:
  // in fill mode there is no fieldNav, so the row is Aa alone.
  const useCompactEditingBar = compactEditingEligible && !showFormatting;
  // SIGN-39: the preview has to land where Done will actually put it, or the
  // text visibly jumps the instant it commits (live report, on a phone). Same
  // one-line rule Done's own commit uses (`topKeepingInkCentre`) - render-only,
  // so a cancelled preview (previewFontFamily back to null) reverts to
  // `element.top` exactly, untouched by anything here.
  const renderedElement = previewFontFamily && element.type === 'text'
    ? {
      ...element,
      fontFamily: previewFontFamily,
      top: topKeepingInkCentre(element.top, {
        fontSize: element.fontSize ?? DEFAULT_FONT_SIZE_PT,
        pageHeightPoints: pageGeometry?.height ?? 0,
        fromFamily: element.fontFamily ?? DEFAULT_FONT_FAMILY,
        toFamily: previewFontFamily,
        text: element.text,
      }),
    }
    : element;

  // The element measures and positions itself relative to the page wrapper it lives
  // inside, found via the DOM rather than passed down as a prop. Passing the wrapper
  // node as a render-time prop was the source of a sizing bug: on the first render
  // where a page and its elements appear together (draft restore), the parent's ref
  // to the wrapper hasn't been attached yet, so the element received `undefined` and
  // rendered at the wrong scale until an unrelated re-render happened. Reading it from
  // our own position in the DOM (at layout/event time, when it's always attached)
  // removes that timing dependency entirely.
  const getPageWrapper = () => elementRef.current?.closest('[data-page-wrapper]') || null;
  const actionsRef = useRef<HTMLDivElement | null>(null);
  // The registry's declarative view flags (E7.6) - DraggableWrapper reads these
  // instead of comparing element.type directly, so adding a new element type
  // never requires editing this shell file.
  const elementDefinition = getElementDefinition(element.type);
  const view = elementDefinition.view || {};
  const textDirection = view.usesRtlAnchoring ? getEffectiveTextDirection(element) : 'ltr';

  // Drag-to-move gesture logic (extracted into useDraggableElement).
  const { handlePointerDown, isDragging, dragOffset } = useDraggableElement({
    element,
    elementRef,
    getPageWrapper,
    pageGeometry,
    onSelect,
    onChange,
    // MOBI-21: on a phone, one tap on a text box selects it *and* opens its
    // edit session, which is how every mobile form behaves (tap a field,
    // type). It is also the only route there on touch: the wrapper
    // `preventDefault()`s the `touchstart` to own the drag, which kills the
    // synthesised click and with it the `dblclick` TextNode listens for, so
    // once a session closed the box was unreachable by finger (the shipped
    // bug). Nothing is lost by opening on the first tap: moving is a drag
    // (movement, so not a tap), and delete/formatting stay one tap away on
    // the element's own bar. Desktop is untouched on both counts - a fine
    // pointer gets no `onTap` at all, and `useDraggableElement` only ever
    // raises one for a touch gesture, so click-selects / double-click-edits
    // exactly as before.
    onTap: isCoarsePointer && element.type === 'text' && !isEditing ? beginEditFromTap : null,
    // SNG-04: fill mode only. `fillContext.enabled` (not `nativeFocus`, which
    // also requires a coarse pointer) is the one flag that means "this is
    // fill mode" - a one-finger swipe over an element not yet selected must
    // scroll the page instead of dragging it (docs/sign-next-gen-guidelines.md
    // §2.2). Outside fill mode this is always false, so nothing here changes
    // production's drag-selects-and-moves-in-one-gesture behaviour.
    touchNeedsSelection: fillContext.enabled,
    isSelected: isActive,
  });

  // MOBI-24: iOS raises the keyboard only for a focus() made while the touch
  // itself is being handled. `onTap` runs inside the `touchend` listener, but
  // opening the session through state alone leaves the focus to TextNode's
  // effect, which Preact runs a frame later - the box turned editable and no
  // keyboard ever came, so on an iPhone the box could still not be typed into
  // (reported in production after MOBI-21 shipped; WebKit under Playwright
  // does not enforce the rule, which is why every e2e passed). So the textarea
  // takes focus here, synchronously, before the state change; TextNode's
  // effect then finds it already focused and leaves it alone. The focus does
  // not scroll (that is what keeps iOS from auto-zooming), so the keyboard it
  // raises can land on top of the box; `revealFieldAfterKeyboard` lifts it
  // back into view once the keyboard is up.
  function beginEditFromTap() {
    // SNG-15: nativeFocus means the textarea is already a real fill input
    // (TextNode.tsx), so a tap there is native focus - MOBI-21's
    // synchronous-focus dance below would be redundant, and calling it a
    // second time on the same element is exactly the double-focus dance
    // fill mode exists to avoid.
    if (nativeFocus) return;
    const input = elementRef.current?.querySelector<HTMLTextAreaElement>('[data-editor-text-input]');
    if (input) {
      input.readOnly = false;
      input.focus({ preventScroll: true });
      const end = input.value.length;
      input.setSelectionRange(end, end);
      revealFieldAfterKeyboard(element.id);
    }
    onBeginEdit();
  }

  // Resize gesture logic (extracted into useElementResize - shared with Redact, E7.5).
  const { handleResizeStart, isSpanResizing } = useElementResize({
    element,
    elementRef,
    getPageWrapper,
    pageWidthPoints,
    pageGeometry,
    onChange,
  });

  const toolbar = useElementToolbarFloating({ rtl: textDirection === 'rtl', coarse: isCoarsePointer });

  useEffect(() => {
    if (elementRef.current && isDragging.current) {
      elementRef.current.style.transform = `translate(${dragOffset.current.x}px, ${dragOffset.current.y}px)`;
    }
  }, [isActive, element.type, element.type === 'line' ? undefined : element.top]);

  // Removed JS measuring effect in favor of CSS grid auto-growing.

  // Styles for responsive placing. `element.left` is always the anchored edge's
  // distance from the page wrapper's left edge — which physical edge that is
  // depends on direction. LTR (and every non-text element) anchors its own left
  // edge there, via CSS `left`, and grows/shrinks rightward. RTL text anchors
  // its *right* edge there instead, via CSS `right`, so it grows leftward as
  // `width` increases with no JS repositioning (see the width-growth effect
  // above). Dragging (handlePointerDown) adds the same pixel delta to
  // `element.left` regardless of direction, which is correct either way since
  // it's just moving whichever edge is anchored.
  // Registry view flags (E7.6) drive className/style/interactivity instead of
  // comparing element.type directly — see the ViewFlags contract in
  // src/editor/registry/types.ts.
  // A text box with a span fixed by the paper - a comb (`width`) or a box on
  // a detected form cell (`minWidth`) - has no growing edge to anchor: it
  // must stay on that field whatever gets typed into it, and flipping to
  // right-anchoring the moment a Hebrew character appears would slide it a
  // whole field-width sideways off the boxes it was sized to. Reading order
  // still follows the text - comb.js mirrors the cell centres for RTL inside
  // the fixed span, and a cell box aligns its text right. textLayout'
  // textAnchorsRightEdge is the one answer to "which edge is `left`".
  const isLine = !!view.isLine;
  const isShape = !!view.isShape;
  const isMark = !!view.isMark;
  const style = element.type === 'line' ? {
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    transform: 'none',
    // An intrinsically sized type (text) takes the one box rule its slot
    // preview shares (textLayout's textElementLayout): a comb's explicit
    // span, a cell's minWidth, the RTL right-edge anchor. Keyed on the view
    // flag, not the type name, so the wrapper stays type-agnostic. The
    // fallback below always anchors left: RTL anchoring lives only in
    // textElementLayout, so a type that sets usesRtlAnchoring must also set
    // usesIntrinsicSize (today only text sets either).
    // SIGN-39: `renderedElement` (not `element`) so a font preview's re-top
    // moves the box itself, not just the text painted inside it - the box's
    // `top` is exactly what the change will commit.
  } : view.usesIntrinsicSize ? textElementLayout(renderedElement).box : {
    top: `${element.top}%`,
    width: element.width ? `${element.width}%` : 'auto',
    height: 'height' in element && element.height ? `${element.height}%` : 'auto',
    left: `${element.left}%`,
  };

  return (
    <div
      ref={(node) => {
        elementRef.current = node;
        if (node) toolbar.setReference(node);
      }}
      className={[elementStyles.element, isActive && elementStyles.active, isMark && elementStyles.mark, isShape && elementStyles.shape, isLine && elementStyles.line].filter(Boolean).join(' ')}
      data-editor-element-id={element.id}
      data-editor-element
      data-editor-active={isActive || undefined}
      data-editor-shape={isShape || undefined}
      data-editor-mark={isMark || undefined} data-editor-highlight={element.type === 'highlight' || undefined}
      // Text's side resize handles are mid-edge (unlike the box types' bottom-
      // corner default), and are always present now - see EditorElement's
      // `[data-editor-text] .resizer.left/.right`.
      data-editor-text={element.type === 'text' || undefined}
      // SNG-04: present only while a fill-mode touch would otherwise be
      // claimed for a drag it shouldn't own yet - an unselected element in
      // fill mode. EditorElement.module.css's `[data-touch-scroll]` rule
      // switches `touch-action` back to allowing one-finger panning; once
      // selected the attribute drops and the ordinary pinch-zoom-only rule
      // (JS owns single-finger drag) applies again.
      data-touch-scroll={(fillContext.enabled && !isActive) || undefined}
      style={style}
      onMouseDown={!isLine ? handlePointerDown : undefined}
      onTouchStart={!isLine ? handlePointerDown : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Element options bar. SNG-15: rendered exactly as production does,
          fill mode or not - parity with production's own chrome is the
          product goal (docs/sign-fill-mode.md). `fieldNav` (and so the
          compact Previous/Next/Aa bar and `.quick-field-nav` below) is
          already off in fill mode: PdfWorkspace.tsx never supplies it while
          `fill.enabled`, so `compactEditingEligible` is false there and this
          renders `ElementToolbar` same as production. */}
      <div
        ref={(node) => {
          actionsRef.current = node;
          if (node) toolbar.setFloating(node);
        }}
        className={elementStyles.actions}
        data-editor-actions
        onMouseDown={fillContext.enabled ? keepFillFocus : undefined}
        style={element.type === 'line' ? {
          position: 'absolute',
          left: `${Math.min(element.x1, element.x2) + Math.abs(element.x1 - element.x2) / 2}%`,
          top: `${Math.min(element.y1, element.y2)}%`,
          // MOBI-17: same counter-scale as the floating case below, anchored
          // at the bottom-center corner the `-50%, -100%` translate already
          // points at. `marginTop` is a literal, unscaled layout offset (like
          // `offset()`'s own contribution was), so it grows under zoom the
          // same way unless it is divided by the live scale too.
          transform: 'translate(-50%, -100%) scale(calc(1 / var(--vv-scale, 1)))',
          transformOrigin: '50% 100%',
          marginTop: `calc(${LINE_TOOLBAR_MARGIN_TOP_PX}px / var(--vv-scale, 1))`,
          pointerEvents: 'auto'
        } : toolbar.style}
      >
        {useCompactEditingBar ? (
          <>
            {fieldNav && (
              <>
                <span className={elementStyles['quick-field-nav']} dir={fieldNav.direction}>
                  <button
                    type="button"
                    className={controlStyles['element-button']}
                    onClick={fieldNav.onPrevious}
                    disabled={!fieldNav.hasPrevious}
                    aria-label={t.previousFieldLabel}
                    title={t.previousFieldLabel}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={controlStyles['element-button']}
                    onClick={fieldNav.onNext}
                    disabled={!fieldNav.hasNext}
                    aria-label={t.nextFieldLabel}
                    title={t.nextFieldLabel}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </span>
                <div className={controlStyles.divider} />
              </>
            )}
            <button
              type="button"
              className={[controlStyles['element-button'], controlStyles['font-trigger']].join(' ')}
              onClick={() => setShowFormatting(true)}
              aria-expanded={false}
              aria-label={t.formattingOptionsTitle}
              title={t.formattingOptionsTitle}
            >
              Aa
            </button>
          </>
        ) : (
          <>
            {compactEditingEligible && (
              <button
                type="button"
                className={controlStyles['element-button']}
                onClick={() => setShowFormatting(false)}
                aria-expanded={true}
                aria-label={t.formattingOptionsTitle}
                title={t.formattingOptionsTitle}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
            )}
            <ElementToolbar
              element={element}
              onChange={onChange}
              onPreviewFont={setPreviewFontFamily}
              onPreviewFontEnd={() => setPreviewFontFamily(null)}
              onClone={onClone}
              onDelete={onDelete}
              messages={messages}
            />
          </>
        )}
      </div>

      {/* Render element depending on type */}
      {toChildArray(children).map((child) => {
        if (typeof child !== 'object' || child === null || !('type' in child)) return child;
        return cloneElement(child as VNode<DraggableChildProps>, {
          element: renderedElement,
          isActive,
          isEditing,
          onBeginEdit,
          onResizeStart: handleResizeStart,
          handlePointerDown,
          isSpanResizing,
        });
      })}
    </div>
  );
}
