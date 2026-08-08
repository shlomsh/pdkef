import { useEffect, useRef } from 'preact/hooks';
import styles from './Dialog.module.css';

/**
 * The one confirmation dialog in the app. Sign, Redact and Unlock each carried a
 * hand-copied version of this markup, ref and effect, which is how their copy
 * and their Escape behaviour drifted apart in the first place; every tool now
 * gets the same dialog and only supplies the words.
 *
 * `showModal()`, not the `open` attribute: showModal promotes the dialog into
 * the browser's top layer, which paints above a real Fullscreen API element. A
 * plain `<dialog open>` renders in normal stacking and is invisible while the
 * editor workspace is in true full screen, whatever its z-index. The fallbacks
 * are for jsdom, which has no dialog implementation.
 *
 * Escape is captured rather than left to the dialog's own default so that in
 * full screen the press closes this dialog and nothing else: the browser's
 * Escape default (exit full screen) and the dialog's Escape otherwise race, and
 * full screen tends to win, leaving the confirmation orphaned open behind it.
 * stopImmediatePropagation also keeps the editors' global tool/selection Escape
 * handler from firing on the same press.
 */
export default function ConfirmDialog({
  open,
  titleId,
  title,
  confirmLabel,
  onCancel,
  onConfirm,
  children,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.open = true;
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.open = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onCancel();
    };
    window.addEventListener('keydown', onEsc, { capture: true });
    return () => window.removeEventListener('keydown', onEsc, { capture: true });
  }, [open, onCancel]);

  return (
    <dialog
      ref={dialogRef}
      class={`${styles.dialog} ${styles.narrow}`}
      onClose={onCancel}
      onClick={(event) => { if (event.target === event.currentTarget) onCancel(); }}
      aria-labelledby={titleId}
    >
      <div class={styles.header}>
        <h3 id={titleId}>{title}</h3>
        <button type="button" class={styles.close} onClick={onCancel} aria-label="Close dialog">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <div class={`${styles.body} ${styles['body-tight']}`}>
        <p class={styles['confirm-text']}>{children}</p>
      </div>
      <div class={styles.footer}>
        <button type="button" class={`${styles.button} ${styles.secondary}`} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          class={`${styles.button} ${styles.primary} ${styles.danger}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
