export default function ElementResizers({
  element,
  isActive,
  isShape,
  isLine,
  onResizeStart
}) {
  const edgeHandleClasses = "absolute bg-white border-[1.5px] border-primary z-10 w-2 h-2";
  const cornerHandleClasses = "absolute bg-primary border-[1.5px] border-white z-10 w-2.5 h-2.5 rounded-full";

  return (
    <>
      {isActive && isShape && (
        <>
          {/* Edge handles */}
          <div className={`${edgeHandleClasses} -top-1 left-1/2 -translate-x-1/2 cursor-ns-resize`} onMouseDown={(e) => onResizeStart(e, 'top')} onTouchStart={(e) => onResizeStart(e, 'top')} />
          <div className={`${edgeHandleClasses} -right-1 top-1/2 -translate-y-1/2 cursor-ew-resize`} onMouseDown={(e) => onResizeStart(e, 'right')} onTouchStart={(e) => onResizeStart(e, 'right')} />
          <div className={`${edgeHandleClasses} -bottom-1 left-1/2 -translate-x-1/2 cursor-ns-resize`} onMouseDown={(e) => onResizeStart(e, 'bottom')} onTouchStart={(e) => onResizeStart(e, 'bottom')} />
          <div className={`${edgeHandleClasses} -left-1 top-1/2 -translate-y-1/2 cursor-ew-resize`} onMouseDown={(e) => onResizeStart(e, 'left')} onTouchStart={(e) => onResizeStart(e, 'left')} />
          {/* Corner handles */}
          <div className={`${cornerHandleClasses} -top-1 -left-1 cursor-nwse-resize`} onMouseDown={(e) => onResizeStart(e, 'top-left')} onTouchStart={(e) => onResizeStart(e, 'top-left')} />
          <div className={`${cornerHandleClasses} -top-1 -right-1 cursor-nesw-resize`} onMouseDown={(e) => onResizeStart(e, 'top-right')} onTouchStart={(e) => onResizeStart(e, 'top-right')} />
          <div className={`${cornerHandleClasses} -bottom-1 -left-1 cursor-nesw-resize`} onMouseDown={(e) => onResizeStart(e, 'bottom-left')} onTouchStart={(e) => onResizeStart(e, 'bottom-left')} />
          <div className={`${cornerHandleClasses} -bottom-1 -right-1 cursor-nwse-resize`} onMouseDown={(e) => onResizeStart(e, 'bottom-right')} onTouchStart={(e) => onResizeStart(e, 'bottom-right')} />
        </>
      )}
      {isLine && (
        <>
          <div 
            className="absolute bg-primary border-[1.5px] border-white z-10 w-2.5 h-2.5" 
            style={{ left: `${element.x1}%`, top: `${element.y1}%`, pointerEvents: 'auto', cursor: 'crosshair', transform: 'translate(-50%, -50%)' }}
            onMouseDown={(e) => onResizeStart(e, 'line-start')}
            onTouchStart={(e) => onResizeStart(e, 'line-start')}
          />
          <div 
            className="absolute bg-primary border-[1.5px] border-white z-10 w-2.5 h-2.5" 
            style={{ left: `${element.x2}%`, top: `${element.y2}%`, pointerEvents: 'auto', cursor: 'crosshair', transform: 'translate(-50%, -50%)' }}
            onMouseDown={(e) => onResizeStart(e, 'line-end')}
            onTouchStart={(e) => onResizeStart(e, 'line-end')}
          />
        </>
      )}
      {isActive && !isShape && !isLine && (
        <>
          <div
            className={`${cornerHandleClasses} -top-1 -left-1 cursor-nwse-resize`}
            onMouseDown={(e) => onResizeStart(e, 'top-left')}
            onTouchStart={(e) => onResizeStart(e, 'top-left')}
            title={element.type === 'text' ? 'Drag to resize font size' : 'Drag to resize'}
          />
          <div
            className={`${cornerHandleClasses} -top-1 -right-1 cursor-nesw-resize`}
            onMouseDown={(e) => onResizeStart(e, 'top-right')}
            onTouchStart={(e) => onResizeStart(e, 'top-right')}
            title={element.type === 'text' ? 'Drag to resize font size' : 'Drag to resize'}
          />
          <div
            className={`${cornerHandleClasses} -bottom-1 -left-1 cursor-nesw-resize`}
            onMouseDown={(e) => onResizeStart(e, 'bottom-left')}
            onTouchStart={(e) => onResizeStart(e, 'bottom-left')}
            title={element.type === 'text' ? 'Drag to resize font size' : 'Drag to resize'}
          />
          <div
            className={`${cornerHandleClasses} -bottom-1 -right-1 cursor-nwse-resize`}
            onMouseDown={(e) => onResizeStart(e, 'bottom-right')}
            onTouchStart={(e) => onResizeStart(e, 'bottom-right')}
            title={element.type === 'text' ? 'Drag to resize font size' : 'Drag to resize'}
          />
        </>
      )}
    </>
  );
}
