import { useState } from 'preact/hooks';
import ColorPicker from './ColorPicker.tsx';
import styles from './EditorControls.module.css';
import Popover from '../shell/Popover.tsx';

// Compact trigger + popover wrapper around ColorPicker, reusing the same
// dropdown-container/backdrop/menu pattern as the saved-signatures dropdown
// (PdfSignTool.tsx) so the per-element floating toolbar only shows a single
// swatch button instead of the full palette inline.
export default function ColorPickerMenu({ value, onChange, title, defaultColor = '#000000' }: { value?: string; onChange: (color: string) => void; title?: string; defaultColor?: string }) {
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
          <svg className={styles['color-trigger-caret']} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
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
