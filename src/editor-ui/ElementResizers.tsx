import { getElementDefinition } from '../editor/registry/index.ts';
import type { EditorElement } from '../editor/model/editorModel.ts';
import type { NodeResizeStart } from '../components/SignTool/nodeProps.ts';
import { englishSignMessages, type SignMessages } from '../i18n/toolMessages';
import styles from './EditorElement.module.css';

export default function ElementResizers({ element, isActive, onResizeStart, messages }: {
  element: EditorElement;
  isActive: boolean;
  onResizeStart: NodeResizeStart;
  /** LOC-16 stage 2-5: optional and English-default, same shape as
   * SignToolbar.tsx's `messages` prop. Shared with Redact (RedactBox.tsx),
   * which never passes it, so its English rendering is unaffected. */
  messages?: Partial<SignMessages>;
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
            style={isLineHandle ? { position: 'absolute', left: `${point.left}%`, top: `${point.top}%`, pointerEvents: 'auto', cursor: 'crosshair', transform: 'translate(-50%, -50%)', bottom: 'auto', right: 'auto' } : undefined}
            onMouseDown={(event) => onResizeStart(event, handle)}
            onTouchStart={(event) => onResizeStart(event, handle)}
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
