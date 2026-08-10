import { useRef } from 'preact/hooks';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/react';
import { TOOLBAR_FLOATING_OFFSET } from '../constants/signGeometry.js';
import ElementToolbar from './ElementToolbar.jsx';
import ElementResizers from './ElementResizers.jsx';
import { getElementDefinition } from '../editor/registry/index.ts';
import useDraggableElement from '../lib/useDraggableElement.js';
import useElementResize from '../lib/useElementResize.js';
import elementStyles from './SignTool/EditorElement.module.css';
import styles from './PdfRedactTool.module.css';

// Renders one redaction box (blackout/whiteout/blur). Extracted out of PdfRedactTool's
// map() because useFloating (below) is a hook and can't run per-iteration inline.
//
// Whiteout boxes are styled to match the Sign tool's whiteout element as closely as
// possible: the same floating toolbar (ElementToolbar's `type === 'whiteout'` branch —
// color picker + duplicate + delete), positioned with the same Floating UI middleware as
// SignTool/DraggableWrapper.jsx so it flips below the box instead of clipping off-screen
// near the top of a page; the same 8-handle resize UI as ElementResizers renders for
// shapes (`.sign-element--shape .sign-element-resizer` in global.css); and a border that
// stays transparent at rest so the box reads as a true erase, only appearing on hover/
// selection (mirrors `.sign-element` / `.sign-element.active` in global.css). Blackout/
// blur boxes share the same resize handles, but keep their red in-box delete control.
export default function RedactBox({
  el,
  isSelected,
  isActiveHover,
  onSelect,
  onChange,
  getPageWrapper,
  onHoverEnter,
  onHoverLeave,
  onDelete,
  onChangeColor,
  onClone
}) {
  const elementRef = useRef(null);
  const { refs, floatingStyles } = useFloating({
    placement: 'top-start',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(TOOLBAR_FLOATING_OFFSET),
      flip({ fallbackPlacements: ['bottom'] }),
      shift({ padding: TOOLBAR_FLOATING_OFFSET })
    ]
  });

  // Drag-to-move and resize gestures, shared with the Sign tool's element
  // wrapper (E7.5) - blackout/blur/whiteout never hit the line/text-specific
  // branches in either hook, so the box-only path applies unmodified.
  const { handlePointerDown: handleDragPointerDown } = useDraggableElement({
    element: el,
    elementRef,
    getPageWrapper,
    onSelect: () => onSelect(el.id),
    onChange: (patch) => onChange(el.id, patch),
  });
  const { handleResizeStart } = useElementResize({
    element: el,
    elementRef,
    getPageWrapper,
    pageWidthPoints: 0,
    onChange: (patch) => onChange(el.id, patch),
  });

  // The inline delete button (blackout/blur only) has no data-editor-actions/
  // data-editor-resizer marker, so useDraggableElement's own target-closest
  // guards don't catch it - preserved here as the one piece of Redact-specific
  // logic that survives the convergence onto the shared hook.
  const handlePointerDown = (e) => {
    if (e.target.closest(`.${styles['redact-element-btn']}`)) return;
    handleDragPointerDown(e);
  };

  const isWhiteout = el.type === 'whiteout';
  const hasShapeHandles = true;
  const surface = getElementDefinition(el.type).render({
    element: el,
    onChange: () => {},
    onSelect: () => {},
    pageWidthPoints: 0,
    renderTarget: 'redact',
  });

  // Fill/blur/border for every redaction type is owned solely by `surface`
  // (renderRedactionSurface, via the registry's render()) - the host div
  // below carries only geometry, interaction chrome, and a selection class
  // (E7.4). Whiteout's border is selection/hover-state-driven, so that part
  // lives in PdfRedactTool.module.css's `.redact-box--whiteout` rules rather
  // than a JS-computed color.
  const className = [
    styles['redact-box'],
    isWhiteout && styles['redact-box--whiteout'],
    isActiveHover && styles.active,
    isSelected && styles.selected,
    hasShapeHandles && elementStyles.shape,
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={(node) => {
        elementRef.current = node;
        if (node && refs.reference !== node) {
          refs.setReference(node);
        }
      }}
      className={className}
      data-editor-shape={hasShapeHandles || undefined}
      onMouseDown={handlePointerDown}
      onTouchStart={handlePointerDown}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      style={{
        position: 'absolute',
        left: `${el.left}%`,
        top: `${el.top}%`,
        width: `${el.width}%`,
        height: `${el.height}%`,
        cursor: 'move',
        touchAction: 'none',
        zIndex: 10
      }}
    >
      {surface}
      {!isWhiteout && (
        <button
          className={styles['redact-element-btn']}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(el.id);
          }}
          title="Remove redaction"
          style={{
            position: 'absolute',
            top: hasShapeHandles ? '8px' : '-10px',
            right: hasShapeHandles ? '8px' : '-10px',
            background: 'var(--color-danger)',
            color: '#fff',
            border: 'none',
            borderRadius: '50%',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: '14px',
            lineHeight: '1',
            padding: 0,
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}
        >
          ✕
        </button>
      )}
      {hasShapeHandles ? (
        <ElementResizers
          element={el}
          isActive={isSelected}
          onResizeStart={(e, handle) => handleResizeStart(e, handle)}
        />
      ) : (
        <div
          className={styles['redact-box-resizer']}
          onMouseDown={(e) => handleResizeStart(e)}
          onTouchStart={(e) => handleResizeStart(e)}
          title="Drag to resize"
          style={{
            position: 'absolute',
            bottom: '-6px',
            right: '-6px',
            width: '14px',
            height: '14px',
            background: 'var(--color-primary)',
            border: '2px solid var(--color-surface)',
            borderRadius: '50%',
            cursor: 'se-resize',
            touchAction: 'none',
            boxShadow: 'var(--shadow-sm)',
            zIndex: 11
          }}
        />
      )}
      {isSelected && isWhiteout && (
        <div
          ref={refs.setFloating}
          className={elementStyles.actions}
          data-editor-actions
          style={{ ...floatingStyles, opacity: 1, pointerEvents: 'auto' }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <ElementToolbar
            element={el}
            onChange={(changes) => {
              if (changes.color) onChangeColor(el.id, changes.color);
            }}
            onClone={onClone}
            onDelete={() => onDelete(el.id)}
          />
        </div>
      )}
    </div>
  );
}
