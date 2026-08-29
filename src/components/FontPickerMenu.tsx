import { useEffect, useRef, useState } from 'preact/hooks';
import Popover from './Popover.tsx';
import styles from './EditorControls.module.css';
import { HANDWRITING_FONTS, TEXT_FONTS } from '../lib/fonts.js';
import { getFontSupport, quoteText } from '../lib/textFontSupport.js';

export const FONT_PREVIEW_DELAY_MS = 120;

const SERIF_FONTS = new Set(['Tinos', 'Scheherazade New']);
const MONO_FONTS = new Set(['Cousine']);
const collator = new Intl.Collator('en', { sensitivity: 'base' });

function cssFamily(family: string) {
  const generic = HANDWRITING_FONTS.includes(family)
    ? 'cursive'
    : MONO_FONTS.has(family)
      ? 'monospace'
      : SERIF_FONTS.has(family)
        ? 'serif'
        : 'sans-serif';
  return `'${family}', ${generic}`;
}

// The catalogue is the source of truth. Labels are canonical family names,
// rather than a mixture of language names and metric-compatible aliases, and
// one alphabetic sort applies to both upright and handwriting faces.
const FONT_OPTIONS = [...new Set([...TEXT_FONTS, ...HANDWRITING_FONTS])]
  .sort(collator.compare)
  .map((family) => ({ value: family, label: family, css: cssFamily(family) }));

export default function FontPickerMenu({
  value,
  text = '',
  drawnText = text,
  fontWeight = 'normal',
  fontStyle = 'normal',
  onChange,
  onPreview,
  onPreviewEnd,
}: {
  value?: string;
  text?: string;
  drawnText?: string;
  fontWeight?: string;
  fontStyle?: string;
  onChange: (font: string) => void;
  onPreview?: (font: string) => void;
  onPreviewEnd?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const previewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const current = FONT_OPTIONS.find((font) => font.value === value) || FONT_OPTIONS[0];
  const options = open ? FONT_OPTIONS.map((font) => ({
    ...font,
    support: getFontSupport(font.value, text, fontWeight, fontStyle, drawnText),
  })) : [];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleOptions = normalizedQuery
    ? options.filter(({ value: family }) => family.toLocaleLowerCase().includes(normalizedQuery))
    : options;

  const clearPreviewTimer = () => {
    clearTimeout(previewTimer.current);
    previewTimer.current = undefined;
  };

  const handleOpenChange = (nextOpen: boolean) => {
    clearPreviewTimer();
    setOpen(nextOpen);
    if (!nextOpen) {
      setQuery('');
      onPreviewEnd?.();
    }
  };

  const schedulePreview = (family: string) => {
    clearPreviewTimer();
    previewTimer.current = setTimeout(() => onPreview?.(family), FONT_PREVIEW_DELAY_MS);
  };

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => () => clearPreviewTimer(), []);

  const renderOption = (font: typeof options[number]) => {
    const { family, missing, status } = font.support;
    const incomplete = missing.length > 0;
    const isActive = font.value === current.value;
    const classNames = [
      styles['font-menu-item'],
      isActive && styles.active,
      incomplete && styles['font-menu-item-unsupported'],
    ].filter(Boolean).join(' ');
    return (
      <button
        key={font.value}
        type="button"
        role="option"
        aria-selected={isActive}
        data-font-name={font.value}
        data-font-support={status}
        className={classNames}
        style={{ fontFamily: font.css }}
        onMouseEnter={() => schedulePreview(font.value)}
        onMouseLeave={clearPreviewTimer}
        onFocus={() => schedulePreview(font.value)}
        onBlur={clearPreviewTimer}
        onClick={() => {
          clearPreviewTimer();
          onChange(font.value);
          handleOpenChange(false);
        }}
      >
        {font.label}
        {drawnText && incomplete && <span className={styles['font-menu-item-note']}>
          Some characters in {quoteText(text)} aren’t available in {font.label}.
          {status === 'fallback' ? ` Using ${family} instead.` : ''}
        </span>}
      </button>
    );
  };

  return (
    <Popover
      open={open}
      onOpenChange={handleOpenChange}
      placement="bottom"
      stablePosition
      trigger={
        <button
          type="button"
          className={`${styles['element-button']} ${styles['font-trigger']}`}
          title={`Font: ${current.label}`}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          Aa
        </button>
      }
      content={
        <div
          className={`${styles.popover} ${styles['font-menu']}`}
          data-font-picker-menu
          onMouseLeave={() => {
            clearPreviewTimer();
            onPreviewEnd?.();
          }}
        >
          <input
            ref={searchRef}
            type="search"
            value={query}
            className={styles['font-menu-search']}
            placeholder="Search fonts"
            aria-label="Search fonts"
            onInput={(event) => {
              clearPreviewTimer();
              onPreviewEnd?.();
              setQuery(event.currentTarget.value);
            }}
          />
          <div className={styles['font-menu-options']} role="listbox" aria-label="Fonts">
            {visibleOptions.map(renderOption)}
            {visibleOptions.length === 0 && <p className={styles['font-menu-empty']}>No fonts found.</p>}
          </div>
        </div>
      }
    />
  );
}
