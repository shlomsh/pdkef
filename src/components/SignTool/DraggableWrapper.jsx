import { useRef, useEffect } from 'preact/hooks';
import { useFloating, offset, shift, autoUpdate } from '@floating-ui/react';
import usePdfCoordinates from '../../lib/usePdfCoordinates.js';
import useDraggableElement from '../../lib/useDraggableElement.js';
import { startGesture } from '../../editor/gestures/controller.ts';
import { getElementDefinition } from '../../editor/registry/index.ts';
import { getEffectiveTextDirection } from '../../lib/sign.js';
import {
  TOOLBAR_FLOATING_OFFSET,
  DEFAULT_START_WIDTH_PCT,
  DEFAULT_FONT_SIZE_PT,
  ASPECT_RATIO_SYMBOL,
  ASPECT_RATIO_TEXT,
  LINE_TOOLBAR_MARGIN_TOP_PX
} from '../../constants/signGeometry.js';
import ElementToolbar from '../ElementToolbar.jsx';

import { cloneElement, toChildArray } from 'preact';

export default function DraggableWrapper({
  element,
  isActive,
  onSelect,
  onChange,
  onDelete,
  onClone,
  pageWidthPoints,
  children
}) {
  const elementRef = useRef(null);
  const {
    getPointerCoords,
    getDeltaPercent,
    getElementPercentSize,
    getWidthPercentToHeightPercent,
    getScaleFactor,
    getWidthPercent,
    getDimensions,
    pxToPoints
  } = usePdfCoordinates();

  // The element measures and positions itself relative to the page wrapper it lives
  // inside, found via the DOM rather than passed down as a prop. Passing the wrapper
  // node as a render-time prop was the source of a sizing bug: on the first render
  // where a page and its elements appear together (draft restore), the parent's ref
  // to the wrapper hasn't been attached yet, so the element received `undefined` and
  // rendered at the wrong scale until an unrelated re-render happened. Reading it from
  // our own position in the DOM (at layout/event time, when it's always attached)
  // removes that timing dependency entirely.
  const getPageWrapper = () => elementRef.current?.closest('.sign-page-wrapper') || null;
  const actionsRef = useRef(null);
  const textDirection = element.type === 'text' ? getEffectiveTextDirection(element) : 'ltr';

  // Drag-to-move gesture logic (extracted into useDraggableElement).
  const { handlePointerDown, isDragging, dragOffset } = useDraggableElement({
    element,
    elementRef,
    getPageWrapper,
    onSelect,
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
    reference?.closest?.('.sign-page-wrapper') || 'clippingAncestors';
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

  
  

  const handleResizeStart = (e, handle = 'right') => {
    e.stopPropagation();
    e.preventDefault();

    const pageWrapper = getPageWrapper();
    if (!pageWrapper) return;

    const { x: clientX, y: clientY } = getPointerCoords(e);
    const dragStartX = clientX;
    const dragStartY = clientY;
    const startWidth = element.width || DEFAULT_START_WIDTH_PCT;
    const startFontSize = element.fontSize || DEFAULT_FONT_SIZE_PT;
    const startLeft = element.left;
    const startTop = element.top;
    const startX1 = element.x1;
    const startY1 = element.y1;
    const startX2 = element.x2;
    const startY2 = element.y2;
    const defaultRatio = element.type === 'symbol' ? ASPECT_RATIO_SYMBOL : ASPECT_RATIO_TEXT;
    const ratioAtStart = element.aspectRatio || defaultRatio;
    const startHeight = element.height || getWidthPercentToHeightPercent(startWidth, ratioAtStart, pageWrapper);

    const textStartRect = element.type === 'text' && elementRef.current ? getDimensions(elementRef.current) : null;
    const textStartSizePercent = element.type === 'text' && elementRef.current
      ? getElementPercentSize(elementRef.current, pageWrapper)
      : null;
    let pendingResize = null;

    const paintResizePatch = (patch) => {
      pendingResize = patch;
      if (!elementRef.current) return;

      if (element.type === 'line') {
        elementRef.current.querySelectorAll('line').forEach((line) => {
          if (patch.x1 !== undefined) line.setAttribute('x1', `${patch.x1}%`);
          if (patch.y1 !== undefined) line.setAttribute('y1', `${patch.y1}%`);
          if (patch.x2 !== undefined) line.setAttribute('x2', `${patch.x2}%`);
          if (patch.y2 !== undefined) line.setAttribute('y2', `${patch.y2}%`);
        });
        return;
      }

      if (element.type === 'text') {
        elementRef.current
          .querySelectorAll('.sign-text-display, .sign-text-input, .sign-text-measure')
          .forEach((node) => { node.style.fontSize = `${patch.fontSize * getScaleFactor(pageWrapper, pageWidthPoints)}px`; });

        if (textStartSizePercent) {
          const newSize = getElementPercentSize(elementRef.current, pageWrapper);
          const isRtl = getEffectiveTextDirection(element) === 'rtl';
          const { left: newLeft, top: newTop } = getElementDefinition('text').resizeBehavior.applyTextPosition({
            start: { left: startLeft, top: startTop },
            startSize: textStartSizePercent,
            nextSize: newSize,
            isLeftHandle: ['left', 'top-left', 'bottom-left'].includes(handle),
            isTopHandle: ['top', 'top-left', 'top-right'].includes(handle),
            isRtl,
          });
          pendingResize = { ...patch, left: newLeft, top: newTop };
          elementRef.current.style.top = `${newTop}%`;
          if (isRtl) elementRef.current.style.right = `${100 - newLeft}%`;
          else elementRef.current.style.left = `${newLeft}%`;
        }
        return;
      }

      if (patch.width !== undefined) elementRef.current.style.width = `${patch.width}%`;
      if (patch.height !== undefined) elementRef.current.style.height = `${patch.height}%`;
      if (patch.left !== undefined) elementRef.current.style.left = `${patch.left}%`;
      if (patch.top !== undefined) elementRef.current.style.top = `${patch.top}%`;
    };

    const handleResizeMove = (moveEvent) => {
      if (moveEvent.touches && moveEvent.cancelable) moveEvent.preventDefault();
      const { x: moveX, y: moveY } = getPointerCoords(moveEvent);
      const rawDx = moveX - dragStartX;
      const dy = moveY - dragStartY;
      
      const isLeft = ['left', 'top-left', 'bottom-left'].includes(handle);
      const isTop = ['top', 'top-left', 'top-right'].includes(handle);
      const normalizedDx = isLeft ? -rawDx : rawDx;
      const normalizedDy = isTop ? -dy : dy;
      
      const definition = getElementDefinition(element.type);
      if (definition.resizeBehavior.applyLineResize) {
        const { x: dxPercent, y: dyPercent } = getDeltaPercent(rawDx, dy, pageWrapper);
        return definition.resizeBehavior.applyLineResize({
          handle,
          delta: { x: dxPercent, y: dyPercent },
          start: { x1: startX1, y1: startY1, x2: startX2, y2: startY2 },
        });
      }

      // element.type is the geometry discriminator directly (the old shape/shapeType
      // wrapper is gone). Aliased for readability where several checks read it.
      const actualType = element.type;

      const boxDefinition = getElementDefinition(actualType);
      if (boxDefinition.resizeBehavior.applyBoxResize) {
        const { x: dxPercent, y: dyPercent } = getDeltaPercent(rawDx, dy, pageWrapper);
        return boxDefinition.resizeBehavior.applyBoxResize({
          handle,
          delta: { x: dxPercent, y: dyPercent },
          start: { width: startWidth, height: startHeight, left: startLeft, top: startTop },
        });
      }

      const textDefinition = getElementDefinition(element.type);
      if (textDefinition.resizeBehavior.applyTextResize) {
        return textDefinition.resizeBehavior.applyTextResize({
          startFontSize,
          delta: { x: normalizedDx, y: normalizedDy },
          startRect: textStartRect,
          fallbackDeltaPoints: pxToPoints(normalizedDx, getScaleFactor(pageWrapper, pageWidthPoints)),
        });
      }

      const centeredDefinition = getElementDefinition(element.type);
      if (centeredDefinition.resizeBehavior.applyCenteredResize) {
        const { x: deltaWidth } = getDeltaPercent(normalizedDx, 0, pageWrapper);
        const widthPolicy = centeredDefinition.resizeBehavior.minimumWidth;
        const minWidth = widthPolicy.unit === 'pixels'
          ? getWidthPercent(widthPolicy.value, pageWrapper)
          : widthPolicy.value;
        const rect = pageWrapper.getBoundingClientRect();
        return centeredDefinition.resizeBehavior.applyCenteredResize({
          deltaWidth,
          minWidth,
          aspectRatio: element.aspectRatio || defaultRatio,
          page: { width: rect.width, height: rect.height },
          start: { width: startWidth, height: startHeight, left: startLeft, top: startTop },
        });
      }

      return null;
    };

    startGesture({
      computePatch: handleResizeMove,
      writeDOM: paintResizePatch,
      commit: () => {
      if (pendingResize) {
        onChange(pendingResize);
        pendingResize = null;
      }
      },
    });
  };

  

  // Styles for responsive placing. `element.left` is always the anchored edge's
  // distance from the page wrapper's left edge — which physical edge that is
  // depends on direction. LTR (and every non-text element) anchors its own left
  // edge there, via CSS `left`, and grows/shrinks rightward. RTL text anchors
  // its *right* edge there instead, via CSS `right`, so it grows leftward as
  // `width` increases with no JS repositioning (see the width-growth effect
  // above). Dragging (handlePointerDown) adds the same pixel delta to
  // `element.left` regardless of direction, which is correct either way since
  // it's just moving whichever edge is anchored.
  // element.type is the geometry discriminator directly (no shape/shapeType wrapper).
  const actualType = element.type;
  const isRtlText = element.type === 'text' && textDirection === 'rtl';
  const isLine = actualType === 'line';
  const isWhiteout = actualType === 'whiteout';
  // isShape controls 4-handle resizing and box-style CSS — includes whiteout
  const isShape = actualType === 'ellipse' || actualType === 'rectangle' || isWhiteout;
  const style = isLine ? {
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    transform: 'none',
  } : {
    top: `${element.top}%`,
    width: element.width && element.type !== 'text' ? `${element.width}%` : 'auto',
    height: element.height && element.type !== 'text' ? `${element.height}%` : 'auto',
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
      className={`sign-element${isActive ? ' active' : ''}${element.type === 'symbol' ? ' sign-element--symbol' : ''}${isShape ? ' sign-element--shape' : ''}${isLine ? ' sign-element--line' : ''}`}
      data-editor-element-id={element.id}
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
        className="sign-element-actions"
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
          onClone={onClone}
          onDelete={onDelete}
        />
      </div>

      {/* Render element depending on type */}
      {toChildArray(children).map(child => cloneElement(child, {
        isActive,
        onResizeStart: handleResizeStart,
        handlePointerDown
      }))}
    </div>
  );
}
