// A handful of common ink colors, plus a native picker for anything else
const PRESET_COLORS = ['#000000', '#d8342b', '#1463ff', '#1a8f54', '#112d4e', '#ffffff'];

export default function ColorPicker({ value, onChange, onClose, title, defaultColor = '#000000' }) {
  return (
    <div className="sign-color-picker">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`sign-color-swatch${(value || defaultColor) === c ? ' active' : ''}`}
          style={{ background: c }}
          onClick={() => {
            onChange(c);
            if (onClose) onClose();
          }}
          title={c}
        />
      ))}
      <span className="sign-color-divider" aria-hidden="true" />
      <input
        type="color"
        className="sign-color-input"
        value={value || defaultColor}
        onChange={(e) => onChange(e.target.value)}
        title={title}
      />
    </div>
  );
}
