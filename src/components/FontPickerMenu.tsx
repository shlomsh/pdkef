import { useState } from 'preact/hooks';
import Popover from './Popover.tsx';
import styles from './EditorControls.module.css';
import { HANDWRITING_FONTS } from '../lib/sign.js';
import { getFontSupport, getTextFontSupport, describeTextFontSupport, quoteText } from '../lib/textFontSupport.js';

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
  { value: 'Scheherazade New', label: 'Arabic (Scheherazade New)', css: "'Scheherazade New', serif" },
  { value: 'Noto Sans JP', label: 'Japanese (Noto Sans JP)', css: "'Noto Sans JP', sans-serif" },
  { value: 'Noto Sans SC', label: 'Chinese, Simplified (Noto Sans SC)', css: "'Noto Sans SC', sans-serif" },
  { value: 'Noto Sans TC', label: 'Chinese, Traditional (Noto Sans TC)', css: "'Noto Sans TC', sans-serif" },
  { value: 'Noto Sans KR', label: 'Korean (Noto Sans KR)', css: "'Noto Sans KR', sans-serif" },
  { value: 'Noto Sans Bengali', label: 'Bengali (Noto Sans Bengali)', css: "'Noto Sans Bengali', sans-serif" },
  { value: 'Mukta Mahee', label: 'Punjabi (Mukta Mahee)', css: "'Mukta Mahee', sans-serif" },
  { value: 'Anek Telugu', label: 'Telugu (Anek Telugu)', css: "'Anek Telugu', sans-serif" },
  { value: 'Noto Sans Tamil', label: 'Tamil (Noto Sans Tamil)', css: "'Noto Sans Tamil', sans-serif" },
  { value: 'IBM Plex Sans Thai', label: 'Thai (IBM Plex Sans Thai)', css: "'IBM Plex Sans Thai', sans-serif" },
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
export default function FontPickerMenu({ value, text = '', drawnText = text, fontWeight = 'normal', fontStyle = 'normal', onChange }: {
  value?: string;
  text?: string;
  drawnText?: string;
  fontWeight?: string;
  fontStyle?: string;
  onChange: (font: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const current = FONT_OPTIONS.find((f) => f.value === value) || FONT_OPTIONS[0];
  // Compute once per render, and only while open. The closed menus on other
  // elements must not scan every font on every keystroke.
  const options = open ? FONT_OPTIONS.map((font) => ({
    ...font,
    support: getFontSupport(font.value, text, fontWeight, fontStyle, drawnText),
  })) : [];
  const hasMatchingFont = options.some(({ support }) => support.missing.length === 0);
  const repairGuidance = open && !hasMatchingFont
    ? describeTextFontSupport(getTextFontSupport({ text: drawnText, fontFamily: value, fontWeight, fontStyle }))
    : '';

  const renderOption = (f: typeof options[number]) => {
    const { family, missing, status } = f.support;
    const incomplete = missing.length > 0;
    const isActive = f.value === current.value;
    const classNames = [
      styles['font-menu-item'],
      isActive && styles.active,
      incomplete && styles['font-menu-item-unsupported']
    ].filter(Boolean).join(' ');
    return (
      <button
        key={f.value}
        type="button"
        role="menuitem"
        aria-current={isActive ? 'true' : undefined}
        data-font-support={status}
        className={classNames}
        style={{ fontFamily: f.css }}
        onClick={() => {
          onChange(f.value);
          setOpen(false);
        }}
      >
        {f.label}
        {drawnText && <span className={styles['font-menu-item-note']}>
          {incomplete
            ? `Missing ${quoteText(missing.join(''))}. ${status === 'fallback' ? `Uses ${family} automatically.` : 'Does not include all your text.'}`
            : 'Includes all your text'}
        </span>}
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
          {drawnText && <p className={styles['font-menu-help']} role="presentation">
            {hasMatchingFont
              ? 'Fonts marked “Includes all your text” work as chosen. Other choices use the matching font shown.'
              : repairGuidance}
          </p>}
          {options.slice(0, STANDARD_FONTS.length).map(renderOption)}
          <div className={styles['font-menu-group-label']}>Handwriting</div>
          {options.slice(STANDARD_FONTS.length).map(renderOption)}
        </div>
      }
    />
  );
}
