import { useState, useLayoutEffect, useRef, useEffect } from 'preact/hooks';
import ElementResizers from '../../ElementResizers.jsx';
import usePdfCoordinates from '../../../lib/usePdfCoordinates.js';
import { getEffectiveTextDirection } from '../../../lib/sign.js';
import { DEFAULT_FONT_SIZE_PT } from '../../../constants/signGeometry.js';


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
  }, [pageWidthPoints]);

  useEffect(() => {
    if (!isActive || !textareaRef.current) return;

    const activeEl = document.activeElement;
    const isToolbarFocused = activeEl && (activeEl.closest('.sign-element-actions') || activeEl.closest('.sign-popover'));
    const isTextareaFocused = activeEl === textareaRef.current;

    if (element.autoFocus || isToolbarFocused) {
      if (!isTextareaFocused) {
        textareaRef.current.focus();
        const len = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(len, len);
      }
      if (element.autoFocus) {
        onChange({ autoFocus: undefined });
      }
    }
  }, [
    isActive,
    element.autoFocus,
    element.fontFamily,
    element.fontSize,
    element.color,
    element.fontWeight,
    element.fontStyle,
    element.textDirection,
    onChange
  ]);

  const textFontSize = (element.fontSize || DEFAULT_FONT_SIZE_PT) * scaleFactor;
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
