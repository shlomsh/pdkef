import { useEffect, useRef, useState } from 'preact/hooks';
import { offset, flip, shift } from '@floating-ui/react';
import Popover from '../shell/Popover.tsx';
import styles from './EditorControls.module.css';
import { FONT_STYLE_TAGS, HANDWRITING_FONTS, TEXT_FONTS } from '../editor/text/fonts.js';
import { getFontSupport } from '../editor/text/textFontSupport.js';
import { englishSignMessages, formatMessage } from '../i18n/toolMessages';
import type { SignMessages } from '../editor/registry/messages';
import visualViewportClamp, { getStickyToolShellRect } from './hooks/visualViewportClamp.ts';

export const FONT_PREVIEW_DELAY_MS = 120;

// SNG-17: hoisted so the middleware array is not rebuilt every render (every
// factory here is pure, so one instance is fine to reuse across opens/closes).
// The list opens beside the element (`right-start`, against the closest
// `[data-editor-element]` via `anchorClosest`) so it never covers the text
// being styled; `flip` swaps to the other side near a page edge; `shift` only
// slides along that side (vertical for left/right placements, `crossAxis`) and
// is never allowed to slide onto the element itself (`mainAxis: false`), so
// the list can only fall back to below/above when neither side fits at all.
// `counterScaled: false` because the font list carries no CSS counter-scale
// transform, unlike Sign/Redact's own floating toolbar.
const FONT_MENU_MIDDLEWARE = [
  offset(8),
  flip({ fallbackPlacements: ['left-start', 'bottom-start', 'top-start'], crossAxis: false }),
  shift({ crossAxis: true, mainAxis: false, padding: 5 }),
  visualViewportClamp({ counterScaled: false, getExcludedRect: getStickyToolShellRect }),
];

const collator = new Intl.Collator('en', { sensitivity: 'base' });

function cssFamily(family: string) {
  const generic = FONT_STYLE_TAGS[family] === 'handwriting'
    ? 'cursive'
    : FONT_STYLE_TAGS[family] === 'mono'
      ? 'monospace'
      : FONT_STYLE_TAGS[family] === 'serif'
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
  messages,
}: {
  value?: string;
  text?: string;
  drawnText?: string;
  fontWeight?: string;
  fontStyle?: string;
  onChange: (font: string) => void;
  onPreview?: (font: string) => void;
  onPreviewEnd?: () => void;
  /** LOC-16 stage 2-5: optional and English-default, same shape as
   * SignToolbar.tsx's `messages` prop. */
  messages?: Partial<SignMessages>;
}) {
  const t: SignMessages = { ...englishSignMessages, ...messages };
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

  // Whether a family needs to be fetched for offline use is no longer a
  // decision surfaced here - it happens quietly in the background as soon as
  // it's actually used (useAutoFontProvisioning). Keeping that out of this
  // list is what leaves room for the font preview while scrolling.
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
          {status === 'fallback' ? formatMessage(t.fallbackFontNoteTemplate, { family }) : t.doesntSupportText}
        </span>}
      </button>
    );
  };

  return (
    <Popover
      open={open}
      onOpenChange={handleOpenChange}
      // SNG-17: anchored to the element being styled, not the toolbar, so it
      // opens beside the element and never hides the text underneath it -
      // opening under the toolbar could land the list over the element near
      // a page edge, where `shift()` had nowhere else to push it. `flip`
      // above swaps to the other side there instead.
      anchorClosest="[data-editor-element]"
      placement="right-start"
      middleware={FONT_MENU_MIDDLEWARE}
      trigger={
        <button
          type="button"
          className={`${styles['element-button']} ${styles['font-trigger']}`}
          title={formatMessage(t.fontTriggerTitleTemplate, { name: current.label })}
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
            placeholder={t.searchFontsPlaceholder}
            aria-label={t.searchFontsPlaceholder}
            onInput={(event) => {
              clearPreviewTimer();
              onPreviewEnd?.();
              setQuery(event.currentTarget.value);
            }}
          />
          <div className={styles['font-menu-options']} role="listbox" aria-label={t.fontsListAriaLabel}>
            {visibleOptions.map(renderOption)}
            {visibleOptions.length === 0 && <p className={styles['font-menu-empty']}>{t.noFontsFound}</p>}
          </div>
        </div>
      }
    />
  );
}
