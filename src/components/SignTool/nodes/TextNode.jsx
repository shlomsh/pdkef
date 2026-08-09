import { useState, useLayoutEffect, useRef, useEffect } from 'preact/hooks';
import ElementResizers from '../../ElementResizers.jsx';
import usePdfCoordinates from '../../../lib/usePdfCoordinates.js';
import { getEffectiveTextDirection } from '../../../lib/signHelpers.js';
import { DEFAULT_FONT_SIZE_PT } from '../../../constants/signGeometry.js';
import { resolveFontFamily } from '../../../lib/fonts.js';
import workspaceStyles from '../Workspace.module.css';
import elementStyles from '../EditorElement.module.css';


export default function TextNode({ element, isActive, isEditing, onChange, onSelect, onBeginEdit, onResizeStart, pageWidthPoints }) {
  const [scaleFactor, setScaleFactor] = useState(1);
  const { getScaleFactor } = usePdfCoordinates();
  const textRef = useRef(null);
  const textareaRef = useRef(null);

  useLayoutEffect(() => {
    const pageWrapper = textRef.current?.closest(`.${workspaceStyles['page-wrapper']}`) || null;
    if (!pageWrapper) return;
    const updateScale = () => {
      setScaleFactor(getScaleFactor(pageWrapper, pageWidthPoints));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(pageWrapper);
    return () => observer.disconnect();
  }, [pageWidthPoints]);

  // The caret follows the edit session, not the selection. Two things open one:
  // starting to edit (created, double-clicked, Enter), and returning from the
  // floating toolbar - clicking A+ or a colour moves focus out of the textarea,
  // and typing has to continue where it left off afterwards.
  useEffect(() => {
    if (!isEditing || !textareaRef.current) return;
    if (document.activeElement === textareaRef.current) return;

    textareaRef.current.focus();
    const len = textareaRef.current.value.length;
    textareaRef.current.setSelectionRange(len, len);
  }, [
    isEditing,
    element.fontFamily,
    element.fontSize,
    element.color,
    element.fontWeight,
    element.fontStyle,
    element.textDirection
  ]);

  const textFontSize = (element.fontSize || DEFAULT_FONT_SIZE_PT) * scaleFactor;
  const textDirection = getEffectiveTextDirection(element);
  // Render the family the exporter will embed, not the one that was picked, so
  // the browser never quietly patches in a system font for glyphs the chosen
  // file lacks — that fallback is what a PDF cannot reproduce.
  const renderedFontFamily = resolveFontFamily(element.fontFamily, element.text);
  // Shown in the empty box, and measured to size it. One string for both, so the
  // box can never be sized against copy it isn't showing.
  const placeholder = isEditing ? 'Type your text' : 'Double-click to edit';

  return (
    <>
      <div
        ref={textRef}
        className={elementStyles['text-display']}
        data-editor-text-display
        style={{ fontSize: `${textFontSize}px` }}
        onDblClick={onBeginEdit}
      >
        <div
          className={elementStyles['text-measure']}
          data-editor-text-measure
          dir={textDirection}
          style={{
            fontSize: `${textFontSize}px`,
            fontFamily: renderedFontFamily,
            fontWeight: element.fontWeight || 'normal',
            fontStyle: element.fontStyle || 'normal'
          }}
        >
          {(element.text || placeholder) + '\u200B'}
        </div>
        {/* Outside an edit session the textarea is inert: it cannot take the
            caret by click (pointer-events, via the class) or by Tab (tabIndex),
            and cannot be typed into (readOnly). That is what frees a plain click
            to select the element and Backspace to delete it, and it hands
            mousedown to the wrapper so a selected box can be dragged from
            anywhere - previously the textarea swallowed it. */}
        <textarea
          ref={textareaRef}
          dir={textDirection}
          rows={1}
          cols={1}
          className={`${elementStyles['text-input']}${isEditing ? '' : ` ${elementStyles['text-input-inert']}`}`}
          data-editor-text-input
          readOnly={!isEditing}
          tabIndex={isEditing ? undefined : -1}
          value={element.text}
          placeholder={placeholder}
          onInput={(e) => onChange({ text: e.currentTarget.value })}
          onFocus={onSelect}
          style={{
            textAlign: textDirection === 'rtl' ? 'right' : 'left',
            fontSize: `${textFontSize}px`,
            fontFamily: renderedFontFamily,
            fontWeight: element.fontWeight || 'normal',
            fontStyle: element.fontStyle || 'normal',
            color: element.color || '#000000'
          }}
        />
      </div>
      <ElementResizers
        // Older text fixtures predate the flat `type` discriminant. The node
        // itself is the authoritative type boundary, so preserve that input
        // compatibility while the registry remains type-driven.
        element={{ ...element, type: 'text' }}
        isActive={isActive}
        onResizeStart={onResizeStart}
      />
    </>
  );
}
