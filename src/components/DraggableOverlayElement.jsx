import { useState, useRef, useEffect, useLayoutEffect } from 'preact/hooks';
import { computePosition, offset, flip } from '@floating-ui/dom';
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
  useEffect(() => {
    if (!isActive || !actionsRef.current || !elementRef.current) return;
    const anchorEl = elementRef.current;
    const toolbarEl = actionsRef.current;
    let cancelled = false;
    computePosition(anchorEl, toolbarEl, {
      placement: 'top',
      middleware: [offset(8), flip({ fallbackPlacements: ['bottom'] })]
    }).then(({ y }) => {
      if (cancelled) return;
      toolbarEl.style.top = `${y}px`;
    });
    return () => { cancelled = true; };
  }, [isActive, element.top]);

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

    const handlePointerMove = (moveEvent) => {
      const moveX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const moveY = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY;

      const dx = moveX - dragStartPos.current.x;
      const dy = moveY - dragStartPos.current.y;

      const parentRect = pageWrapper.getBoundingClientRect();

      let newLeft = dragStartPos.current.left + pxDeltaToPercent(dx, parentRect.width);
      let newTop = dragStartPos.current.top + pxDeltaToPercent(dy, parentRect.height);

      // Keep within bounds. `element.left` anchors the box's left edge normally,
      // but for RTL text it anchors the *right* edge (see the `style` block
      // below), so the valid range is flipped: the anchor can't go below the
      // box's own width (or the left edge would run off-page) and can't exceed
      // 100 (or the right edge would run off-page).
      const widthPercent = element.type === 'text' ? (textWidthPercentAtStart ?? 4) : (element.width || 4);
      if (element.type === 'text' && getEffectiveTextDirection(element) === 'rtl') {
        newLeft = Math.max(widthPercent, Math.min(100, newLeft));
      } else {
        newLeft = Math.max(0, Math.min(100 - widthPercent, newLeft));
      }
      newTop = Math.max(0, Math.min(100 - (element.height || 2), newTop));

      onChange({ left: newLeft, top: newTop });
    };

    const handlePointerUp = () => {
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

  // Resize handler for signature/checkmark elements (width/height) and text elements (font size)
  const handleResizeStart = (e, handle = 'right') => {
    e.stopPropagation();
    e.preventDefault();

    // Captured once for the gesture — the page wrapper can't change while resizing.
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
    const startParentRect = pageWrapper.getBoundingClientRect();
    const defaultRatio = element.type === 'checkmark' ? 1 : 0.4;
    const ratioAtStart = element.aspectRatio || defaultRatio;
    const startHeight = element.height || widthPercentToHeightPercent(startWidth, ratioAtStart, startParentRect.width, startParentRect.height);

    // Capture the initial bounds of the text element so resize math doesn't compound against dynamic grid updates
    const textStartRect = element.type === 'text' && elementRef.current ? elementRef.current.getBoundingClientRect() : null;

    const handleResizeMove = (moveEvent) => {
      const moveX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const moveY = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY;
      const rawDx = moveX - dragStartX;
      const dy = moveY - dragStartY;
      const dx = handle === 'left' ? -rawDx : rawDx;

      if (element.type === 'whiteout') {
        const parentRect = pageWrapper.getBoundingClientRect();
        const deltaWidthPercent = pxDeltaToPercent(dx, parentRect.width);
        const deltaHeightPercent = pxDeltaToPercent(dy, parentRect.height);
        let newWidth = Math.max(1, Math.min(90, startWidth + deltaWidthPercent));
        let newHeight = Math.max(1, Math.min(90, startHeight + deltaHeightPercent));
        onChange({ width: newWidth, height: newHeight });
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

      // Checkmarks use an absolute pixel floor (not a fixed %) so the box never
      // shrinks past what its border/padding chrome needs to render the icon —
      // a flat % floor collapses to a couple of screen pixels on a large page,
      // leaving no content area for the SVG and making it vanish, not shrink.
      const minWidth = element.type === 'checkmark'
        ? pxToPercent(14, parentRect.width)
        : 3;
      let newWidth = startWidth + deltaWidthPercent;
      newWidth = Math.max(minWidth, Math.min(60, newWidth)); // constraints (min% to 60%)

      const ratio = element.aspectRatio || defaultRatio;
      // Convert width percent to correct height percent using responsive page dimensions
      const newHeight = widthPercentToHeightPercent(newWidth, ratio, parentRect.width, parentRect.height);

      if (element.type === 'checkmark' || element.type === 'signature') {
        // Grow/shrink around the box's center instead of its top-left corner
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
  const textDirection = element.type === 'text' ? getEffectiveTextDirection(element) : 'ltr';

  // Styles for responsive placing. `element.left` is always the anchored edge's
  // distance from the page wrapper's left edge — which physical edge that is
  // depends on direction. LTR (and every non-text element) anchors its own left
  // edge there, via CSS `left`, and grows/shrinks rightward. RTL text anchors
  // its *right* edge there instead, via CSS `right`, so it grows leftward as
  // `width` increases with no JS repositioning (see the width-growth effect
  // above). Dragging (handlePointerDown) adds the same pixel delta to
  // `element.left` regardless of direction, which is correct either way since
  // it's just moving whichever edge is anchored.
  const isRtlText = element.type === 'text' && textDirection === 'rtl';
  const style = {
    top: `${element.top}%`,
    width: element.width && element.type !== 'text' ? `${element.width}%` : 'auto',
    height: element.height && element.type !== 'text' ? `${element.height}%` : 'auto',
    ...(isRtlText
      ? { right: `${100 - element.left}%` }
      : { left: `${element.left}%` }),
  };

  return (
    <div
      ref={elementRef}
      className={`sign-element${isActive ? ' active' : ''}${element.type === 'checkmark' ? ' sign-element--checkmark' : ''}`}
      style={style}
      onMouseDown={handlePointerDown}
      onTouchStart={handlePointerDown}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Element options bar */}
      <div
        ref={actionsRef}
        className={`sign-element-actions${textDirection === 'rtl' ? ' sign-element-actions--rtl' : ''}`}
      >
          {element.type === 'text' && (
            <>
              <FontPickerMenu
                value={element.fontFamily || 'Helvetica'}
                onChange={(fontFamily) => onChange({ fontFamily })}
              />
              <div className="sign-toolbar-divider" />
              <button
                type="button"
                className="sign-element-btn"
                onClick={() => onChange({ fontSize: Math.max(6, (element.fontSize || 12) - 1) })}
                title="Decrease font size"
              >
                A-
              </button>
              <button
                type="button"
                className="sign-element-btn"
                onClick={() => onChange({ fontSize: Math.min(72, (element.fontSize || 12) + 1) })}
                title="Increase font size"
              >
                A+
              </button>
              <div className="sign-toolbar-divider" />
              <button
                type="button"
                className={`sign-element-btn ${element.fontWeight === 'bold' ? 'active' : ''}`}
                onClick={() => onChange({ fontWeight: element.fontWeight === 'bold' ? 'normal' : 'bold' })}
                title="Bold"
              >
                <b>B</b>
              </button>
              <button
                type="button"
                className={`sign-element-btn ${element.fontStyle === 'italic' ? 'active' : ''}`}
                onClick={() => onChange({ fontStyle: element.fontStyle === 'italic' ? 'normal' : 'italic' })}
                title="Italic"
              >
                <i>I</i>
              </button>
              <div className="sign-toolbar-divider" />
              <button
                type="button"
                className={`sign-element-btn ${textDirection === 'rtl' ? 'active' : ''}`}
                onClick={() => onChange({ textDirection: textDirection === 'rtl' ? 'ltr' : 'rtl' })}
                title={
                  textDirection === 'rtl'
                    ? 'Right-to-left text (Hebrew/Arabic) — click to switch to left-to-right'
                    : 'Left-to-right text — click to switch to right-to-left (Hebrew/Arabic)'
                }
              >
                {textDirection === 'rtl' ? (
                  <PilcrowLeft size={14} strokeWidth={2.5} />
                ) : (
                  <PilcrowRight size={14} strokeWidth={2.5} />
                )}
              </button>
              <div className="sign-toolbar-divider" />
              <ColorPickerMenu
                value={element.color}
                onChange={(color) => onChange({ color })}
                title="Text color"
                defaultColor="#000000"
              />
              <div className="sign-toolbar-divider" />
            </>
          )}
          {element.type === 'checkmark' && (
            <>
              <button
                type="button"
                className={`sign-element-btn ${(element.mark || 'check') === 'check' ? 'active' : ''}`}
                onClick={() => onChange({ mark: 'check' })}
                title="Check mark"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
              <button
                type="button"
                className={`sign-element-btn ${element.mark === 'x' ? 'active' : ''}`}
                onClick={() => onChange({ mark: 'x' })}
                title="X mark"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                  <line x1="5" y1="5" x2="19" y2="19" />
                  <line x1="19" y1="5" x2="5" y2="19" />
                </svg>
              </button>
              <div className="sign-toolbar-divider" />
              <ColorPickerMenu
                value={element.color}
                onChange={(color) => onChange({ color })}
                title="Checkbox color"
                defaultColor="#1463ff"
              />
              <div className="sign-toolbar-divider" />
            </>
          )}
          {element.type === 'signature' && (
            <>
              <ColorPickerMenu
                value={element.color}
                onChange={(color) => onChange({ color })}
                title="Signature color"
                defaultColor="#000000"
              />
              <div className="sign-toolbar-divider" />
            </>
          )}
          {element.type === 'whiteout' && (
            <>
              <ColorPickerMenu
                value={element.color}
                onChange={(color) => onChange({ color })}
                title="Whiteout color"
                defaultColor="#ffffff"
              />
              <div className="sign-toolbar-divider" />
            </>
          )}
          <button
            type="button"
            className="sign-element-btn"
            onClick={() => {
              const newId = `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              onClone({
                ...element,
                id: newId,
                left: Math.min(90, element.left + 4),
                top: Math.min(90, element.top + 4)
              });
            }}
            title="Duplicate element"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
          <button
            type="button"
            className="sign-element-btn sign-element-btn-danger"
            onClick={onDelete}
            title="Delete element"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
      </div>

      {/* Render element depending on type */}
      {element.type === 'text' && (
        <div className="sign-text-display" style={{ fontSize: `${textFontSize}px` }}>
          <div
            className="sign-text-measure"
            dir={textDirection}
            style={{
              padding: '0 4px',
              fontSize: `${textFontSize}px`,
              fontFamily: element.fontFamily || 'Helvetica',
              fontWeight: element.fontWeight || 'normal',
              fontStyle: element.fontStyle || 'normal'
            }}
          >
            {/* Trailing zero-width space forces a trailing "\n" to get its own
                measured line box — otherwise a plain div under-counts a blank
                last line versus how the real textarea lays it out, and the
                textarea then auto-scrolls to keep the cursor visible, clipping
                the first line since overflow is hidden. */}
            {(element.text || 'Click to edit') + '\u200B'}
          </div>
          <textarea
            dir={textDirection}
            rows={1}
            className="sign-text-input"
            value={element.text}
            placeholder="Click to edit"
            onInput={(e) => {
              onChange({ text: e.currentTarget.value });
            }}
            onFocus={onSelect}
            style={{
              padding: '0 4px',
              textAlign: textDirection === 'rtl' ? 'right' : 'left',
              fontSize: `${textFontSize}px`,
              fontFamily: element.fontFamily || 'Helvetica',
              fontWeight: element.fontWeight || 'normal',
              fontStyle: element.fontStyle || 'normal',
              color: element.color || '#000000'
            }}
          />
        </div>
      )}

      {element.type === 'checkmark' && (
        <div style={{ color: element.color || 'var(--color-primary)' }}>
          {/* Sized via absolute+inset, not width/height:100%: at very small
              box sizes the percentage chain can round to ~0, and browsers
              then fall back to the SVG's default intrinsic size (~300x150px),
              making the icon balloon past the tiny box instead of shrinking
              with it. inset:0 fills the positioned ancestor's box directly,
              with no percentage-of-percentage resolution to round to zero. */}
          {element.mark === 'x' ? (
            <svg viewBox="0 0 24 24" style={{ position: 'absolute', inset: 0 }} fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
              <line x1="4" y1="4" x2="20" y2="20" />
              <line x1="20" y1="4" x2="4" y2="20" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" style={{ position: 'absolute', inset: 0 }} fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
      )}

      {element.type === 'signature' && element.dataUrl && (
        <img
          src={tintedSigUrl || element.dataUrl}
          alt="Signature"
          className="sign-sig-image"
        />
      )}

      {element.type === 'whiteout' && (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: element.color || '#ffffff' }} />
      )}

      {/* Resizer control: width/height for signatures/checkmarks, font size for text */}
      {isActive && (
        <>
          <div
            className="sign-element-resizer left"
            onMouseDown={(e) => handleResizeStart(e, 'left')}
            onTouchStart={(e) => handleResizeStart(e, 'left')}
            title={element.type === 'text' ? 'Drag to resize font size' : 'Drag to resize'}
          />
          <div
            className="sign-element-resizer right"
            onMouseDown={(e) => handleResizeStart(e, 'right')}
            onTouchStart={(e) => handleResizeStart(e, 'right')}
            title={element.type === 'text' ? 'Drag to resize font size' : 'Drag to resize'}
          />
        </>
      )}
    </div>
  );
}
