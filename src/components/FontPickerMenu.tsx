import { useState } from 'preact/hooks';
import Popover from './Popover.tsx';
import styles from './EditorControls.module.css';
import { HANDWRITING_FONTS } from '../lib/sign.js';
import { resolveFontSubstitution } from '../lib/fonts.js';

// CSS font-family value to preview each option in its own font. All values
// are real bundled TTFs (see sign.js's FONT_FILES / editorFonts.css's
// @font-face rules) — every option is embedded verbatim into the exported PDF, so there's
// no separate "standard font" code path with different glyph coverage than
// what's shown on screen (Arimo/Tinos/Cousine are metric-compatible with
// Helvetica/Times New Roman/Courier New but, unlike pdf-lib's StandardFonts,
// also carry Hebrew glyphs).
const STANDARD_FONTS = [
  { value: 'Arimo', label: 'Arimo (Helvetica)', css: "'Arimo', Helvetica, Arial, sans-serif" },
  { value: 'Assistant', label: 'Hebrew (Assistant)', css: "'Assistant', sans-serif" },
  { value: 'Heebo', label: 'Hebrew (Heebo)', css: "'Heebo', sans-serif" },
  { value: 'Alef', label: 'Hebrew (Alef)', css: "'Alef', sans-serif" },
  { value: 'PT Sans', label: 'Cyrillic (PT Sans)', css: "'PT Sans', sans-serif" },
  { value: 'Almarai', label: 'Arabic (Almarai)', css: "'Almarai', sans-serif" },
  { value: 'Tinos', label: 'Tinos (Times Roman)', css: "'Tinos', 'Times New Roman', Times, serif" },
  { value: 'Cousine', label: 'Cousine (Courier)', css: "'Cousine', 'Courier New', Courier, monospace" }
];

// Same fonts bundled for the signature "type" mode (PdfSignTool.tsx), offered
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
//
// `value` is the EFFECTIVE font (resolveFontFamily's output, passed in by
// ElementToolbar) so the checkmark lands on what's actually rendered and
// embedded, never on a picked font that got silently substituted. `text` is
// the element's current content — each option re-runs the same substitution
// rule against it (resolveFontSubstitution) so a font that can't draw this
// text is labeled right here, using the exact rule that decided the
// substitution, rather than a second guess at it.
export default function FontPickerMenu({ value, text, onChange }: { value?: string; text?: string; onChange: (font: string) => void }) {
  const [open, setOpen] = useState(false);

  const current = FONT_OPTIONS.find((f) => f.value === value) || FONT_OPTIONS[0];

  const renderOption = (f: { value: string; label: string; css: string }) => {
    // W3 (docs/wysiwyg-text-architecture.md §3.2): resolveFontSubstitution
    // now judges real glyph coverage rather than naming a script row, so
    // "picking this font would change under the text" is `family !== f.value`
    // (a substitution would happen), and `missing` names the characters that
    // forced it.
    const { family, missing } = resolveFontSubstitution(f.value, text || '');
    const wouldSubstitute = family !== f.value;
    const isActive = f.value === current.value;
    const classNames = [
      styles['font-menu-item'],
      isActive && styles.active,
      wouldSubstitute && styles['font-menu-item-unsupported']
    ].filter(Boolean).join(' ');
    return (
      <button
        key={f.value}
        type="button"
        role="menuitem"
        className={classNames}
        style={{ fontFamily: f.css }}
        onClick={() => {
          onChange(f.value);
          setOpen(false);
        }}
      >
        {f.label}
        {wouldSubstitute && <span className={styles['font-menu-item-note']}> · can't draw {missing.join(', ')}</span>}
      </button>
    );
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom"
      trigger={
        <button
          type="button"
          className={`${styles['element-button']} ${styles['font-trigger']}`}
          title={`Font: ${current.label}`}
          aria-haspopup="true"
          aria-expanded={open}
        >
          Aa
        </button>
      }
      content={
        <div className={`${styles.popover} ${styles['font-menu']}`} role="menu">
          {STANDARD_FONTS.map(renderOption)}
          <div className={styles['font-menu-group-label']}>Handwriting</div>
          {HANDWRITING_OPTIONS.map(renderOption)}
        </div>
      }
    />
  );
}
