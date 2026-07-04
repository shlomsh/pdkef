import { PilcrowLeft, PilcrowRight } from 'lucide-preact';
import ColorPickerMenu from './ColorPickerMenu.jsx';
import FontPickerMenu from './FontPickerMenu.jsx';
import ThicknessPickerMenu from './ThicknessPickerMenu.jsx';
import { getEffectiveTextDirection } from '../lib/sign.js';

export default function ElementToolbar({
  element,
  onChange,
  onClone,
  onDelete
}) {
  const textDirection = element.type === 'text' ? getEffectiveTextDirection(element) : 'ltr';
  // element.type is the geometry discriminator directly (no shape/shapeType wrapper).
  const actualType = element.type;
  const isLine = actualType === 'line';
  const isShape = actualType === 'ellipse' || actualType === 'rectangle';

  return (
    <>
      {element.type === 'text' && (
        <>
          <FontPickerMenu
            value={element.fontFamily || 'Helvetica'}
            onChange={(fontFamily) => onChange({ fontFamily })}
          />
          <div className="sign-toolbar-divider" />
          <button
            type="button"
            className="sign-element-btn"
            onClick={() => onChange({ fontSize: Math.max(6, (element.fontSize || 12) - 1) })}
            title="Decrease font size"
          >
            A-
          </button>
          <button
            type="button"
            className="sign-element-btn"
            onClick={() => onChange({ fontSize: Math.min(72, (element.fontSize || 12) + 1) })}
            title="Increase font size"
          >
            A+
          </button>
          <div className="sign-toolbar-divider" />
          <button
            type="button"
            className={`sign-element-btn ${element.fontWeight === 'bold' ? 'active' : ''}`}
            onClick={() => onChange({ fontWeight: element.fontWeight === 'bold' ? 'normal' : 'bold' })}
            title="Bold"
          >
            <b>B</b>
          </button>
          <button
            type="button"
            className={`sign-element-btn ${element.fontStyle === 'italic' ? 'active' : ''}`}
            onClick={() => onChange({ fontStyle: element.fontStyle === 'italic' ? 'normal' : 'italic' })}
            title="Italic"
          >
            <i>I</i>
          </button>
          <div className="sign-toolbar-divider" />
          <button
            type="button"
            className={`sign-element-btn ${textDirection === 'rtl' ? 'active' : ''}`}
            onClick={() => onChange({ textDirection: textDirection === 'rtl' ? 'ltr' : 'rtl' })}
            title={
              textDirection === 'rtl'
                ? 'Right-to-left text (Hebrew/Arabic) — click to switch to left-to-right'
                : 'Left-to-right text — click to switch to right-to-left (Hebrew/Arabic)'
            }
          >
            {textDirection === 'rtl' ? (
              <PilcrowLeft size={14} strokeWidth={2.5} />
            ) : (
              <PilcrowRight size={14} strokeWidth={2.5} />
            )}
          </button>
          <div className="sign-toolbar-divider" />
          <ColorPickerMenu
            value={element.color}
            onChange={(color) => onChange({ color })}
            title="Text color"
            defaultColor="#000000"
          />
          <div className="sign-toolbar-divider" />
        </>
      )}
      {element.type === 'symbol' && (
        <>
          <button
            type="button"
            className={`sign-element-btn ${(element.mark || 'check') === 'check' ? 'active' : ''}`}
            onClick={() => onChange({ mark: 'check' })}
            title="Check mark"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
          <button
            type="button"
            className={`sign-element-btn ${element.mark === 'x' ? 'active' : ''}`}
            onClick={() => onChange({ mark: 'x' })}
            title="X mark"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
              <line x1="5" y1="5" x2="19" y2="19" />
              <line x1="19" y1="5" x2="5" y2="19" />
            </svg>
          </button>
          <button
            type="button"
            className={`sign-element-btn ${element.mark === 'dot' ? 'active' : ''}`}
            onClick={() => onChange({ mark: 'dot' })}
            title="Dot mark"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <circle cx="12" cy="12" r="7" />
            </svg>
          </button>
          <div className="sign-toolbar-divider" />
          <ColorPickerMenu
            value={element.color}
            onChange={(color) => onChange({ color })}
            title="Checkbox color"
            defaultColor="#1463ff"
          />
          <div className="sign-toolbar-divider" />
        </>
      )}
      {(isShape || isLine) && (
        <>
          <button
            type="button"
            className={`sign-element-btn ${actualType === 'ellipse' ? 'active' : ''}`}
            onClick={() => {
              if (actualType === 'line') {
                onChange({ type: 'ellipse', left: Math.min(element.x1, element.x2), top: Math.min(element.y1, element.y2), width: Math.max(Math.abs(element.x2 - element.x1), 4), height: Math.max(Math.abs(element.y2 - element.y1), 4) });
              } else {
                onChange({ type: 'ellipse' });
              }
            }}
            title="Ellipse"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <ellipse cx="12" cy="12" rx="10" ry="7" />
            </svg>
          </button>
          <button
            type="button"
            className={`sign-element-btn ${actualType === 'rectangle' ? 'active' : ''}`}
            onClick={() => {
              if (actualType === 'line') {
                onChange({ type: 'rectangle', left: Math.min(element.x1, element.x2), top: Math.min(element.y1, element.y2), width: Math.max(Math.abs(element.x2 - element.x1), 4), height: Math.max(Math.abs(element.y2 - element.y1), 4) });
              } else {
                onChange({ type: 'rectangle' });
              }
            }}
            title="Rectangle"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <rect x="3" y="6" width="18" height="12" rx="2" />
            </svg>
          </button>
          <button
            type="button"
            className={`sign-element-btn ${actualType === 'line' ? 'active' : ''}`}
            onClick={() => {
              if (actualType !== 'line') {
                onChange({ type: 'line', x1: element.left, y1: element.top + (element.height || 6)/2, x2: element.left + (element.width || 12), y2: element.top + (element.height || 6)/2 });
              }
            }}
            title="Line"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="4" y1="20" x2="20" y2="4" />
            </svg>
          </button>
          <div className="sign-toolbar-divider" />
          <ThicknessPickerMenu
            value={element.strokeWidth}
            onChange={(strokeWidth) => onChange({ strokeWidth })}
            title="Line thickness"
          />
          <ColorPickerMenu
            value={element.color}
            onChange={(color) => onChange({ color })}
            title="Shape color"
            defaultColor="#1463ff"
          />
          <div className="sign-toolbar-divider" />
        </>
      )}
      {element.type === 'signature' && (
        <>
          <ColorPickerMenu
            value={element.color}
            onChange={(color) => onChange({ color })}
            title="Signature color"
            defaultColor="#000000"
          />
          <div className="sign-toolbar-divider" />
        </>
      )}
      {element.type === 'whiteout' && (
        <>
          <ColorPickerMenu
            value={element.color}
            onChange={(color) => onChange({ color })}
            title="Whiteout color"
            defaultColor="#ffffff"
          />
          <div className="sign-toolbar-divider" />
        </>
      )}
      <button
        type="button"
        className="sign-element-btn"
        onClick={() => {
          const newId = `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          onClone({
            ...element,
            id: newId,
            left: Math.min(90, element.left + 4),
            top: Math.min(90, element.top + 4)
          });
        }}
        title="Duplicate element"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>
      <button
        type="button"
        className="sign-element-btn sign-element-btn-danger"
        onClick={onDelete}
        title="Delete element"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </>
  );
}
