import { getElementDefinition } from '../editor/registry/index.ts';
import type { EditorElement } from '../editor/model/editorModel.ts';
import type { ResizeHandle } from '../editor/registry/types.ts';
import { getPointerCoords } from '../editor/gestures/pointer.ts';
import type { EditorPointerEvent, NodeResizeStart } from './nodeResizeTypes.ts';
import { englishSignMessages, type SignMessages } from '../i18n/toolMessages';
import styles from './EditorElement.module.css';

// Under `pointer: coarse` each handle carries a 44px halo (see the -18px inset
// in EditorElement.module.css), and a text box shorter than ~38px cannot hold
// three of them along one edge: the side handle, rendered last, swallowed every
// touch aimed at a corner, so a date could only be resized from the toolbar.
// The browser's hit test says which halo was touched; the handle the user
// meant is the one whose centre is nearest the touch point.
export function nearestHandle(event: EditorPointerEvent, pressed: HTMLElement, fallback: ResizeHandle): ResizeHandle {
  const siblings = pressed.parentElement?.querySelectorAll<HTMLElement>('[data-editor-resizer]');
  if (!siblings) return fallback;
  const point = getPointerCoords(event);
  let best = fallback;
  let bestDistance = Infinity;
  siblings.forEach((node) => {
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    const dx = rect.left + rect.width / 2 - point.x;
    const dy = rect.top + rect.height / 2 - point.y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = node.dataset.editorResizer as ResizeHandle;
    }
  });
  return best;
}

export default function ElementResizers({ element, isActive, onResizeStart, messages, style }: {
  element: EditorElement;
  isActive: boolean;
  onResizeStart: NodeResizeStart;
  /** LOC-16 stage 2-5: optional and English-default, same shape as
   * SignToolbar.tsx's `messages` prop. Shared with Redact (RedactBox.tsx),
   * which never passes it, so its English rendering is unaffected. */
  messages?: Partial<SignMessages>;
  /** `--half-height`, from TextNode.tsx's own measured box height - see the
   * comment on `[data-editor-text] .resizer` in EditorElement.module.css,
   * which derives both the handle size and how far the corner handles sit
   * from centre from this one raw measurement. Applied to every handle (not
   * a wrapping element: this component renders a flat list of siblings, no
   * container of its own), so the custom property reaches each handle's own
   * inline style directly rather than relying on CSS inheritance from an
   * ancestor that has no reason to carry it. Every other caller (ShapeNode,
   * WhiteoutNode, ...) leaves this unset, and that CSS's own `var(...,
   * 10px)` fallback is what makes that a no-op. */
  style?: Record<string, string>;
}) {
  const t: SignMessages = { ...englishSignMessages, ...messages };
  const { handles } = getElementDefinition(element.type).resizeBehavior;

  // Line endpoints remain available without selection so the SVG's hit target
  // can select and then adjust either endpoint, matching the prior behavior.
  if (!isActive && element.type !== 'line') return null;

  return (
    <>
      {handles.map((handle) => {
        const isLineHandle = handle.startsWith('line-');
        const isCorner = handle.includes('-') && !isLineHandle;
        const point = element.type === 'line' && handle === 'line-start'
          ? { left: element.x1, top: element.y1 }
          : element.type === 'line'
            ? { left: element.x2, top: element.y2 }
            : { left: 0, top: 0 };

        return (
          <div
            key={handle}
            className={[styles.resizer, isLineHandle && styles['line-handle'], isCorner && styles.corner, !isLineHandle && styles[handle]].filter(Boolean).join(' ')}
            data-editor-resizer={handle}
            style={isLineHandle
              ? { position: 'absolute', left: `${point.left}%`, top: `${point.top}%`, pointerEvents: 'auto', cursor: 'crosshair', transform: 'translate(-50%, -50%)', bottom: 'auto', right: 'auto' }
              : style}
            onMouseDown={(event) => onResizeStart(event, nearestHandle(event, event.currentTarget, handle))}
            onTouchStart={(event) => onResizeStart(event, nearestHandle(event, event.currentTarget, handle))}
            title={isLineHandle ? undefined
              : element.type !== 'text' ? t.dragToResizeTitle
              // On a comb the two grips do different jobs, and saying so is the
              // only hint that font size and cell pitch are independent here.
              : isCorner ? t.dragToResizeFontSizeTitle
              : t.dragToSpanBoxesTitle}
          />
        );
      })}
    </>
  );
}
