import ElementResizers from '../../ElementResizers.jsx';
import {
  DEFAULT_STROKE_WIDTH,
  LINE_HIT_TARGET_STOKE_WIDTH
} from '../../../constants/signGeometry.js';

export default function LineNode({ element, isActive, onResizeStart, handlePointerDown }) {
  return (
    <>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
        <line
          x1={`${element.x1}%`}
          y1={`${element.y1}%`}
          x2={`${element.x2}%`}
          y2={`${element.y2}%`}
          stroke={element.color || 'var(--color-primary)'}
          stroke-width={element.strokeWidth || DEFAULT_STROKE_WIDTH}
          stroke-linecap="round"
        />
        {/* Fat invisible line for easier hitting */}
        <line
          x1={`${element.x1}%`}
          y1={`${element.y1}%`}
          x2={`${element.x2}%`}
          y2={`${element.y2}%`}
          stroke="transparent"
          stroke-width={LINE_HIT_TARGET_STOKE_WIDTH}
          stroke-linecap="round"
          style={{ pointerEvents: 'auto', cursor: 'pointer' }}
          onMouseDown={handlePointerDown}
          onTouchStart={handlePointerDown}
        />
      </svg>
      <ElementResizers 
        // Standalone node tests predate the flat discriminant. Within this
        // node, the type is unambiguous; keep that fixture compatibility at
        // the renderer boundary rather than weakening the registry lookup.
        element={{ ...element, type: 'line' }}
        isActive={isActive}
        onResizeStart={onResizeStart}
      />
    </>
  );
}
