import { useEffect, useRef, useState } from 'preact/hooks';
import { offset, flip, shift } from '@floating-ui/react';
import Popover from '../shell/Popover.tsx';
import styles from './EditorControls.module.css';
import { englishSignMessages, formatMessage } from '../i18n/toolMessages';
import type { SignMessages } from '../editor/registry/messages';
import visualViewportClamp, { getStickyToolShellRect } from './hooks/visualViewportClamp.ts';
import useCoarsePointer from './hooks/useCoarsePointer.ts';
import { FONT_OPTIONS, computeFontOptions, FontOptionsList } from './FontOptionsList.tsx';
import FontSheet, { FILL_KEEP_SESSION_ATTR } from './FontSheet.tsx';

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
  const coarse = useCoarsePointer();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const previewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const current = FONT_OPTIONS.find((font) => font.value === value) || FONT_OPTIONS[0];
  const options = computeFontOptions(open, text, fontWeight, fontStyle, drawnText);

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
    // The sheet (coarse pointer) never autofocuses its search field - a
    // person taps it - so this effect only runs the popover's own path.
    if (open && !coarse) searchRef.current?.focus();
  }, [open, coarse]);

  useEffect(() => () => clearPreviewTimer(), []);

  const triggerButton = (
    <button
      type="button"
      className={`${styles['element-button']} ${styles['font-trigger']}`}
      title={formatMessage(t.fontTriggerTitleTemplate, { name: current.label })}
      aria-haspopup="dialog"
      aria-expanded={open}
    >
      Aa
    </button>
  );

  if (coarse) {
    return (
      <FontSheet
        trigger={triggerButton}
        value={value}
        text={text}
        drawnText={drawnText}
        fontWeight={fontWeight}
        fontStyle={fontStyle}
        onChange={onChange}
        onPreview={onPreview}
        onPreviewEnd={onPreviewEnd}
        t={t}
      />
    );
  }

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
      trigger={triggerButton}
      content={
        <div
          className={`${styles.popover} ${styles['font-menu']}`}
          data-font-picker-menu
          // Portaled to <body> and autofocuses its search field below; in
          // fill mode that focus must not read as a blur-to-body that ends
          // the edit session (see FILL_KEEP_SESSION_ATTR's doc in
          // FontSheet.tsx, shared with the phone sheet for the same reason).
          {...{ [FILL_KEEP_SESSION_ATTR]: true }}
          onMouseLeave={() => {
            clearPreviewTimer();
            onPreviewEnd?.();
          }}
        >
          <FontOptionsList
            t={t}
            options={options}
            query={query}
            onQueryChange={(nextQuery) => {
              clearPreviewTimer();
              onPreviewEnd?.();
              setQuery(nextQuery);
            }}
            currentValue={current.value}
            drawnText={drawnText}
            onActivate={(family) => {
              clearPreviewTimer();
              onChange(family);
              handleOpenChange(false);
            }}
            onHoverPreview={schedulePreview}
            onHoverEnd={clearPreviewTimer}
            searchRef={searchRef}
          />
        </div>
      }
    />
  );
}
