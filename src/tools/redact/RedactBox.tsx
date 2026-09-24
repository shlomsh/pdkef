import { useRef } from 'preact/hooks';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/react';
import { TOOLBAR_FLOATING_OFFSET } from '../../constants/signGeometry.js';
import ElementToolbar from '../../editor-ui/ElementToolbar.tsx';
import ElementResizers from '../../editor-ui/ElementResizers.tsx';
import { createElementRenderers } from '../../editor/registry/renderers.ts';
import type { ElementType } from '../../editor/model/editorModel.ts';
import useDraggableElement from '../../editor-ui/hooks/useDraggableElement.js';
import useElementResize from '../../editor-ui/hooks/useElementResize.js';
import useVisualViewportScale from '../../editor-ui/hooks/useVisualViewportScale.ts';
import elementStyles from '../../editor-ui/EditorElement.module.css';
import styles from './PdfRedactTool.module.css';

// MOBI-17: which corner of the bar actually touches the box it belongs to, so
// the counter-scale below shrinks it away from that corner rather than its
// own center. Generalised over `placement` (not fixed LTR/RTL like Sign's
// DraggableWrapper) because this bar's own `flip()` can resolve to plain
// 'bottom' (centered, no start/end) when it does not fit above.
function toolbarScaleOrigin(placement: string): string {
  const [side, align] = placement.split('-');
  const x = align === 'end' ? '100%' : align === 'start' ? '0%' : '50%';
  const y = side === 'bottom' ? '0%' : '100%';
  return `${x} ${y}`;
}

// Redact never renders a registered node component - its whiteout/blackout/
// blur elements always take the `renderTarget: 'redact'` branch inside
// createElementRenderers(), which is core-only. So this map is built with no
// components at all; see registry/renderers.ts's own header comment.
const ELEMENT_RENDERERS = createElementRenderers({});

// Renders one redaction box (blackout/whiteout/blur). Extracted out of PdfRedactTool's
// map() because useFloating (below) is a hook and can't run per-iteration inline.
//
// All three types are styled to match the Sign tool's whiteout element as closely as
// possible: the same floating toolbar on selection (ElementToolbar - color picker for
// whiteout only, then duplicate and delete for every type), positioned with the same
// Floating UI middleware as SignTool/DraggableWrapper.tsx so it flips below the box
// instead of clipping off-screen near the top of a page; the same 8-handle resize UI as
// ElementResizers renders for shapes (`.sign-element--shape .sign-element-resizer` in
// global.css); and a border that stays transparent at rest so the box reads as a true
// erase, only appearing on hover/selection (mirrors `.sign-element` / `.sign-element.active`
// in global.css). Blackout/blur used to carry their own inline red delete button instead
// of this toolbar; a design review found the mismatch (different icon, colour and
// position, the position itself moving between the resize-handles-shown and hidden
// states) confusing enough to remove it in favour of one shared selection chrome for
// every type.
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
}: {
  el: any;
  isSelected: boolean;
  isActiveHover: boolean;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: any) => void;
  getPageWrapper: (...args: any[]) => any;
  onHoverEnter: (...args: any[]) => void;
  onHoverLeave: (...args: any[]) => void;
  onDelete: (id: string) => void;
  onChangeColor: (id: string, color: string) => void;
  onClone: (...args: any[]) => void;
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  // MOBI-17: same publisher DraggableWrapper.tsx uses, ref-counted across
  // every mounted box on the page - see that file's comment on the hook call
  // and the hook's own header for the full reasoning (module-level CSSOM
  // write, never Preact state, so a pinch never re-renders a redaction box).
  useVisualViewportScale();
  const { refs, floatingStyles, placement } = useFloating({
    placement: 'top-start',
    whileElementsMounted: autoUpdate,
    middleware: [
      // MOBI-17: 0, not TOOLBAR_FLOATING_OFFSET - the gap is re-added below as
      // a scale-corrected CSS translate instead, so it does not grow under
      // pinch/auto-zoom the way a literal offset() value baked into
      // floatingStyles' translate(...) would. Full reasoning in
      // DraggableWrapper.tsx's own offset(0) comment; the only difference
      // here is this bar can flip to plain 'bottom', so the sign of the
      // correction below follows the resolved `placement` instead of being
      // fixed to "up".
      offset(0),
      flip({ fallbackPlacements: ['bottom'] }),
      shift({ padding: TOOLBAR_FLOATING_OFFSET })
    ]
  });
  // Floating UI's placement list is always exactly 'top-start' or plain
  // 'bottom' here (the two options fed to `useFloating`/`flip` above), so the
  // gap always sits on the main (vertical) axis: negative to push the bar up
  // off the top of the box, positive to push it down when flipped below.
  const toolbarGapSign = placement.startsWith('bottom') ? 1 : -1;
  const toolbarTransform = `${floatingStyles.transform || ''} translateY(calc(${toolbarGapSign} * ${TOOLBAR_FLOATING_OFFSET}px / var(--vv-scale, 1))) scale(calc(1 / var(--vv-scale, 1)))`;

  // Drag-to-move and resize gestures, shared with the Sign tool's element
  // wrapper (E7.5) - blackout/blur/whiteout never hit the line/text-specific
  // branches in either hook, so the box-only path applies unmodified.
  const { handlePointerDown: handleDragPointerDown } = useDraggableElement({
    element: el,
    elementRef,
    getPageWrapper,
    onSelect: () => onSelect(el.id),
    onChange: (patch: any) => onChange(el.id, patch),
  });
  const { handleResizeStart } = useElementResize({
    element: el,
    elementRef,
    getPageWrapper,
    pageWidthPoints: 0,
    onChange: (patch: any) => onChange(el.id, patch),
  });

  // The floating toolbar's own wrapper (`data-editor-actions`, below) already
  // stops mousedown/touchstart propagation, so no Redact-specific
  // target-closest guard is needed here any more - every type shares
  // useDraggableElement's handler directly (E7.5's per-type
  // `.redact-element-btn` guard was the one piece of Redact-specific logic
  // that survived the convergence onto the shared hook; it went away with
  // the inline button it protected).
  const isWhiteout = el.type === 'whiteout';
  const hasShapeHandles = true;
  const surface = ELEMENT_RENDERERS[el.type as ElementType]({
    element: el,
    onChange: () => {},
    onSelect: () => {},
    pageWidthPoints: 0,
    renderTarget: 'redact',
  });

  // Fill/blur/border for every redaction type is owned solely by `surface`
  // (renderRedactionSurface, via createElementRenderers()) - the host div
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
      onMouseDown={handleDragPointerDown}
      onTouchStart={handleDragPointerDown}
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
      {hasShapeHandles ? (
        <ElementResizers
          element={el}
          isActive={isSelected}
          onResizeStart={(e: any, handle: any) => handleResizeStart(e, handle)}
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
      {isSelected && (
        <div
          ref={refs.setFloating}
          className={elementStyles.actions}
          data-editor-actions
          style={{
            ...floatingStyles,
            transform: toolbarTransform,
            transformOrigin: toolbarScaleOrigin(placement),
            opacity: 1,
            pointerEvents: 'auto',
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <ElementToolbar
            element={el}
            onChange={(changes: any) => {
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
