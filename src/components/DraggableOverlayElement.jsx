import { useState, useRef, useEffect } from 'preact/hooks';
import { tintImageDataUrl } from '../lib/sign.js';
import ColorPicker from './ColorPicker.jsx';

// Draggable Overlay Element Component
export default function DraggableOverlayElement({
  element,
  isActive,
  onSelect,
  onChange,
  onDelete,
  onClone,
  pageWidthPoints,
  pageHeightPoints,
  pageWrapperRef
}) {
  const elementRef = useRef(null);
  const dragStartPos = useRef({ x: 0, y: 0, left: 0, top: 0 });
  const [scaleFactor, setScaleFactor] = useState(1);
  const [tintedSigUrl, setTintedSigUrl] = useState(null);
  const textMeasureRef = useRef(null);
  const [textInputWidth, setTextInputWidth] = useState(60);
  const [textInputHeight, setTextInputHeight] = useState(24);
  const actionsRef = useRef(null);
  const [toolbarFlip, setToolbarFlip] = useState({ right: false, below: false });

  // Keep the floating toolbar on-screen: its default position (above, flush
  // left with the element) clips off the top/right edge for elements placed
  // near the top or right of the page. Measure once per activation/move and
  // flip to the opposite side only when the default position would overflow.
  useEffect(() => {
    if (!isActive || !actionsRef.current) return;
    const margin = 8;
    const rect = actionsRef.current.getBoundingClientRect();
    setToolbarFlip({
      right: rect.right > window.innerWidth - margin,
      below: rect.top < margin
    });
  }, [isActive, element.left, element.top]);

  // Grow/shrink the text box to fit its content in both directions — width for
  // the widest line (RTL and long/short text otherwise sit inside a leftover
  // fixed-width box), height for however many lines Enter has introduced.
  useEffect(() => {
    if (element.type !== 'text' || !textMeasureRef.current) return;
    setTextInputWidth(Math.max(20, textMeasureRef.current.scrollWidth + 4));
    setTextInputHeight(Math.max(20, textMeasureRef.current.scrollHeight + 4));
  }, [element.type, element.text, element.fontFamily, element.fontWeight, element.fontStyle, element.fontSize, scaleFactor]);

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

  // Responsive scaling handler to convert points size on screen
  useEffect(() => {
    if (!pageWrapperRef) return;

    const updateScale = () => {
      const rect = pageWrapperRef.getBoundingClientRect();
      setScaleFactor(rect.width / pageWidthPoints);
    };

    updateScale();

    // Resize observer or window resize listener
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [pageWrapperRef, pageWidthPoints]);

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

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    dragStartPos.current = {
      x: clientX,
      y: clientY,
      left: element.left,
      top: element.top
    };

    const handlePointerMove = (moveEvent) => {
      const moveX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const moveY = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY;

      const dx = moveX - dragStartPos.current.x;
      const dy = moveY - dragStartPos.current.y;

      const parentRect = pageWrapperRef.getBoundingClientRect();

      let newLeft = dragStartPos.current.left + (dx / parentRect.width) * 100;
      let newTop = dragStartPos.current.top + (dy / parentRect.height) * 100;

      // Keep within bounds
      newLeft = Math.max(0, Math.min(100 - (element.width || 4), newLeft));
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
  const handleResizeStart = (e) => {
    e.stopPropagation();
    e.preventDefault();

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dragStartX = clientX;
    const dragStartY = clientY;
    const startWidth = element.width || 20;
    const startFontSize = element.fontSize || 12;
    const startLeft = element.left;
    const startTop = element.top;
    const startParentRect = pageWrapperRef.getBoundingClientRect();
    const defaultRatio = element.type === 'checkmark' ? 1 : 0.4;
    const ratioAtStart = element.aspectRatio || defaultRatio;
    const startHeight = element.height || (startWidth * ratioAtStart * (startParentRect.width / startParentRect.height));

    const handleResizeMove = (moveEvent) => {
      const moveX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const moveY = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY;
      const dx = moveX - dragStartX;
      const dy = moveY - dragStartY;

      if (element.type === 'whiteout') {
        const parentRect = pageWrapperRef.getBoundingClientRect();
        const deltaWidthPercent = (dx / parentRect.width) * 100;
        const deltaHeightPercent = (dy / parentRect.height) * 100;
        let newWidth = Math.max(1, Math.min(90, startWidth + deltaWidthPercent));
        let newHeight = Math.max(1, Math.min(90, startHeight + deltaHeightPercent));
        onChange({ width: newWidth, height: newHeight });
        return;
      }

      if (element.type === 'text') {
        const parentRect = pageWrapperRef.getBoundingClientRect();
        // Scale font size in PDF points relative to drag distance in screen pixels
        const deltaFontSize = (dx / parentRect.width) * pageWidthPoints;
        const newFontSize = Math.max(6, Math.min(72, Math.round(startFontSize + deltaFontSize)));
        onChange({ fontSize: newFontSize });
        return;
      }

      const parentRect = pageWrapperRef.getBoundingClientRect();
      const deltaWidthPercent = (dx / parentRect.width) * 100;

      // Checkmarks use an absolute pixel floor (not a fixed %) so the box never
      // shrinks past what its border/padding chrome needs to render the icon —
      // a flat % floor collapses to a couple of screen pixels on a large page,
      // leaving no content area for the SVG and making it vanish, not shrink.
      const minWidth = element.type === 'checkmark'
        ? (14 / parentRect.width) * 100
        : 3;
      let newWidth = startWidth + deltaWidthPercent;
      newWidth = Math.max(minWidth, Math.min(60, newWidth)); // constraints (min% to 60%)

      const ratio = element.aspectRatio || defaultRatio;
      // Convert width percent to correct height percent using responsive page dimensions
      const newHeight = newWidth * ratio * (parentRect.width / parentRect.height);

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

  // Styles for responsive placing
  const style = {
    left: `${element.left}%`,
    top: `${element.top}%`,
    width: element.width ? `${element.width}%` : 'auto',
    height: element.height ? `${element.height}%` : 'auto',
  };

  // Font size responsive scaling for text elements
  const textFontSize = (element.fontSize || 12) * scaleFactor;

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
        className={`sign-element-actions${toolbarFlip.right ? ' sign-element-actions--right' : ''}${toolbarFlip.below ? ' sign-element-actions--below' : ''}`}
      >
          {element.type === 'text' && (
            <>
              <select
                className="sign-font-select"
                value={element.fontFamily || 'Helvetica'}
                onChange={(e) => onChange({ fontFamily: e.target.value })}
                title="Font family"
              >
                <option value="Helvetica">Helvetica</option>
                <option value="Arimo">Arial (Arimo)</option>
                <option value="Assistant">Hebrew (Assistant)</option>
                <option value="Heebo">Hebrew (Heebo)</option>
                <option value="TimesRoman">Times Roman</option>
                <option value="Courier">Courier</option>
              </select>
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
              <ColorPicker
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
              <ColorPicker
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
              <ColorPicker
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
              <ColorPicker
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
            ref={textMeasureRef}
            className="sign-text-measure"
            style={{
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
            dir="auto"
            wrap="off"
            rows={1}
            className="sign-text-input"
            value={element.text}
            placeholder="Click to edit"
            onInput={(e) => onChange({ text: e.currentTarget.value })}
            onFocus={onSelect}
            style={{
              width: `${textInputWidth}px`,
              height: `${textInputHeight}px`,
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
        <div
          className="sign-element-resizer"
          onMouseDown={handleResizeStart}
          onTouchStart={handleResizeStart}
          title={element.type === 'text' ? 'Drag to resize font size' : 'Drag to resize'}
        />
      )}
    </div>
  );
}
