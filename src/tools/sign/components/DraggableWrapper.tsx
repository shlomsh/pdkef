import { useRef, useEffect, useState } from 'preact/hooks';
import { useFloating, offset, shift, size, autoUpdate } from '@floating-ui/react';
import useDraggableElement from '../../../editor-ui/hooks/useDraggableElement.js';
import useElementResize from '../../../editor-ui/hooks/useElementResize.js';
import { getElementDefinition } from '../../../editor/registry/index.ts';
import { getEffectiveTextDirection, textAnchorsRightEdge } from '../../../lib/signHelpers.js';
import { TOOLBAR_FLOATING_OFFSET, LINE_TOOLBAR_MARGIN_TOP_PX } from '../../../constants/signGeometry.js';

import ElementToolbar from '../../../editor-ui/ElementToolbar.tsx';
import workspaceStyles from '../../../editor-ui/Workspace.module.css';
import elementStyles from '../../../editor-ui/EditorElement.module.css';
import useCoarsePointer from '../../../editor-ui/hooks/useCoarsePointer.ts';
import controlStyles from '../../../editor-ui/EditorControls.module.css';

import { cloneElement, toChildArray } from 'preact';
import type { ComponentChildren, VNode } from 'preact';
import type { PageGeometry } from '../../../editor/geometry/coords.ts';
import type { EditorElement, EditorElementPatch } from '../../../editor/model/editorModel.ts';
import type { NodeResizeStart } from './nodeProps.ts';
// Type-only import kept separate from the value import below for the same
// non-cycle reasoning as nodeProps.ts's own.
import { englishSignMessages, type SignMessages } from '../../../i18n/toolMessages';

// How far a coarse-pointer `.element-button`'s 44px hit area overhangs the
// button itself: `::before { inset: -8px }` in EditorControls.module.css. Kept
// beside the offset it corrects rather than exported from the stylesheet,
// because a CSS Module cannot export a number; if that inset ever changes,
// this has to change with it.
const COARSE_HIT_OVERHANG_PX = 8;

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
  const compactEditingEligible = element.type === 'text' && isEditing && isCoarsePointer && !!fieldNav;
  // MOBI-16's proposed shape: Previous, Next, Aa replaces the full toolbar by
  // default; tapping Aa reveals today's controls, and the same toggle folds
  // back - see the collapse button beside the full toolbar below.
  const useCompactEditingBar = compactEditingEligible && !showFormatting;
  const renderedElement = previewFontFamily && element.type === 'text'
    ? { ...element, fontFamily: previewFontFamily }
    : element;

  // The element measures and positions itself relative to the page wrapper it lives
  // inside, found via the DOM rather than passed down as a prop. Passing the wrapper
  // node as a render-time prop was the source of a sizing bug: on the first render
  // where a page and its elements appear together (draft restore), the parent's ref
  // to the wrapper hasn't been attached yet, so the element received `undefined` and
  // rendered at the wrong scale until an unrelated re-render happened. Reading it from
  // our own position in the DOM (at layout/event time, when it's always attached)
  // removes that timing dependency entirely.
  const getPageWrapper = () => elementRef.current?.closest(`.${workspaceStyles['page-wrapper']}`) || null;
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
    onTap: isCoarsePointer && element.type === 'text' && !isEditing ? onBeginEdit : null,
  });

  // Resize gesture logic (extracted into useElementResize - shared with Redact, E7.5).
  const { handleResizeStart, isSpanResizing } = useElementResize({
    element,
    elementRef,
    getPageWrapper,
    pageWidthPoints,
    pageGeometry,
    onChange,
  });

  // Keep the toolbar anchored above the selected element. Earlier versions used
  // Floating UI's vertical `flip()`, but a slightly over-eager overflow reading
  // could move the toolbar to `bottom-*`, visually jumping it under the text.
  // We still delegate measurement to Floating UI and still use `shift()` so the
  // toolbar is constrained to the PDF page horizontally, but vertical placement
  // stays stable. This preserves the editor's old mental model: select an
  // element, toolbar appears above it; LTR hugs the left edge, RTL hugs the
  // right edge.
  //
  // Horizontal alignment is driven by Floating UI's `placement` ('top-end'
  // for RTL text, 'top-start' otherwise), not by page-clamp math in this
  // component. That preserves the fundamental anchor: LTR toolbars begin at
  // the element's left edge, RTL toolbars end at its right edge.
  //
  // `shift()` can only slide the toolbar inside the page, never shrink it. A
  // text toolbar's dozen controls are wider than a phone-width page, and since
  // nothing up to <html> clips overflow-x (`.tool-card` must not, for its
  // sticky action row), the spill past the page edge became real document
  // horizontal scroll: the whole app could be dragged sideways on a phone,
  // even before anything was selected, because the bar is always rendered
  // (only its opacity follows selection). `size()` runs after `shift()` so it
  // measures the room from the shifted position, and caps the bar's width to
  // it; `.actions` wraps onto a second row (`flex-wrap`) rather than spilling.
  const getFloatingBoundary = (reference: Element | null) =>
    reference?.closest?.(`.${workspaceStyles['page-wrapper']}`) || 'clippingAncestors';
  const floatingBoundary = ({ elements }: { elements: { reference: unknown } }) =>
    getFloatingBoundary(elements.reference instanceof Element ? elements.reference : null);
  const { refs, floatingStyles } = useFloating({
    placement: textDirection === 'rtl' ? 'top-end' : 'top-start',
    whileElementsMounted: autoUpdate,
    middleware: [
      // On a coarse pointer every `.element-button` carries a 44px hit area from
      // `::before { inset: -8px }` (EditorControls.module.css), so the bar's
      // targets overhang its own bottom edge by 8px. At the plain 8px offset
      // that overhang landed exactly on the element: on a short box (5.8px on
      // the health-declaration form) a tap aimed at the text hit Duplicate
      // instead, and each tap silently cloned the element into the document
      // and the export - measured 1 -> 2 -> 3 -> 4 across three taps, no tool
      // armed (MOBI-21). Adding the overhang to the offset puts the bottom of
      // the bar's hit boxes at the element's top edge, touching and not
      // covering. Desktop keeps 8px: a fine pointer has no halo to clear.
      offset(isCoarsePointer ? TOOLBAR_FLOATING_OFFSET + COARSE_HIT_OVERHANG_PX : TOOLBAR_FLOATING_OFFSET),
      shift((state) => ({
        boundary: floatingBoundary(state),
        padding: TOOLBAR_FLOATING_OFFSET,
      })),
      size((state) => ({
        boundary: floatingBoundary(state),
        padding: TOOLBAR_FLOATING_OFFSET,
        apply({ availableWidth, elements }) {
          elements.floating.style.maxWidth = `${Math.max(0, availableWidth)}px`;
        },
      })),
    ]
  });

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
  // the fixed span, and a cell box aligns its text right. signHelpers'
  // textAnchorsRightEdge is the one answer to "which edge is `left`".
  const isRtlText = !!view.usesRtlAnchoring && textAnchorsRightEdge(element);
  const isLine = !!view.isLine;
  const isShape = !!view.isShape;
  const isSymbol = !!view.isSymbol;
  const style = element.type === 'line' ? {
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    transform: 'none',
  } : {
    top: `${element.top}%`,
    // An intrinsically sized type can still opt individual elements into an
    // explicit width (comb text): the span is the whole point there, and the
    // height stays intrinsic either way.
    width: element.width && (!view.usesIntrinsicSize || view.allowsExplicitWidth) ? `${element.width}%` : 'auto',
    // A box on a detected form cell is at least the cell's span wide and
    // still intrinsically sized past it (editorModel.ts, `minWidth`).
    ...('minWidth' in element && element.minWidth ? { minWidth: `${element.minWidth}%` } : {}),
    height: 'height' in element && element.height && !view.usesIntrinsicSize ? `${element.height}%` : 'auto',
    ...(isRtlText
      ? { right: `${100 - element.left}%` }
      : { left: `${element.left}%` }),
  };

  return (
    <div
      ref={(node) => {
        elementRef.current = node;
        if (node && refs.reference !== node) {
          refs.setReference(node);
        }
      }}
      className={[elementStyles.element, isActive && elementStyles.active, isSymbol && elementStyles.symbol, isShape && elementStyles.shape, isLine && elementStyles.line].filter(Boolean).join(' ')}
      data-editor-element-id={element.id}
      data-editor-element
      data-editor-active={isActive || undefined}
      data-editor-shape={isShape || undefined}
      // Text's side resize handles are mid-edge (unlike the box types' bottom-
      // corner default), and are always present now - see EditorElement's
      // `[data-editor-text] .resizer.left/.right`.
      data-editor-text={element.type === 'text' || undefined}
      style={style}
      onMouseDown={!isLine ? handlePointerDown : undefined}
      onTouchStart={!isLine ? handlePointerDown : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Element options bar */}
      <div
        ref={(node) => {
          actionsRef.current = node;
          if (node && refs.floating !== node) {
            refs.setFloating(node);
          }
        }}
        className={elementStyles.actions}
        data-editor-actions
        style={element.type === 'line' ? {
          position: 'absolute',
          left: `${Math.min(element.x1, element.x2) + Math.abs(element.x1 - element.x2) / 2}%`,
          top: `${Math.min(element.y1, element.y2)}%`,
          transform: 'translate(-50%, -100%)',
          marginTop: `${LINE_TOOLBAR_MARGIN_TOP_PX}px`,
          pointerEvents: 'auto'
        } : { ...floatingStyles }}
      >
        {useCompactEditingBar ? (
          <>
            <span className={elementStyles['quick-field-nav']} dir={fieldNav!.direction}>
              <button
                type="button"
                className={controlStyles['element-button']}
                onClick={fieldNav!.onPrevious}
                disabled={!fieldNav!.hasPrevious}
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
                onClick={fieldNav!.onNext}
                disabled={!fieldNav!.hasNext}
                aria-label={t.nextFieldLabel}
                title={t.nextFieldLabel}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </span>
            <div className={controlStyles.divider} />
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
          isSpanResizing
        });
      })}
    </div>
  );
}
