import { useRef, useEffect } from 'preact/hooks';
import type { ActionHistoryEntry } from '../editor/model/actionHistory.ts';
import { englishSignMessages, formatMessage, type SignMessages } from '../i18n/toolMessages';
import dialogStyles from '../shell/Dialog.module.css';
import styles from './UndoHistoryModal.module.css';

// Shared "Undo changes" dialog for the Sign and Redact tools — lists logged
// actions (see actionHistory.ts) as a checklist so several can be reverted at
// once, alongside the Cmd/Ctrl+Z single-step undo (useUndoShortcut.js).
//
// Self-manages its own dialog ref and showModal()/close() lifecycle (rather
// than the caller owning the ref) so it's a drop-in for either tool. Uses
// showModal() specifically — not the `open` attribute — because that promotes
// the dialog into the browser's top layer, which paints above a real
// Fullscreen API element; a plain `<dialog open>` renders in normal stacking
// and is invisible while the workspace is in true full screen.
export default function UndoHistoryModal({
  open,
  onClose,
  actionHistory,
  undoSelection,
  setUndoSelection,
  onRevertSelected,
  onRedo,
  canRedo,
  redoDescription,
  messages,
}: {
  open: boolean;
  onClose: () => void;
  actionHistory: ActionHistoryEntry[];
  undoSelection: Set<string>;
  setUndoSelection: (s: Set<string>) => void;
  onRevertSelected: () => void;
  /** UNDO-REDO: optional so a caller that has not wired redo yet (both Sign
   * and Redact, as of this change) keeps working unchanged. Redoes the single
   * most recently undone action; there is no "redo selected" - the checklist
   * above is undo-only. */
  onRedo?: () => void;
  /** Whether there is anything left to redo. Only read when `onRedo` is
   * supplied; the button renders disabled while this is false. */
  canRedo?: boolean;
  /** The description of the action `onRedo` would bring back, e.g. "Added
   * text box" - shown in the button's accessible name so it isn't a mystery
   * click. Ignored while `canRedo` is false. */
  redoDescription?: string;
  /** LOC-16 stage 2-5: optional and English-default, same shape as
   * SignToolbar.tsx's `messages` prop, so every existing (English) caller of
   * this dialog (Redact included) is unaffected. */
  messages?: Partial<SignMessages>;
}) {
  const t: SignMessages = { ...englishSignMessages, ...messages };
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={dialogStyles.dialog}
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      aria-labelledby="undo-dialog-title"
    >
      <div className={dialogStyles.header}>
        <h3 id="undo-dialog-title">{t.undoHistoryTitle}</h3>
        <button type="button" className={dialogStyles.close} onClick={onClose} aria-label={t.closeDialogLabel}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      <div className={`${dialogStyles.body} ${dialogStyles['body-list']}`}>
        <div className={styles['undo-history-list']}>
          {actionHistory.map((action) => {
            const time = new Date(action.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const isSelected = undoSelection.has(action.id);
            return (
              <label key={action.id} className={styles['undo-history-item']}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => {
                    const newSet = new Set(undoSelection);
                    if ((e.target as HTMLInputElement).checked) newSet.add(action.id);
                    else newSet.delete(action.id);
                    setUndoSelection(newSet);
                  }}
                />
                <div className={styles['undo-history-details']}>
                  <span className={styles['undo-history-desc']}>{action.description}</span>
                  <span className={styles['undo-history-time']}>{time}</span>
                  <span className={styles['undo-history-page']}>{formatMessage(t.pageLabel, { number: action.pageIndex + 1 })}</span>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className={dialogStyles.footer}>
        {onRedo && (
          <button
            type="button"
            className={`${dialogStyles.button} ${dialogStyles.secondary}`}
            onClick={onRedo}
            disabled={!canRedo}
            title={t.redoTitle}
            aria-label={canRedo && redoDescription ? formatMessage(t.redoDescriptionTemplate, { description: redoDescription }) : undefined}
          >
            {t.redoButton}
          </button>
        )}
        <button
          type="button"
          className={`${dialogStyles.button} ${dialogStyles.primary} ${dialogStyles.success}`}
          onClick={onRevertSelected}
          disabled={undoSelection.size === 0}
        >
          {t.revertSelectedLabel}
        </button>
      </div>
    </dialog>
  );
}
