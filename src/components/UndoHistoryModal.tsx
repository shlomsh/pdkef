import { useRef, useEffect } from 'preact/hooks';
import dialogStyles from './Dialog.module.css';
import styles from './UndoHistoryModal.module.css';

// Shared "Undo changes" dialog for the Sign and Redact tools — lists logged
// actions (see actionHistory.js) as a checklist so several can be reverted at
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
  onRevertSelected
}: {
  open: boolean;
  onClose: () => void;
  actionHistory: any[];
  undoSelection: Set<string>;
  setUndoSelection: (s: Set<string>) => void;
  onRevertSelected: () => void;
}) {
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
        <h3 id="undo-dialog-title">Undo changes</h3>
        <button type="button" className={dialogStyles.close} onClick={onClose} aria-label="Close dialog">
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
                  <span className={styles['undo-history-page']}>Page {action.pageIndex + 1}</span>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className={dialogStyles.footer}>
        <button
          type="button"
          className={`${dialogStyles.button} ${dialogStyles.primary} ${dialogStyles.success}`}
          onClick={onRevertSelected}
          disabled={undoSelection.size === 0}
        >
          Revert selected
        </button>
      </div>
    </dialog>
  );
}
