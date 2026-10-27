import { useEffect } from 'preact/hooks';
import type { RefObject } from 'preact';

export interface ModalDialogOptions {
  /**
   * Who handles Escape. 'capture' (default): a window keydown listener in the
   * capture phase that swallows the key (preventDefault + stopImmediatePropagation)
   * and calls onClose. 'cancel': the dialog's native cancel event, default
   * prevented, then onClose. false: the caller handles Escape itself.
   */
  escape?: 'capture' | 'cancel' | false;
  /** Default true: use `open = true/false` where showModal()/close() are missing (jsdom). false: call them unguarded. */
  fallback?: boolean;
  /** Default true: close the dialog when `open` turns false. false: the caller closes it. */
  closeWhenHidden?: boolean;
}

/**
 * Opens a <dialog> with showModal() (the top layer, so it shows over a real
 * fullscreen element; a plain `open` attribute does not) when `open` is true,
 * closes it when false, and routes Escape to `onClose`.
 */
export function useModalDialog(
  ref: RefObject<HTMLDialogElement>,
  open: boolean,
  onClose: () => void,
  { escape = 'capture', fallback = true, closeWhenHidden = true }: ModalDialogOptions = {},
): void {
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (!fallback || typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.open = true;
    } else if (!open && dialog.open && closeWhenHidden) {
      if (!fallback || typeof dialog.close === 'function') dialog.close();
      else dialog.open = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !escape) return undefined;
    if (escape === 'cancel') {
      const dialog = ref.current;
      if (!dialog) return undefined;
      const onCancel = (event: Event) => {
        event.preventDefault();
        onClose();
      };
      dialog.addEventListener('cancel', onCancel);
      return () => dialog.removeEventListener('cancel', onCancel);
    }
    const onEsc = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onEsc, { capture: true });
    return () => window.removeEventListener('keydown', onEsc, { capture: true });
  }, [open, onClose, escape]);
}
