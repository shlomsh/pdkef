import styles from './EditorControls.module.css';

// A handful of common ink colors, plus a native picker for anything else
const PRESET_COLORS = ['#000000', '#d8342b', '#1463ff', '#1a8f54', '#112d4e', '#ffffff'];

export default function ColorPicker({ value, onChange, onClose, title, defaultColor = '#000000' }) {
  return (
    <div className={styles['color-picker']}>
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`${styles['color-swatch']}${(value || defaultColor) === c ? ` ${styles.active}` : ''}`}
          data-editor-color-swatch
          // Per-property CSSOM write (not an inline style="" attribute): the
          // color is dynamic so it can't be a static class, and a strict CSP
          // style-src blocks style attributes but not element.style.* writes.
          ref={(el) => { if (el) el.style.background = c; }}
          onClick={() => {
            onChange(c);
            if (onClose) onClose();
          }}
          title={c}
        />
      ))}
      <span className={styles['color-divider']} aria-hidden="true" />
      <input
        type="color"
        className={styles['color-input']}
        value={value || defaultColor}
        onChange={(e) => onChange(e.target.value)}
        title={title}
      />
    </div>
  );
}
