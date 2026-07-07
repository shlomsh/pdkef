import ElementResizers from '../../ElementResizers.jsx';

export default function ShapeNode({ element, isActive, onResizeStart }) {
  const actualType = element.type;
  return (
    <>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        {actualType === 'ellipse' && (
          <ellipse
            cx="50" cy="50"
            rx="49" ry="49"
            fill="none"
            stroke={element.color || 'var(--color-primary)'}
            stroke-width={element.strokeWidth || 3}
            vector-effect="non-scaling-stroke"
          />
        )}
        {actualType === 'rectangle' && (
          <rect
            x="1" y="1"
            width="98" height="98"
            rx="4"
            fill="none"
            stroke={element.color || 'var(--color-primary)'}
            stroke-width={element.strokeWidth || 3}
            vector-effect="non-scaling-stroke"
          />
        )}
      </svg>
      <ElementResizers 
        element={element}
        isActive={isActive}
        isShape={true}
        isLine={false}
        onResizeStart={onResizeStart}
      />
    </>
  );
}
