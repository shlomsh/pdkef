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
  TEXT_RESIZE_SCALE_FACTOR,
  MIN_FONT_SIZE_PT,
  MAX_FONT_SIZE_PT,
  MIN_SYMBOL_WIDTH_PX,
  MIN_STANDARD_WIDTH_PCT,
  MAX_SYMBOL_SIGNATURE_WIDTH_PCT,
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

    const setTextResizeFontSize = (fontSize) => {
      if (!elementRef.current) return;
      elementRef.current
        .querySelectorAll('.sign-text-display, .sign-text-input, .sign-text-measure')
        .forEach((node) => {
          node.style.fontSize = fontSize ? `${fontSize}px` : '';
        });
    };

    const handleResizeMove = (moveEvent) => {
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
        pendingResize = definition.resizeBehavior.applyLineResize({
          handle,
          delta: { x: dxPercent, y: dyPercent },
          start: { x1: startX1, y1: startY1, x2: startX2, y2: startY2 },
        });
        const lines = elementRef.current?.querySelectorAll('line');
        if (lines) {
          lines.forEach(l => {
            if (pendingResize.x1 !== undefined) l.setAttribute('x1', `${pendingResize.x1}%`);
            if (pendingResize.y1 !== undefined) l.setAttribute('y1', `${pendingResize.y1}%`);
            if (pendingResize.x2 !== undefined) l.setAttribute('x2', `${pendingResize.x2}%`);
            if (pendingResize.y2 !== undefined) l.setAttribute('y2', `${pendingResize.y2}%`);
          });
        }
        return pendingResize;
      }

      // element.type is the geometry discriminator directly (the old shape/shapeType
      // wrapper is gone). Aliased for readability where several checks read it.
      const actualType = element.type;

      const boxDefinition = getElementDefinition(actualType);
      if (boxDefinition.resizeBehavior.applyBoxResize) {
        const { x: dxPercent, y: dyPercent } = getDeltaPercent(rawDx, dy, pageWrapper);
        pendingResize = boxDefinition.resizeBehavior.applyBoxResize({
          handle,
          delta: { x: dxPercent, y: dyPercent },
          start: { width: startWidth, height: startHeight, left: startLeft, top: startTop },
        });
        if (elementRef.current) {
          elementRef.current.style.width = `${pendingResize.width}%`;
          elementRef.current.style.height = `${pendingResize.height}%`;
          elementRef.current.style.left = `${pendingResize.left}%`;
          elementRef.current.style.top = `${pendingResize.top}%`;
        }
        return pendingResize;
      }

      if (element.type === 'text') {
        let newFontSize = startFontSize;
        if (textStartRect && textStartRect.width > 0 && textStartRect.height > 0) {
          const startW = textStartRect.width;
          const startH = textStartRect.height;
          // Scale font size proportionally to the mouse drag projected along the box's diagonal.
          // This keeps the resizer handle exactly under the mouse, preventing the hypersensitivity
          // caused by raw pixel->point mapping.
          const scale = 1 + (normalizedDx * startW + normalizedDy * startH) / (startW * startW + startH * startH);
          newFontSize = Math.round(startFontSize * scale);
        } else {
          const scale = getScaleFactor(pageWrapper, pageWidthPoints);
          const deltaFontSize = pxToPoints(normalizedDx, scale) * TEXT_RESIZE_SCALE_FACTOR;
          newFontSize = Math.round(startFontSize + deltaFontSize);
        }
        pendingResize = { fontSize: Math.max(MIN_FONT_SIZE_PT, Math.min(MAX_FONT_SIZE_PT, newFontSize)) };
        setTextResizeFontSize(pendingResize.fontSize * getScaleFactor(pageWrapper, pageWidthPoints));

        if (elementRef.current && textStartSizePercent) {
          const newSize = getElementPercentSize(elementRef.current, pageWrapper);
          const isRtl = getEffectiveTextDirection(element) === 'rtl';
          let newLeft = startLeft;
          let newTop = startTop;

          if (newSize.width > 0 && textStartSizePercent.width > 0) {
            if (isLeft && !isRtl) {
              newLeft = startLeft + textStartSizePercent.width - newSize.width;
            } else if (!isLeft && isRtl) {
              newLeft = startLeft - textStartSizePercent.width + newSize.width;
            }
          }

          if (newSize.height > 0 && textStartSizePercent.height > 0 && isTop) {
            newTop = startTop + textStartSizePercent.height - newSize.height;
          }

          pendingResize = { ...pendingResize, left: newLeft, top: newTop };
          elementRef.current.style.top = `${newTop}%`;
          if (isRtl) {
            elementRef.current.style.right = `${100 - newLeft}%`;
          } else {
            elementRef.current.style.left = `${newLeft}%`;
          }
        }
        return pendingResize;
      }

      const { x: deltaWidthPercent } = getDeltaPercent(normalizedDx, 0, pageWrapper);

      // Symbols use an absolute pixel floor (not a fixed %) so the box never
      // shrinks past what its border/padding chrome needs to render the icon —
      // a flat % floor collapses to a couple of screen pixels on a large page,
      // leaving no content area for the SVG and making it vanish, not shrink.
      const minWidth = element.type === 'symbol'
        ? getWidthPercent(MIN_SYMBOL_WIDTH_PX, pageWrapper)
        : MIN_STANDARD_WIDTH_PCT;
      let newWidth = startWidth + deltaWidthPercent;
      newWidth = Math.max(minWidth, Math.min(MAX_SYMBOL_SIGNATURE_WIDTH_PCT, newWidth)); // constraints (min% to max%)

      const ratio = element.aspectRatio || defaultRatio;
      // Convert width percent to correct height percent using responsive page dimensions
      const newHeight = getWidthPercentToHeightPercent(newWidth, ratio, pageWrapper);

      // Symbols and signatures grow/shrink around the box's center instead of its
      // top-left corner. (Lines never reach here — they only render line-start /
      // line-end handles, both handled by the early returns at the top of this fn.)
      if (element.type === 'symbol' || element.type === 'signature') {
        let newLeft = startLeft + (startWidth - newWidth) / 2;
        let newTop = startTop + (startHeight - newHeight) / 2;
        newLeft = Math.max(0, Math.min(100 - newWidth, newLeft));
        newTop = Math.max(0, Math.min(100 - newHeight, newTop));
        pendingResize = { width: newWidth, height: newHeight, left: newLeft, top: newTop };
        if (elementRef.current) {
          elementRef.current.style.width = `${newWidth}%`;
          elementRef.current.style.height = `${newHeight}%`;
          elementRef.current.style.left = `${newLeft}%`;
          elementRef.current.style.top = `${newTop}%`;
        }
        return pendingResize;
      }

      pendingResize = { width: newWidth, height: newHeight };
      if (elementRef.current) {
        elementRef.current.style.width = `${newWidth}%`;
        elementRef.current.style.height = `${newHeight}%`;
      }
      return pendingResize;
    };

    startGesture({
      computePatch: handleResizeMove,
      // The established resize math owns its CSSOM writes for this step; E4.3
      // moves that per-type DOM projection beside each registry module.
      writeDOM: () => {},
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
