import { useState, useRef, useEffect, useLayoutEffect } from 'preact/hooks';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/react';
import { PilcrowLeft, PilcrowRight } from 'lucide-preact';
import { tintImageDataUrl, getEffectiveTextDirection } from '../lib/sign.js';
import {
  pxToPercent,
  pxDeltaToPercent,
  pxToPoints,
  scaleFactorFromPx,
  widthPercentToHeightPercent
} from '../lib/coords.js';
import ColorPickerMenu from './ColorPickerMenu.jsx';
import FontPickerMenu from './FontPickerMenu.jsx';
import ThicknessPickerMenu from './ThicknessPickerMenu.jsx';
import ElementToolbar from './ElementToolbar.jsx';
import ElementResizers from './ElementResizers.jsx';
import TextElement from './TextElement.jsx';
import SymbolElement from './SymbolElement.jsx';
import ShapeElement from './ShapeElement.jsx';
import LineElement from './LineElement.jsx';
import SignatureElement from './SignatureElement.jsx';
import WhiteoutElement from './WhiteoutElement.jsx';

export default function DraggableOverlayElement({
  element,
  isActive,
  onSelect,
  onChange,
  onDelete,
  onClone,
  pageWidthPoints
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
  const getPageWrapper = () => elementRef.current?.closest('.sign-page-wrapper') || null;
  const dragStartPos = useRef({ x: 0, y: 0, left: 0, top: 0 });
  // Live drag state: `isDragging` gates the transform-follow effect, `dragOffset`
  // holds the current pixel delta so mouseup can commit it to percent-based state.
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [scaleFactor, setScaleFactor] = useState(1);
  const [tintedSigUrl, setTintedSigUrl] = useState(null);
  const actionsRef = useRef(null);

  // Keep the floating toolbar on-screen vertically: its default position
  // (above, flush with the top of the element) clips off the top edge for
  // elements placed near the top of the page. Positioning is delegated to
  // Floating UI (@floating-ui/dom) rather than hand-rolled — it derives the
  // toolbar's placement purely from the anchor's (elementRef) rect plus the
  // toolbar's own size, never from the toolbar's own already-positioned
  // rect, so it can't create the feedback loop a naive "measure my own
  // rect, then flip" approach does (flip down → rect moves on-screen → flip
  // back up → off-screen again → ... — the toolbar "freaking out" near the
  // top edge). `flip()` swaps to below the element when there's no room
  // above.
  //
  // Only `top` is applied from the computed result — horizontal alignment
  // (which edge of the element the toolbar hugs) is pure CSS, via the
  // `sign-element-actions--rtl` class below, not JS. The toolbar is a DOM
  // child of the element it's anchored to, so CSS `left`/`right` already
  // track the element's edge on every reflow for free. This matters for RTL
  // text boxes, which grow leftward from a fixed right edge and shift
  // `element.left` on every keystroke (see the width-growth effect below):
  // if horizontal position were also JS-computed, it would depend on
  // `element.left` and re-run computePosition() every keystroke, and the
  // one-frame lag between the box's synchronous DOM move and the toolbar's
  // async Promise-resolved catch-up is what caused the toolbar to visibly
  // flicker while typing RTL text. Vertical position never depends on
  // `element.left`, so it doesn't have this problem.
  const textDirection = element.type === 'text' ? getEffectiveTextDirection(element) : 'ltr';

  const { refs, floatingStyles } = useFloating({
    placement: textDirection === 'rtl' ? 'top-end' : 'top-start',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ fallbackPlacements: ['bottom'] }),
      shift({ padding: 8 })
    ]
  });

  useEffect(() => {
    if (elementRef.current && isDragging.current) {
      elementRef.current.style.transform = `translate(${dragOffset.current.x}px, ${dragOffset.current.y}px)`;
    }
  }, [isActive, element.top, element.type]);

  // Removed JS measuring effect in favor of CSS grid auto-growing.

  // Recolor the signature preview to match the chosen ink color
  useEffect(() => {
    if (element.type !== 'signature' || !element.dataUrl) return;
    if (!element.color || element.color === '#000000') {
      setTintedSigUrl(null);
      return;
    }
    let cancelled = false;
    tintImageDataUrl(element.dataUrl, element.color).then((tinted) => {
      if (!cancelled) setTintedSigUrl(tinted);
    });
    return () => { cancelled = true; };
  }, [element.type, element.dataUrl, element.color]);

  // Responsive scaling: convert the page's intrinsic PDF-point width to its rendered
  // on-screen width, so text (sized in points) matches the rasterized page.
  //
  // useLayoutEffect (not useEffect) so the measured scale is applied before the browser
  // paints — the element never flashes at the wrong (default 1x) size. A ResizeObserver
  // on the page wrapper keeps it correct as the layout reflows (window resize, sidebar
  // toggles, fullscreen), which a one-shot window 'resize' listener would miss.
  useLayoutEffect(() => {
    const pageWrapper = getPageWrapper();
    if (!pageWrapper) return;

    const updateScale = () => {
      setScaleFactor(scaleFactorFromPx(pageWrapper.getBoundingClientRect().width, pageWidthPoints));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(pageWrapper);
    return () => observer.disconnect();
  }, [pageWidthPoints]);

  // Mouse/Touch Drag Handlers
  const handlePointerDown = (e) => {
    if (e.target.closest('.sign-element-actions') || e.target.closest('.sign-element-resizer')) {
      return;
    }

    onSelect(e);

    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    e.preventDefault();

    // Captured once for the gesture — the page wrapper can't change while dragging.
    const pageWrapper = getPageWrapper();
    if (!pageWrapper) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    dragStartPos.current = {
      x: clientX,
      y: clientY,
      left: element.left,
      top: element.top
    };

    // Text boxes are CSS auto-sized (no stored `element.width`), so the only
    // accurate width comes from measuring the actual rendered box — captured
    // once here, since it can't change over the course of a drag. (Read-only,
    // gesture-time measurement, same pattern as `textStartRect` in the resize
    // handler below — not a render effect, so it can't reintroduce the
    // measure-then-mutate-position drift bug.)
    const parentRectAtStart = pageWrapper.getBoundingClientRect();
    const textWidthPercentAtStart = element.type === 'text' && elementRef.current
      ? pxToPercent(elementRef.current.getBoundingClientRect().width, parentRectAtStart.width)
      : null;

    isDragging.current = true;

    const handlePointerMove = (moveEvent) => {
      const moveX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const moveY = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY;

      const dx = moveX - dragStartPos.current.x;
      const dy = moveY - dragStartPos.current.y;
      dragOffset.current = { x: dx, y: dy };
      if (elementRef.current) {
        elementRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
      }
    };

    const handlePointerUp = () => {
      isDragging.current = false;
      if (elementRef.current) elementRef.current.style.transform = 'none';

      const pageWrapper = getPageWrapper();
      const parentRect = pageWrapper.getBoundingClientRect();
      const dxPercent = pxDeltaToPercent(dragOffset.current.x, parentRect.width);
      const dyPercent = pxDeltaToPercent(dragOffset.current.y, parentRect.height);
      
      if (element.type === 'line') {
        onChange({
          x1: Math.max(0, Math.min(100, element.x1 + dxPercent)),
          y1: Math.max(0, Math.min(100, element.y1 + dyPercent)),
          x2: Math.max(0, Math.min(100, element.x2 + dxPercent)),
          y2: Math.max(0, Math.min(100, element.y2 + dyPercent))
        });
      } else {
        let newLeft = dragStartPos.current.left + dxPercent;
        let newTop = dragStartPos.current.top + dyPercent;
        
        const widthPercent = element.type === 'text' ? (textWidthPercentAtStart ?? 4) : (element.width || 4);
        if (element.type === 'text' && getEffectiveTextDirection(element) === 'rtl') {
          newLeft = Math.max(widthPercent, Math.min(100, newLeft));
        } else {
          newLeft = Math.max(0, Math.min(100 - widthPercent, newLeft));
        }
        newTop = Math.max(0, Math.min(100 - (element.height || 2), newTop));
        onChange({ left: newLeft, top: newTop });
      }

      dragOffset.current = { x: 0, y: 0 };
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
  };

  // Resize handler for signature/symbol elements (width/height) and text elements (font size)
  const handleResizeStart = (e, handle = 'right') => {
    e.stopPropagation();
    e.preventDefault();

    const pageWrapper = getPageWrapper();
    if (!pageWrapper) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dragStartX = clientX;
    const dragStartY = clientY;
    const startWidth = element.width || 20;
    const startFontSize = element.fontSize || 12;
    const startLeft = element.left;
    const startTop = element.top;
    const startX1 = element.x1;
    const startY1 = element.y1;
    const startX2 = element.x2;
    const startY2 = element.y2;
    const startParentRect = pageWrapper.getBoundingClientRect();
    const defaultRatio = element.type === 'symbol' ? 1 : 0.4;
    const ratioAtStart = element.aspectRatio || defaultRatio;
    const startHeight = element.height || widthPercentToHeightPercent(startWidth, ratioAtStart, startParentRect.width, startParentRect.height);

    const textStartRect = element.type === 'text' && elementRef.current ? elementRef.current.getBoundingClientRect() : null;

    const handleResizeMove = (moveEvent) => {
      const moveX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const moveY = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY;
      const rawDx = moveX - dragStartX;
      const dy = moveY - dragStartY;
      const dx = handle === 'left' ? -rawDx : rawDx;
      
      if (handle === 'line-start') {
        const parentRect = pageWrapper.getBoundingClientRect();
        onChange({
          x1: startX1 + pxDeltaToPercent(rawDx, parentRect.width),
          y1: startY1 + pxDeltaToPercent(dy, parentRect.height)
        });
        return;
      }
      if (handle === 'line-end') {
        const parentRect = pageWrapper.getBoundingClientRect();
        onChange({
          x2: startX2 + pxDeltaToPercent(rawDx, parentRect.width),
          y2: startY2 + pxDeltaToPercent(dy, parentRect.height)
        });
        return;
      }

      // element.type is the geometry discriminator directly (the old shape/shapeType
      // wrapper is gone). Aliased for readability where several checks read it.
      const actualType = element.type;

      if (element.type === 'whiteout' || actualType === 'ellipse' || actualType === 'rectangle') {
        const parentRect = pageWrapper.getBoundingClientRect();
        let newWidth = startWidth;
        let newHeight = startHeight;
        let newLeft = startLeft;
        let newTop = startTop;

        if (handle === 'right') {
          newWidth = Math.max(1, Math.min(90, startWidth + pxDeltaToPercent(rawDx, parentRect.width)));
        } else if (handle === 'left') {
          newWidth = Math.max(1, Math.min(90, startWidth - pxDeltaToPercent(rawDx, parentRect.width)));
          newLeft = startLeft - (newWidth - startWidth);
        } else if (handle === 'bottom') {
          newHeight = Math.max(1, Math.min(90, startHeight + pxDeltaToPercent(dy, parentRect.height)));
        } else if (handle === 'top') {
          newHeight = Math.max(1, Math.min(90, startHeight - pxDeltaToPercent(dy, parentRect.height)));
          newTop = startTop - (newHeight - startHeight);
        } else if (handle === 'bottom-right') {
          newWidth = Math.max(1, Math.min(90, startWidth + pxDeltaToPercent(rawDx, parentRect.width)));
          newHeight = Math.max(1, Math.min(90, startHeight + pxDeltaToPercent(dy, parentRect.height)));
        } else if (handle === 'bottom-left') {
          newWidth = Math.max(1, Math.min(90, startWidth - pxDeltaToPercent(rawDx, parentRect.width)));
          newLeft = startLeft - (newWidth - startWidth);
          newHeight = Math.max(1, Math.min(90, startHeight + pxDeltaToPercent(dy, parentRect.height)));
        } else if (handle === 'top-right') {
          newWidth = Math.max(1, Math.min(90, startWidth + pxDeltaToPercent(rawDx, parentRect.width)));
          newHeight = Math.max(1, Math.min(90, startHeight - pxDeltaToPercent(dy, parentRect.height)));
          newTop = startTop - (newHeight - startHeight);
        } else if (handle === 'top-left') {
          newWidth = Math.max(1, Math.min(90, startWidth - pxDeltaToPercent(rawDx, parentRect.width)));
          newLeft = startLeft - (newWidth - startWidth);
          newHeight = Math.max(1, Math.min(90, startHeight - pxDeltaToPercent(dy, parentRect.height)));
          newTop = startTop - (newHeight - startHeight);
        }
        
        onChange({ width: newWidth, height: newHeight, left: newLeft, top: newTop });
        return;
      }

      if (element.type === 'text') {
        let newFontSize = startFontSize;
        if (textStartRect && textStartRect.width > 0 && textStartRect.height > 0) {
          const startW = textStartRect.width;
          const startH = textStartRect.height;
          // Scale font size proportionally to the mouse drag projected along the box's diagonal.
          // This keeps the resizer handle exactly under the mouse, preventing the hypersensitivity
          // caused by raw pixel->point mapping.
          const scale = 1 + (dx * startW + dy * startH) / (startW * startW + startH * startH);
          newFontSize = Math.round(startFontSize * scale);
        } else {
          const parentRect = pageWrapper.getBoundingClientRect();
          const deltaFontSize = pxToPoints(dx, scaleFactorFromPx(parentRect.width, pageWidthPoints)) * 0.2;
          newFontSize = Math.round(startFontSize + deltaFontSize);
        }
        onChange({ fontSize: Math.max(6, Math.min(72, newFontSize)) });
        return;
      }

      const parentRect = pageWrapper.getBoundingClientRect();
      const deltaWidthPercent = pxDeltaToPercent(dx, parentRect.width);

      // Symbols use an absolute pixel floor (not a fixed %) so the box never
      // shrinks past what its border/padding chrome needs to render the icon —
      // a flat % floor collapses to a couple of screen pixels on a large page,
      // leaving no content area for the SVG and making it vanish, not shrink.
      const minWidth = element.type === 'symbol'
        ? pxToPercent(14, parentRect.width)
        : 3;
      let newWidth = startWidth + deltaWidthPercent;
      newWidth = Math.max(minWidth, Math.min(60, newWidth)); // constraints (min% to 60%)

      const ratio = element.aspectRatio || defaultRatio;
      // Convert width percent to correct height percent using responsive page dimensions
      const newHeight = widthPercentToHeightPercent(newWidth, ratio, parentRect.width, parentRect.height);

      // Symbols and signatures grow/shrink around the box's center instead of its
      // top-left corner. (Lines never reach here — they only render line-start /
      // line-end handles, both handled by the early returns at the top of this fn.)
      if (element.type === 'symbol' || element.type === 'signature') {
        let newLeft = startLeft + (startWidth - newWidth) / 2;
        let newTop = startTop + (startHeight - newHeight) / 2;
        newLeft = Math.max(0, Math.min(100 - newWidth, newLeft));
        newTop = Math.max(0, Math.min(100 - newHeight, newTop));
        onChange({ width: newWidth, height: newHeight, left: newLeft, top: newTop });
        return;
      }

      onChange({ width: newWidth, height: newHeight });
    };

    const handleResizeUp = () => {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeUp);
      window.removeEventListener('touchmove', handleResizeMove);
      window.removeEventListener('touchend', handleResizeUp);
    };

    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeUp);
    window.addEventListener('touchmove', handleResizeMove, { passive: false });
    window.addEventListener('touchend', handleResizeUp);
  };

  // Font size responsive scaling for text elements
  const textFontSize = (element.fontSize || 12) * scaleFactor;


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
        refs.setReference(node);
      }}
      className={`sign-element${isActive ? ' active' : ''}${element.type === 'symbol' ? ' sign-element--symbol' : ''}${isShape ? ' sign-element--shape' : ''}${isLine ? ' sign-element--line' : ''}`}
      style={style}
      onMouseDown={!isLine ? handlePointerDown : undefined}
      onTouchStart={!isLine ? handlePointerDown : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Element options bar */}
      <div
        ref={(node) => {
          actionsRef.current = node;
          refs.setFloating(node);
        }}
        className="sign-element-actions"
        style={isLine ? {
          position: 'absolute',
          left: `${Math.min(element.x1, element.x2) + Math.abs(element.x1 - element.x2) / 2}%`,
          top: `${Math.min(element.y1, element.y2)}%`,
          transform: 'translate(-50%, -100%)',
          marginTop: '-10px',
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
      {element.type === 'text' && (
        <TextElement 
          element={element}
          textFontSize={textFontSize}
          textDirection={textDirection}
          onChange={onChange}
          onSelect={onSelect}
        />
      )}
      {element.type === 'symbol' && (
        <SymbolElement element={element} />
      )}
      {isShape && !isWhiteout && (
        <ShapeElement element={element} actualType={actualType} />
      )}
      {isLine && (
        <LineElement element={element} handlePointerDown={handlePointerDown} />
      )}
      {element.type === 'signature' && (
        <SignatureElement element={element} tintedSigUrl={tintedSigUrl} />
      )}
      {element.type === 'whiteout' && (
        <WhiteoutElement element={element} />
      )}

      {/* Resizer control: width/height for signatures/symbols, font size for text. */}
      <ElementResizers 
        element={element}
        isActive={isActive}
        isShape={isShape}
        isLine={isLine}
        onResizeStart={handleResizeStart}
      />
    </div>
  );
}
