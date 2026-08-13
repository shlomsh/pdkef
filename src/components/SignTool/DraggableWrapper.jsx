import { useRef, useEffect } from 'preact/hooks';
import { useFloating, offset, shift, autoUpdate } from '@floating-ui/react';
import useDraggableElement from '../../lib/useDraggableElement.js';
import useElementResize from '../../lib/useElementResize.js';
import usePdfCoordinates from '../../lib/usePdfCoordinates.js';
import { getElementDefinition } from '../../editor/registry/index.ts';
import { getEffectiveTextDirection } from '../../lib/sign.js';
import { TOOLBAR_FLOATING_OFFSET, LINE_TOOLBAR_MARGIN_TOP_PX, DEFAULT_COMB_WIDTH_PCT } from '../../constants/signGeometry.js';
import ElementToolbar from '../ElementToolbar.jsx';
import workspaceStyles from './Workspace.module.css';
import elementStyles from './EditorElement.module.css';

import { cloneElement, toChildArray } from 'preact';

export default function DraggableWrapper({
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
  children
}) {
  const elementRef = useRef(null);

  // The element measures and positions itself relative to the page wrapper it lives
  // inside, found via the DOM rather than passed down as a prop. Passing the wrapper
  // node as a render-time prop was the source of a sizing bug: on the first render
  // where a page and its elements appear together (draft restore), the parent's ref
  // to the wrapper hasn't been attached yet, so the element received `undefined` and
  // rendered at the wrong scale until an unrelated re-render happened. Reading it from
  // our own position in the DOM (at layout/event time, when it's always attached)
  // removes that timing dependency entirely.
  const getPageWrapper = () => elementRef.current?.closest(`.${workspaceStyles['page-wrapper']}`) || null;
  const actionsRef = useRef(null);
  const { getElementPercentSize } = usePdfCoordinates();

  // Turning comb on has to start from the box's current rendered width, not a
  // fixed default - otherwise the box visibly jumps the instant the toggle is
  // clicked, for no reason the user asked for. Measured here (not in
  // ElementToolbar) because this is the component that owns elementRef and
  // getPageWrapper; DEFAULT_COMB_WIDTH_PCT only covers the layout measurement
  // failing outright, not the ordinary case.
  const handleToggleComb = (nextComb) => {
    if (!nextComb) {
      onChange({ comb: false, width: 0 });
      return;
    }
    const pageWrapper = getPageWrapper();
    const measured = pageWrapper ? getElementPercentSize(elementRef.current, pageWrapper).width : 0;
    onChange({ comb: true, width: measured || element.width || DEFAULT_COMB_WIDTH_PCT });
  };
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
    onSelect,
    onChange,
  });

  // Resize gesture logic (extracted into useElementResize - shared with Redact, E7.5).
  const { handleResizeStart } = useElementResize({
    element,
    elementRef,
    getPageWrapper,
    pageWidthPoints,
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
  const getFloatingBoundary = (reference) =>
    reference?.closest?.(`.${workspaceStyles['page-wrapper']}`) || 'clippingAncestors';
  const { refs, floatingStyles } = useFloating({
    placement: textDirection === 'rtl' ? 'top-end' : 'top-start',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(TOOLBAR_FLOATING_OFFSET),
      shift(({ elements }) => ({
        boundary: getFloatingBoundary(elements.reference),
        padding: TOOLBAR_FLOATING_OFFSET,
      }))
    ]
  });

  useEffect(() => {
    if (elementRef.current && isDragging.current) {
      elementRef.current.style.transform = `translate(${dragOffset.current.x}px, ${dragOffset.current.y}px)`;
    }
  }, [isActive, element.top, element.type]);

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
  const isRtlText = !!view.usesRtlAnchoring && textDirection === 'rtl';
  const isLine = !!view.isLine;
  const isShape = !!view.isShape;
  const isSymbol = !!view.isSymbol;
  const style = isLine ? {
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
    height: element.height && !view.usesIntrinsicSize ? `${element.height}%` : 'auto',
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
      data-editor-comb={element.comb || undefined}
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
        style={isLine ? {
          position: 'absolute',
          left: `${Math.min(element.x1, element.x2) + Math.abs(element.x1 - element.x2) / 2}%`,
          top: `${Math.min(element.y1, element.y2)}%`,
          transform: 'translate(-50%, -100%)',
          marginTop: `${LINE_TOOLBAR_MARGIN_TOP_PX}px`,
          pointerEvents: 'auto'
        } : { ...floatingStyles }}
      >
        <ElementToolbar
          element={element}
          onChange={onChange}
          onToggleComb={handleToggleComb}
          onClone={onClone}
          onDelete={onDelete}
        />
      </div>

      {/* Render element depending on type */}
      {toChildArray(children).map(child => cloneElement(child, {
        isActive,
        isEditing,
        onBeginEdit,
        onResizeStart: handleResizeStart,
        handlePointerDown
      }))}
    </div>
  );
}
