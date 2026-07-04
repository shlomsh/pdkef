export default function LineElement({ element, handlePointerDown }) {
  return (
    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
      {/* Visible line */}
      <line
        x1={`${element.x1}%`} y1={`${element.y1}%`}
        x2={`${element.x2}%`} y2={`${element.y2}%`}
        stroke={element.color || 'var(--color-primary)'}
        stroke-width={element.strokeWidth || 3}
        stroke-linecap="round"
        style={{ pointerEvents: 'auto', cursor: 'move' }}
        onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e); }}
        onTouchStart={(e) => { e.stopPropagation(); handlePointerDown(e); }}
      />
      {/* Invisible thick stroke for easier clicking/dragging */}
      <line
        x1={`${element.x1}%`} y1={`${element.y1}%`}
        x2={`${element.x2}%`} y2={`${element.y2}%`}
        stroke="rgba(0,0,0,0)"
        stroke-width="20"
        style={{ pointerEvents: 'auto', cursor: 'move' }}
        onMouseDown={(e) => { e.stopPropagation(); handlePointerDown(e); }}
        onTouchStart={(e) => { e.stopPropagation(); handlePointerDown(e); }}
      />
    </svg>
  );
}
