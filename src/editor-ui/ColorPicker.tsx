import { useRef } from 'preact/hooks';
import styles from './EditorControls.module.css';
import { useNativeChange } from './useNativeChange.ts';
import { PRESET_COLORS } from './colorNames.ts';

export default function ColorPicker({ value, onChange, onClose, title, defaultColor = '#000000', presets = PRESET_COLORS, names }: {
  value?: string;
  onChange: (color: string) => void;
  onClose?: () => void;
  title?: string;
  defaultColor?: string;
  presets?: readonly string[];
  /** Plain color names keyed by preset hex, for the swatch tooltip and accessible name. */
  names?: Readonly<Record<string, string>>;
}) {
  // One commit per choice: compat turns a JSX onChange into the per-drag-step `input` event.
  const colorInput = useRef<HTMLInputElement>(null);
  useNativeChange(colorInput, (el) => onChange(el.value));
  return (
    <div className={styles['color-picker']}>
      {presets.map((c) => (
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
          title={names?.[c] ?? c}
          aria-label={names?.[c] ?? c}
        />
      ))}
      <span className={styles['color-divider']} aria-hidden="true" />
      <input
        type="color"
        className={styles['color-input']}
        value={value || defaultColor}
        ref={colorInput}
        title={title}
      />
    </div>
  );
}
