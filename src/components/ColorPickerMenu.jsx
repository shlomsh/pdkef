import { useState } from 'preact/hooks';
import ColorPicker from './ColorPicker.jsx';
import styles from './EditorControls.module.css';
import Popover from './Popover.jsx';

// Compact trigger + popover wrapper around ColorPicker, reusing the same
// dropdown-container/backdrop/menu pattern as the saved-signatures dropdown
// (PdfSignTool.jsx) so the per-element floating toolbar only shows a single
// swatch button instead of the full palette inline.
export default function ColorPickerMenu({ value, onChange, title, defaultColor = '#000000' }) {
  const [open, setOpen] = useState(false);
  const swatchColor = value || defaultColor;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom-start"
      trigger={
        <button
          type="button"
          className={`${styles['element-button']} ${styles['color-trigger']}`}
          title={title}
          aria-haspopup="true"
          aria-expanded={open}
        >
          <span
            className={styles['color-trigger-swatch']}
            // Per-property CSSOM write, not a style="" attribute: dynamic color,
            // and element.style.* is exempt from a strict CSP style-src.
            ref={(el) => { if (el) el.style.background = swatchColor; }}
          />
        </button>
      }
      content={
        <div className={`${styles.popover} ${styles['color-menu']}`} data-editor-color-menu role="menu">
          <ColorPicker
            value={value}
            onChange={onChange}
            onClose={() => setOpen(false)}
            title={title}
            defaultColor={defaultColor}
          />
        </div>
      }
    />
  );
}
