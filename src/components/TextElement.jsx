export default function TextElement({
  element,
  textFontSize,
  textDirection,
  onChange,
  onSelect
}) {
  return (
    <div className="sign-text-display" style={{ fontSize: `${textFontSize}px` }}>
      <div
        className="sign-text-measure"
        dir={textDirection}
        style={{
          fontSize: `${textFontSize}px`,
          fontFamily: element.fontFamily || 'Helvetica',
          fontWeight: element.fontWeight || 'normal',
          fontStyle: element.fontStyle || 'normal'
        }}
      >
        {(element.text || 'Click to edit') + '\u200B'}
      </div>
      <textarea
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
          fontFamily: element.fontFamily || 'Helvetica',
          fontWeight: element.fontWeight || 'normal',
          fontStyle: element.fontStyle || 'normal',
          color: element.color || '#000000'
        }}
      />
    </div>
  );
}
