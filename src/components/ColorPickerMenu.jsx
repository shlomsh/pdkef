import { useState } from 'preact/hooks';
import ColorPicker from './ColorPicker.jsx';
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
      placement="bottom"
      trigger={
        <button
          type="button"
          className="sign-element-btn sign-color-trigger"
          title={title}
          aria-haspopup="true"
          aria-expanded={open}
        >
          <span className="sign-color-trigger-swatch" style={{ background: swatchColor }} />
        </button>
      }
      content={
        <div className="sign-popover sign-color-menu" role="menu">
          <ColorPicker
            value={value}
            onChange={(color) => {
              onChange(color);
              setOpen(false);
            }}
            title={title}
            defaultColor={defaultColor}
          />
        </div>
      }
    />
  );
}
