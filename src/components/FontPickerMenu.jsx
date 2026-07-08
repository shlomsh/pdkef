import { useState } from 'preact/hooks';
import Popover from './Popover.jsx';
import { HANDWRITING_FONTS } from '../lib/sign.js';

// CSS font-family value to preview each option in its own font. All values
// are real bundled TTFs (see sign.js's FONT_FILES / global.css's @font-face
// rules) — every option is embedded verbatim into the exported PDF, so there's
// no separate "standard font" code path with different glyph coverage than
// what's shown on screen (Arimo/Tinos/Cousine are metric-compatible with
// Helvetica/Times New Roman/Courier New but, unlike pdf-lib's StandardFonts,
// also carry Hebrew glyphs).
const STANDARD_FONTS = [
  { value: 'Arimo', label: 'Arimo (Helvetica)', css: "'Arimo', Helvetica, Arial, sans-serif" },
  { value: 'Assistant', label: 'Hebrew (Assistant)', css: "'Assistant', sans-serif" },
  { value: 'Heebo', label: 'Hebrew (Heebo)', css: "'Heebo', sans-serif" },
  { value: 'Tinos', label: 'Tinos (Times Roman)', css: "'Tinos', 'Times New Roman', Times, serif" },
  { value: 'Cousine', label: 'Cousine (Courier)', css: "'Cousine', 'Courier New', Courier, monospace" }
];

// Same fonts bundled for the signature "type" mode (PdfSignTool.jsx), offered
// here too so text elements can use them.
const HANDWRITING_OPTIONS = HANDWRITING_FONTS.map((name) => ({
  value: name,
  label: name,
  css: `'${name}', cursive`
}));

const FONT_OPTIONS = [...STANDARD_FONTS, ...HANDWRITING_OPTIONS];

// Compact "Aa" trigger + popover list, replacing a native <select> whose
// selected-option text (e.g. "Hebrew (Assistant)") was long enough to force
// the whole per-element floating toolbar wide on its own.
export default function FontPickerMenu({ value, onChange }) {
  const [open, setOpen] = useState(false);

  const current = FONT_OPTIONS.find((f) => f.value === value) || FONT_OPTIONS[0];

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom"
      trigger={
        <button
          type="button"
          className="sign-element-btn sign-font-trigger"
          title={`Font: ${current.label}`}
          aria-haspopup="true"
          aria-expanded={open}
        >
          Aa
        </button>
      }
      content={
        <div className="flex flex-col p-2 bg-surface border border-border rounded-md shadow-lg w-max min-w-0 max-h-[15rem] overflow-y-auto z-[110] pointer-events-auto" role="menu">
          {STANDARD_FONTS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="menuitem"
              className={`sign-font-menu-item${f.value === current.value ? ' active' : ''}`}
              style={{ fontFamily: f.css }}
              onClick={() => {
                onChange(f.value);
                setOpen(false);
              }}
            >
              {f.label}
            </button>
          ))}
          <div className="sign-font-menu-group-label">Handwriting</div>
          {HANDWRITING_OPTIONS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="menuitem"
              className={`sign-font-menu-item${f.value === current.value ? ' active' : ''}`}
              style={{ fontFamily: f.css }}
              onClick={() => {
                onChange(f.value);
                setOpen(false);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      }
    />
  );
}
