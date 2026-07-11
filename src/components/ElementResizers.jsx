import { getElementDefinition } from '../editor/registry/index.ts';
import styles from './SignTool/EditorElement.module.css';

export default function ElementResizers({ element, isActive, onResizeStart }) {
  const { handles } = getElementDefinition(element.type).resizeBehavior;

  // Line endpoints remain available without selection so the SVG's hit target
  // can select and then adjust either endpoint, matching the prior behavior.
  if (!isActive && element.type !== 'line') return null;

  return (
    <>
      {handles.map((handle) => {
        const isLineHandle = handle.startsWith('line-');
        const isCorner = handle.includes('-') && !isLineHandle;
        const point = handle === 'line-start'
          ? { left: element.x1, top: element.y1 }
          : { left: element.x2, top: element.y2 };

        return (
          <div
            key={handle}
            className={[styles.resizer, isLineHandle && styles['line-handle'], isCorner && styles.corner, !isLineHandle && styles[handle]].filter(Boolean).join(' ')}
            data-editor-resizer={handle}
            style={isLineHandle ? { position: 'absolute', left: `${point.left}%`, top: `${point.top}%`, pointerEvents: 'auto', cursor: 'crosshair', transform: 'translate(-50%, -50%)', bottom: 'auto', right: 'auto' } : undefined}
            onMouseDown={(event) => onResizeStart(event, handle)}
            onTouchStart={(event) => onResizeStart(event, handle)}
            title={!isLineHandle && element.type === 'text' ? 'Drag to resize font size' : !isLineHandle ? 'Drag to resize' : undefined}
          />
        );
      })}
    </>
  );
}
