import { cloneElement } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import sheetStyles from './FontSheet.module.css';
import { FONT_OPTIONS, computeFontOptions, FontOptionsList } from './FontOptionsList.tsx';
import type { SignMessages } from '../editor/registry/messages';

/**
 * SNG-17: `useFillFocus.ts` (fill mode's focus session tracker) keeps the
 * fill session alive when focus lands inside an element carrying this
 * attribute, instead of reading it as a blur to `<body>` that should end
 * editing. The canonical constant is `FILL_KEEP_SESSION_ATTR` in
 * `src/tools/sign/fill/fillDom.ts` (commit 975538bc); `editor-ui` may never
 * import a tool (`docs/module-boundaries.md` rule 2), so this is the same
 * string literal, kept in sync by hand rather than by import.
 */
export const FILL_KEEP_SESSION_ATTR = 'data-fill-keep-session';

/** English-only sheet chrome copy (Done/Cancel/Font). Not part of the shared
 * `SignMessages` catalogue: every other string this file shows already comes
 * through `t` (the same merged messages object `FontPickerMenu` builds), and
 * these three are new. Kept local and English-only, as the brief allows,
 * rather than growing `SignMessages`/`toolMessages.ts` - both are outside
 * this change's file set and are edited by no one else, so widening them is
 * a separate, deliberate change, not a side effect of this one. */
const SHEET_COPY = {
  font: 'Font',
  cancel: 'Cancel',
  done: 'Done',
};

/** Pure: how far, if at all, the window must scroll so `elementBottom` clears
 * `sheetTop` by `margin` (both in viewport pixels). Never negative - a caller
 * that is already clear of the sheet gets 0. */
export function computeSheetRevealScroll(elementBottom: number, sheetTop: number, margin = 16): number {
  const overlap = elementBottom + margin - sheetTop;
  return overlap > 0 ? overlap : 0;
}

export default function FontSheet({
  trigger,
  value,
  text = '',
  drawnText = text,
  fontWeight = 'normal',
  fontStyle = 'normal',
  onChange,
  onPreview,
  onPreviewEnd,
  t,
}: {
  trigger: any;
  value?: string;
  text?: string;
  drawnText?: string;
  fontWeight?: string;
  fontStyle?: string;
  onChange: (font: string) => void;
  onPreview?: (font: string) => void;
  onPreviewEnd?: () => void;
  t: SignMessages;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [previewed, setPreviewed] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const current = FONT_OPTIONS.find((font) => font.value === value) || FONT_OPTIONS[0];
  const options = computeFontOptions(open, text, fontWeight, fontStyle, drawnText);

  const closeSheet = (commit: boolean) => {
    if (commit && previewed) onChange(previewed);
    onPreviewEnd?.();
    setOpen(false);
    setQuery('');
    setPreviewed(null);
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    const toFocus = previouslyFocused.current;
    previouslyFocused.current = null;
    if (toFocus && document.contains(toFocus)) toFocus.focus();
  };

  const openSheet = () => {
    previouslyFocused.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  };

  // Native <dialog> open/close and the top-layer requirement for a real
  // fullscreen edit session (`<dialog open>` alone renders invisibly there).
  // Per the lead's correction: this sheet must not blur the previously
  // focused field (that reads as ending the fill session), so instead of
  // moving focus off-document it moves focus onto the dialog itself, which
  // carries FILL_KEEP_SESSION_ATTR for useFillFocus to recognise.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      dialog.focus();

      // Scroll so the element being styled is not hidden under the sheet.
      const anchor = triggerRef.current?.closest('[data-editor-element]');
      if (anchor) {
        const elementRect = anchor.getBoundingClientRect();
        const sheetRect = dialog.getBoundingClientRect();
        const delta = computeSheetRevealScroll(elementRect.bottom, sheetRect.top);
        if (delta > 0) window.scrollBy({ top: delta });
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return undefined;
    const onCancel = (event: Event) => {
      event.preventDefault();
      closeSheet(false);
    };
    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      {cloneElement(trigger, {
        ref: (node: HTMLElement | null) => { triggerRef.current = node; },
        'aria-haspopup': 'dialog',
        'aria-expanded': open,
        onClick: (event: MouseEvent) => {
          trigger.props?.onClick?.(event);
          openSheet();
        },
      })}
      {open && (
        <dialog
          ref={dialogRef}
          tabIndex={-1}
          {...{ [FILL_KEEP_SESSION_ATTR]: true }}
          className={sheetStyles.sheet}
          data-font-picker-sheet
          aria-label={SHEET_COPY.font}
          onClick={(event) => {
            // Backdrop click: `event.target` is the <dialog> element itself
            // only when the click landed outside its own box (the standard
            // native-dialog light-dismiss test), which per the brief commits
            // the previewed font, same as Done.
            if (event.target === dialogRef.current) closeSheet(true);
          }}
        >
          <div className={sheetStyles.handle} aria-hidden="true" />
          <div className={sheetStyles.header}>
            <button type="button" className={sheetStyles.headerButton} onClick={() => closeSheet(false)}>
              {SHEET_COPY.cancel}
            </button>
            <span className={sheetStyles.title}>{SHEET_COPY.font}</span>
            <button
              type="button"
              className={`${sheetStyles.headerButton} ${sheetStyles.doneButton}`}
              onClick={() => closeSheet(true)}
            >
              {SHEET_COPY.done}
            </button>
          </div>
          <FontOptionsList
            t={t}
            options={options}
            query={query}
            onQueryChange={setQuery}
            currentValue={previewed ?? current.value}
            drawnText={drawnText}
            onActivate={(family) => {
              setPreviewed(family);
              onPreview?.(family);
            }}
            className={sheetStyles.body}
          />
        </dialog>
      )}
    </>
  );
}
