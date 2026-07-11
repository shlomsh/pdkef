import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/react';
import { TOOLBAR_FLOATING_OFFSET } from '../constants/signGeometry.js';
import ElementToolbar from './ElementToolbar.jsx';
import ElementResizers from './ElementResizers.jsx';
import elementStyles from './SignTool/EditorElement.module.css';

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
  onDragStart,
  onResizeStart,
  onHoverEnter,
  onHoverLeave,
  onDelete,
  onChangeColor,
  onClone
}) {
  const { refs, floatingStyles } = useFloating({
    placement: 'top-start',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(TOOLBAR_FLOATING_OFFSET),
      flip({ fallbackPlacements: ['bottom'] }),
      shift({ padding: TOOLBAR_FLOATING_OFFSET })
    ]
  });

  const isWhiteout = el.style === 'whiteout';
  const hasShapeHandles = isWhiteout || el.style === 'blackout' || el.style === 'blur';
  const whiteoutBorderColor = isSelected
    ? 'var(--color-primary)'
    : (isActiveHover ? 'var(--color-muted-light)' : 'transparent');

  return (
    <div
      ref={refs.setReference}
      className={`redact-box${isActiveHover ? ' active' : ''}${hasShapeHandles ? ` ${elementStyles.shape}` : ''}`}
      data-editor-shape={hasShapeHandles || undefined}
      onMouseDown={(e) => onDragStart(e, el)}
      onTouchStart={(e) => onDragStart(e, el)}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      style={{
        position: 'absolute',
        left: `${el.left}%`,
        top: `${el.top}%`,
        width: `${el.width}%`,
        height: `${el.height}%`,
        backgroundColor: el.style === 'blur' ? 'rgba(255,255,255,0.1)' : (isWhiteout ? el.color || '#ffffff' : '#000000'),
        backdropFilter: el.style === 'blur' ? 'blur(8px)' : 'none',
        WebkitBackdropFilter: el.style === 'blur' ? 'blur(8px)' : 'none',
        border: el.style === 'blur'
          ? '1px solid rgba(0,0,0,0.2)'
          : (isWhiteout ? `1px dashed ${whiteoutBorderColor}` : '1px solid #333'),
        boxShadow: isWhiteout && isSelected ? '0 0 0 1px var(--color-primary-ring)' : 'none',
        cursor: 'move',
        touchAction: 'none',
        zIndex: 10
      }}
    >
      {!isWhiteout && (
        <button
          className="redact-element-btn"
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
          // Redact still discriminates with `style`; E4.4 reconciles that
          // model. Its resize behavior is the same eight-handle box behavior
          // as a Sign whiteout in the interim.
          element={{ ...el, type: 'whiteout' }}
          isActive={isSelected}
          onResizeStart={(e, handle) => onResizeStart(e, el, handle)}
        />
      ) : (
        <div
          className="redact-box-resizer"
          onMouseDown={(e) => onResizeStart(e, el)}
          onTouchStart={(e) => onResizeStart(e, el)}
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
            element={{ ...el, type: 'whiteout' }}
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
