import { useDropdownMenu } from '../lib/useDropdownMenu.js';
import { HANDWRITING_FONTS } from '../lib/sign.js';

// CSS font-family value to preview each option in its own font. Standard-font
// values (Helvetica/TimesRoman/Courier) are pdf-lib StandardFont names, not
// real CSS families, so they're mapped to their common cross-platform stacks.
const STANDARD_FONTS = [
  { value: 'Helvetica', label: 'Helvetica', css: 'Helvetica, Arial, sans-serif' },
  { value: 'Arimo', label: 'Arial (Arimo)', css: "'Arimo', Arial, sans-serif" },
  { value: 'Assistant', label: 'Hebrew (Assistant)', css: "'Assistant', sans-serif" },
  { value: 'Heebo', label: 'Hebrew (Heebo)', css: "'Heebo', sans-serif" },
  { value: 'TimesRoman', label: 'Times Roman', css: "'Times New Roman', Times, serif" },
  { value: 'Courier', label: 'Courier', css: "'Courier New', Courier, monospace" }
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
  const { open, setOpen, containerRef, triggerRef, menuRef } = useDropdownMenu();

  const current = FONT_OPTIONS.find((f) => f.value === value) || FONT_OPTIONS[0];

  return (
    <div className="sign-tool-dropdown-container" ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        className="sign-element-btn sign-font-trigger"
        onClick={() => setOpen((o) => !o)}
        title={`Font: ${current.label}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        Aa
      </button>
      {open && (
        <>
          <div className="sign-dropdown-backdrop" onClick={() => setOpen(false)} />
          <div ref={menuRef} className="sign-dropdown-menu sign-font-menu" role="menu">
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
        </>
      )}
    </div>
  );
}
