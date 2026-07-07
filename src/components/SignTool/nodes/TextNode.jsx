import { useState, useLayoutEffect, useRef, useEffect } from 'preact/hooks';
import ElementResizers from '../../ElementResizers.jsx';
import usePdfCoordinates from '../../../lib/usePdfCoordinates.js';
import { getEffectiveTextDirection } from '../../../lib/sign.js';

export default function TextNode({ element, isActive, onChange, onSelect, onResizeStart, pageWidthPoints }) {
  const [scaleFactor, setScaleFactor] = useState(1);
  const { getScaleFactor } = usePdfCoordinates();
  const textRef = useRef(null);
  const textareaRef = useRef(null);

  useLayoutEffect(() => {
    const pageWrapper = textRef.current?.closest('.sign-page-wrapper') || null;
    if (!pageWrapper) return;
    const updateScale = () => {
      setScaleFactor(getScaleFactor(pageWrapper, pageWidthPoints));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(pageWrapper);
    return () => observer.disconnect();
  }, [pageWidthPoints, getScaleFactor]);

  useEffect(() => {
    if (isActive && textareaRef.current) {
      if (document.activeElement !== textareaRef.current) {
        textareaRef.current.focus();
        const len = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(len, len);
      }
    }
  }, [
    isActive,
    element.fontFamily,
    element.fontSize,
    element.color,
    element.fontWeight,
    element.fontStyle,
    element.textDirection
  ]);

  const textFontSize = (element.fontSize || 12) * scaleFactor;
  const textDirection = getEffectiveTextDirection(element);

  return (
    <>
      <div ref={textRef} className="sign-text-display" style={{ fontSize: `${textFontSize}px` }}>
        <div
          className="sign-text-measure"
          dir={textDirection}
          style={{
            fontSize: `${textFontSize}px`,
            fontFamily: element.fontFamily || 'Arimo',
            fontWeight: element.fontWeight || 'normal',
            fontStyle: element.fontStyle || 'normal'
          }}
        >
          {(element.text || 'Click to edit') + '\u200B'}
        </div>
        <textarea
          ref={textareaRef}
          dir={textDirection}
          rows={1}
          cols={1}
          className="sign-text-input"
          value={element.text}
          placeholder="Click to edit"
          onInput={(e) => onChange({ text: e.currentTarget.value })}
          onFocus={onSelect}
          style={{
            textAlign: textDirection === 'rtl' ? 'right' : 'left',
            fontSize: `${textFontSize}px`,
            fontFamily: element.fontFamily || 'Arimo',
            fontWeight: element.fontWeight || 'normal',
            fontStyle: element.fontStyle || 'normal',
            color: element.color || '#000000'
          }}
        />
      </div>
      <ElementResizers 
        element={element}
        isActive={isActive}
        isShape={false}
        isLine={false}
        onResizeStart={onResizeStart}
      />
    </>
  );
}
