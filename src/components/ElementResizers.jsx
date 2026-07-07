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
          {/* Edge handles */}
          <div className="sign-element-resizer top" onMouseDown={(e) => onResizeStart(e, 'top')} onTouchStart={(e) => onResizeStart(e, 'top')} />
          <div className="sign-element-resizer right" onMouseDown={(e) => onResizeStart(e, 'right')} onTouchStart={(e) => onResizeStart(e, 'right')} />
          <div className="sign-element-resizer bottom" onMouseDown={(e) => onResizeStart(e, 'bottom')} onTouchStart={(e) => onResizeStart(e, 'bottom')} />
          <div className="sign-element-resizer left" onMouseDown={(e) => onResizeStart(e, 'left')} onTouchStart={(e) => onResizeStart(e, 'left')} />
          {/* Corner handles */}
          <div className="sign-element-resizer corner top-left" onMouseDown={(e) => onResizeStart(e, 'top-left')} onTouchStart={(e) => onResizeStart(e, 'top-left')} />
          <div className="sign-element-resizer corner top-right" onMouseDown={(e) => onResizeStart(e, 'top-right')} onTouchStart={(e) => onResizeStart(e, 'top-right')} />
          <div className="sign-element-resizer corner bottom-left" onMouseDown={(e) => onResizeStart(e, 'bottom-left')} onTouchStart={(e) => onResizeStart(e, 'bottom-left')} />
          <div className="sign-element-resizer corner bottom-right" onMouseDown={(e) => onResizeStart(e, 'bottom-right')} onTouchStart={(e) => onResizeStart(e, 'bottom-right')} />
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
            className="sign-element-resizer corner top-left"
            onMouseDown={(e) => onResizeStart(e, 'top-left')}
            onTouchStart={(e) => onResizeStart(e, 'top-left')}
            title={element.type === 'text' ? 'Drag to resize font size' : 'Drag to resize'}
          />
          <div
            className="sign-element-resizer corner top-right"
            onMouseDown={(e) => onResizeStart(e, 'top-right')}
            onTouchStart={(e) => onResizeStart(e, 'top-right')}
            title={element.type === 'text' ? 'Drag to resize font size' : 'Drag to resize'}
          />
          <div
            className="sign-element-resizer corner bottom-left"
            onMouseDown={(e) => onResizeStart(e, 'bottom-left')}
            onTouchStart={(e) => onResizeStart(e, 'bottom-left')}
            title={element.type === 'text' ? 'Drag to resize font size' : 'Drag to resize'}
          />
          <div
            className="sign-element-resizer corner bottom-right"
            onMouseDown={(e) => onResizeStart(e, 'bottom-right')}
            onTouchStart={(e) => onResizeStart(e, 'bottom-right')}
            title={element.type === 'text' ? 'Drag to resize font size' : 'Drag to resize'}
          />
        </>
      )}
    </>
  );
}
