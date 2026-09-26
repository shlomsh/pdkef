import styles from './EditorControls.module.css';
import { FONT_STYLE_TAGS, HANDWRITING_FONTS, TEXT_FONTS } from '../editor/text/fonts.js';
import { getFontSupport } from '../editor/text/textFontSupport.js';
import { formatMessage } from '../i18n/toolMessages';
import type { SignMessages } from '../editor/registry/messages';

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
export const FONT_OPTIONS = [...new Set([...TEXT_FONTS, ...HANDWRITING_FONTS])]
  .sort(collator.compare)
  .map((family) => ({ value: family, label: family, css: cssFamily(family) }));

export type FontOptionEntry = typeof FONT_OPTIONS[number];
type FontSupport = ReturnType<typeof getFontSupport>;

/** Pure: options whose support has been computed for the current text, or an
 * empty list while closed (no reason to run the coverage check when nothing
 * can see the result). */
export function computeFontOptions(
  open: boolean,
  text: string,
  fontWeight: string,
  fontStyle: string,
  drawnText: string,
): (FontOptionEntry & { support: FontSupport })[] {
  if (!open) return [];
  return FONT_OPTIONS.map((font) => ({
    ...font,
    support: getFontSupport(font.value, text, fontWeight, fontStyle, drawnText),
  }));
}

/** Pure: case-insensitive filter by family name, shared by both surfaces. */
export function filterFontOptions<T extends { value: string }>(options: T[], query: string): T[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return options;
  return options.filter(({ value }) => value.toLocaleLowerCase().includes(normalized));
}

/**
 * The list body: search field, grouped/filtered rows, empty state. Shared by
 * `FontPickerMenu`'s popover content and `FontSheet`'s body (SNG-17), so
 * fallback labels and filtering never drift between the two surfaces.
 */
export function FontOptionsList({
  t,
  options,
  query,
  onQueryChange,
  currentValue,
  drawnText,
  onActivate,
  onHoverPreview,
  onHoverEnd,
  searchRef,
  className,
}: {
  t: SignMessages;
  options: (FontOptionEntry & { support: FontSupport })[];
  query: string;
  onQueryChange: (query: string) => void;
  currentValue: string;
  drawnText: string;
  onActivate: (family: string) => void;
  onHoverPreview?: (family: string) => void;
  onHoverEnd?: () => void;
  searchRef?: { current: HTMLInputElement | null };
  className?: string;
}) {
  const visibleOptions = filterFontOptions(options, query);

  return (
    <div className={className}>
      <input
        ref={searchRef as any}
        type="search"
        value={query}
        className={styles['font-menu-search']}
        placeholder={t.searchFontsPlaceholder}
        aria-label={t.searchFontsPlaceholder}
        onInput={(event) => {
          // Clearing any pending/committed preview on typing is the caller's
          // job (`onQueryChange`), so the popover and the sheet - which clear
          // different things - each keep their own exact behaviour here.
          onQueryChange((event.currentTarget as HTMLInputElement).value);
        }}
      />
      <div className={styles['font-menu-options']} role="listbox" aria-label={t.fontsListAriaLabel}>
        {visibleOptions.map((font) => {
          const { family, missing, status } = font.support;
          const incomplete = missing.length > 0;
          const isActive = font.value === currentValue;
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
              onMouseEnter={onHoverPreview ? () => onHoverPreview(font.value) : undefined}
              onMouseLeave={onHoverEnd}
              onFocus={onHoverPreview ? () => onHoverPreview(font.value) : undefined}
              onBlur={onHoverEnd}
              onClick={() => onActivate(font.value)}
            >
              {font.label}
              {drawnText && incomplete && <span className={styles['font-menu-item-note']}>
                {status === 'fallback' ? formatMessage(t.fallbackFontNoteTemplate, { family }) : t.doesntSupportText}
              </span>}
            </button>
          );
        })}
        {visibleOptions.length === 0 && <p className={styles['font-menu-empty']}>{t.noFontsFound}</p>}
      </div>
    </div>
  );
}
