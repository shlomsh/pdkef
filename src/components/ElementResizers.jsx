export default function ElementResizers({
  element,
  isActive,
  isShape,
  isLine,
  onResizeStart
}) {
  return (
    <>
      {isActive && isShape && (
        <>
          <div className="sign-element-resizer top" onMouseDown={(e) => onResizeStart(e, 'top')} onTouchStart={(e) => onResizeStart(e, 'top')} />
          <div className="sign-element-resizer right" onMouseDown={(e) => onResizeStart(e, 'right')} onTouchStart={(e) => onResizeStart(e, 'right')} />
          <div className="sign-element-resizer bottom" onMouseDown={(e) => onResizeStart(e, 'bottom')} onTouchStart={(e) => onResizeStart(e, 'bottom')} />
          <div className="sign-element-resizer left" onMouseDown={(e) => onResizeStart(e, 'left')} onTouchStart={(e) => onResizeStart(e, 'left')} />
        </>
      )}
      {isLine && (
        <>
          <div 
            className="sign-element-resizer line-handle" 
            style={{ position: 'absolute', left: `${element.x1}%`, top: `${element.y1}%`, pointerEvents: 'auto', cursor: 'crosshair', transform: 'translate(-50%, -50%)', bottom: 'auto', right: 'auto' }}
            onMouseDown={(e) => onResizeStart(e, 'line-start')}
            onTouchStart={(e) => onResizeStart(e, 'line-start')}
          />
          <div 
            className="sign-element-resizer line-handle" 
            style={{ position: 'absolute', left: `${element.x2}%`, top: `${element.y2}%`, pointerEvents: 'auto', cursor: 'crosshair', transform: 'translate(-50%, -50%)', bottom: 'auto', right: 'auto' }}
            onMouseDown={(e) => onResizeStart(e, 'line-end')}
            onTouchStart={(e) => onResizeStart(e, 'line-end')}
          />
        </>
      )}
      {isActive && !isShape && !isLine && (
        <>
          <div
            className="sign-element-resizer left"
            onMouseDown={(e) => onResizeStart(e, 'left')}
            onTouchStart={(e) => onResizeStart(e, 'left')}
            title={element.type === 'text' ? 'Drag to resize font size' : 'Drag to resize'}
          />
          <div
            className="sign-element-resizer right"
            onMouseDown={(e) => onResizeStart(e, 'right')}
            onTouchStart={(e) => onResizeStart(e, 'right')}
            title={element.type === 'text' ? 'Drag to resize font size' : 'Drag to resize'}
          />
        </>
      )}
    </>
  );
}
