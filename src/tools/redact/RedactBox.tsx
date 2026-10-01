import { useRef } from 'preact/hooks';
import RedactBoxBar, { useCoarsePointer } from './RedactBoxBar.tsx';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/react';
import { TOOLBAR_FLOATING_OFFSET } from '../../constants/signGeometry.js';
import RedactBoxToolbar from './RedactBoxToolbar.tsx';
import toolbarStyles from './RedactBoxToolbar.module.css';
import ElementResizers from '../../editor-ui/ElementResizers.tsx';
import { createElementRenderers } from '../../editor/registry/renderers.ts';
import type { ElementType } from '../../editor/model/editorModel.ts';
import useDraggableElement from '../../editor-ui/hooks/useDraggableElement.js';
import usePressAndHold from './usePressAndHold.ts';
import useElementResize from '../../editor-ui/hooks/useElementResize.js';
import useVisualViewportScale from '../../editor-ui/hooks/useVisualViewportScale.ts';
import visualViewportClamp, { toolbarScaleOriginCss, getStickyToolShellRect } from '../../editor-ui/hooks/visualViewportClamp.ts';
import elementStyles from '../../editor-ui/EditorElement.module.css';
import styles from './PdfRedactTool.module.css';
import { boxKeyIntent, boxMovePatch, boxAriaLabel } from './boxKeys.ts';
import type { BlurStrength } from '../../editor/model/blurStrength.ts';

// MOBI-17: which corner of the bar actually touches the box it belongs to, so
// the counter-scale below shrinks it away from that corner rather than its
// own center. Generalised over `placement` (not fixed LTR/RTL like Sign's
// DraggableWrapper) because this bar's own `flip()` can resolve to plain
// 'bottom' (centered, no start/end) when it does not fit above. Shared with
// `visualViewportClamp`'s own origin math (`visualViewportClamp.ts`) so the
// two can never disagree about which corner is fixed.
const toolbarScaleOrigin = toolbarScaleOriginCss;

// Redact never renders a registered node component - its whiteout/blackout/
// blur elements always take the `renderTarget: 'redact'` branch inside
// createElementRenderers(), which is core-only. So this map is built with no
// components at all; see registry/renderers.ts's own header comment.
const ELEMENT_RENDERERS = createElementRenderers({});

// Renders one redaction box (blackout/whiteout/blur). Extracted out of PdfRedactTool's
// map() because useFloating (below) is a hook and can't run per-iteration inline.
//
// All three types are styled to match the Sign tool's whiteout element as closely as
// possible: the same floating toolbar on selection (RedactBoxToolbar - colour controls for
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
  onPickColor,
  onMatchPage,
  eyedropping,
  onToggleEyedropper,
  onChangeStrength,
  onDuplicate,
  onRepeatOnEveryPage,
  repeatGroupSize,
  onUnlinkFromGroup,
  onRemoveGroup,
  findSetSize,
  onRemoveFindSet,
  pageWidthPoints,
  pageHeightPoints,
  peekAll = false,
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
  onPickColor: (id: string, color: string) => void;
  /** RED-51: back to following the page's colour. */
  onMatchPage: (id: string) => void;
  eyedropping: boolean;
  onToggleEyedropper: () => void;
  onChangeStrength: (id: string, strength: BlurStrength) => void;
  /** RED-03: duplicates `el`'s whole repeat group by id - the toolbar's own
   * pre-built clone object is ignored (see onClone below). */
  onDuplicate: (id: string) => void;
  /** RED-03: only passed when repeating would add at least one box. */
  onRepeatOnEveryPage?: (id: string) => void;
  /** RED-03: how many pages carry a copy of this box's group, `el` included. */
  repeatGroupSize?: number;
  onUnlinkFromGroup?: () => void;
  onRemoveGroup?: () => void;
  /** RED-11: how many boxes are in this box's find set, `el` included. */
  findSetSize?: number;
  onRemoveFindSet?: () => void;
  /** The page's size in points: the blur box's on-screen radius (RED-24) and
   * every box's arrow-key move (RED-43). Until it is known, arrows do nothing. */
  pageWidthPoints?: number;
  pageHeightPoints?: number;
  /** RED-31: view state only - every box shows what is under it. */
  peekAll?: boolean;
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const coarsePointer = useCoarsePointer();
  const { refs, floatingStyles, placement, update } = useFloating({
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
      shift({ padding: TOOLBAR_FLOATING_OFFSET }),
      // MOBI-17: the missing containment check - see DraggableWrapper.tsx's
      // own comment beside its `visualViewportClamp` call, and
      // visualViewportClamp.ts's header, for the full reasoning. `flip()`
      // above already handles "does not fit above the box" by trying
      // 'bottom'; this handles "the whole page is zoomed and panned so
      // neither placement is currently visible".
      visualViewportClamp({ getExcludedRect: getStickyToolShellRect }),
    ]
  });
  // MOBI-17: same publisher DraggableWrapper.tsx uses, ref-counted across
  // every mounted box on the page - see that file's comment on the hook call
  // and the hook's own header for the full reasoning (module-level CSSOM
  // write, never Preact state, so a pinch never re-renders a redaction box).
  // Also feeds this bar's own `update()` into the shared visualViewport
  // change broadcast, so `visualViewportClamp` above is recomputed on every
  // pinch/pan step - `autoUpdate` alone never listens for one.
  useVisualViewportScale(update);
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
    // Only a selected box claims a touch (SNG-04's model, docs/sign-next-gen.md
    // §12 #4). A finger landing on an unselected box is left to the browser, so
    // it can scroll or pinch-zoom across a box that covers most of the page,
    // and a plain tap still selects it through iOS's synthesised mouse click.
    touchNeedsSelection: true,
    isSelected,
  });
  // RED-31: press and hold still to peek. The visual is one attribute written
  // straight to the DOM (never state, never the element), and the drag hook
  // above still gets every press.
  const { onPressStart } = usePressAndHold({
    onPeekChange: (on) => elementRef.current?.toggleAttribute('data-peeking', on),
  });
  const handlePress = (e: any) => {
    onPressStart(e);
    handleDragPointerDown(e);
  };
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
  // RED-32: a painted stroke is a box to the outside world (select, delete,
  // recolour) with no resize handles and no drag: moving the bbox would leave
  // its points behind. The floating toolbar sees it as the box type that has
  // the same controls (whiteout colour, blur strength).
  const isStroke = el.type === 'blurStroke' || el.type === 'whiteoutStroke';
  const isWhiteout = el.type === 'whiteout' || el.type === 'whiteoutStroke';
  const hasShapeHandles = !isStroke;
  // RED-43: keyboard access. Key handling is boxKeys.ts's pure function; this
  // only dispatches to the callbacks a click, the delete button and a drag
  // release already use. Keys from the floating toolbar's controls are ignored.
  const handleKeyDown = (e: any) => {
    if (e.target !== e.currentTarget) return;
    const intent = boxKeyIntent(
      e.key,
      { shift: e.shiftKey, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey },
      { isSelected, isStroke },
    );
    if (!intent) return;
    e.preventDefault();
    if (intent.kind === 'select') onSelect(el.id);
    else if (intent.kind === 'deselect') onSelect('');
    else if (intent.kind === 'delete') onDelete(el.id);
    else {
      const patch = boxMovePatch(el, intent.dx, intent.dy, pageWidthPoints ?? 0, pageHeightPoints ?? 0);
      if (patch) onChange(el.id, patch);
    }
  };
  const surface = ELEMENT_RENDERERS[el.type as ElementType]({
    element: el,
    onChange: () => {},
    onSelect: () => {},
    pageWidthPoints: pageWidthPoints ?? 0,
    pageHeightPoints,
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

  const toolbar = (
    <RedactBoxToolbar
      element={el}
      eyedropping={eyedropping}
      onToggleEyedropper={onToggleEyedropper}
      onMatchPage={() => onMatchPage(el.id)}
      onPickColor={(c: string) => onPickColor(el.id, c)}
      onChangeStrength={(s: BlurStrength) => onChangeStrength(el.id, s)}
      onDuplicate={() => onDuplicate(el.id)}
      onDelete={() => onDelete(el.id)}
      onRepeatOnEveryPage={onRepeatOnEveryPage ? () => onRepeatOnEveryPage(el.id) : undefined}
      repeatGroupSize={repeatGroupSize}
      onUnlinkFromGroup={onUnlinkFromGroup}
      onRemoveGroup={onRemoveGroup}
      findSetSize={findSetSize}
      onRemoveFindSet={onRemoveFindSet}
    />
  );

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
      data-peeking={peekAll || undefined}
      data-redact-box-id={el.id}
      tabIndex={0}
      role="group"
      aria-label={boxAriaLabel(el.type)}
      onKeyDown={handleKeyDown}
      onMouseDown={isStroke ? () => onSelect(el.id) : handlePress}
      onTouchStart={isStroke ? undefined : handlePress}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      style={{
        position: 'absolute',
        left: `${el.left}%`,
        top: `${el.top}%`,
        width: `${el.width}%`,
        height: `${el.height}%`,
        cursor: isStroke ? 'pointer' : 'move',
        // Unselected: native pan and pinch pass straight through (see
        // touchNeedsSelection above). Selected: one-finger drag is JS-owned,
        // two-finger pinch still belongs to the browser (MOBI-31).
        touchAction: isSelected ? 'pinch-zoom' : 'pan-x pan-y pinch-zoom',
        // A solid box sits above a blur, as the export paints it (redact.js).
        // The selected box rises above every sibling: its floating toolbar is
        // a child, so it can never paint higher than the box itself, and a
        // later box (a whiteout, say) would otherwise cover it. Matches
        // `.element.active` in EditorElement.module.css.
        zIndex: isSelected ? 50 : el.type === 'blur' ? 9 : 10
      }}
    >
      <div className={styles['redact-surface-host']}>{surface}</div>
      {isStroke ? null : hasShapeHandles ? (
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
      {isSelected && coarsePointer && (
        <RedactBoxBar boxRef={elementRef}>
          {toolbar}
        </RedactBoxBar>
      )}
      {isSelected && !coarsePointer && (
        <div
          ref={refs.setFloating}
          className={`${toolbarStyles.pill} ${toolbarStyles.floating}`}
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
          {toolbar}
        </div>
      )}
    </div>
  );
}
