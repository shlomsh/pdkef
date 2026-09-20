import { useRef, useEffect } from 'preact/hooks';
import type { ActionHistoryEntry } from '../editor/model/actionHistory.ts';
import { englishSignMessages, formatMessage, type SignMessages } from '../i18n/toolMessages';
import dialogStyles from '../shell/Dialog.module.css';
import styles from './UndoHistoryModal.module.css';

// Shared change-history dialog for the Sign and Redact tools. It renders one
// timeline, newest at the top throughout, with a "you are here" divider: the
// undone steps (historyStack.ts's `future`) above it, muted and un-checkable
// since a step already undone cannot be selectively reverted; the applied
// steps (`past`) below it, exactly as before, with their checkboxes for
// selective revert. Undo moves the divider down and greys a row out; Redo
// moves it up and brings one back. Nothing ever disappears from the list, so
// both the toolbar's Undo and Redo controls always have something visible to
// point at - the bug this replaced was a checklist that dropped a row the
// moment it was undone, leaving Redo's enabled state pointing at nothing on
// screen.
//
// Undo and redo themselves are not in here. They are one tap each on the
// toolbar (and the keyboard), which is the only place they can be reached
// while this dialog is closed; this dialog's one job is the thing the toolbar
// cannot do, which is reverting something from further back. Do not add a
// Redo button to the footer again.
//
// See actionHistory.ts and historyStack.ts for the two arrays this reads, and
// src/lib/history/useHistoryShortcuts.js for the keyboard shortcuts that are
// the other way to reach undo and redo.
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
  redoHistory = [],
  undoSelection,
  setUndoSelection,
  onRevertSelected,
  messages,
}: {
  open: boolean;
  onClose: () => void;
  actionHistory: ActionHistoryEntry[];
  /** historyStack.ts's `future`, newest-undone-first - the steps Redo would
   * bring back, one tap at a time starting from index 0. Optional and
   * empty-default so a caller that has not wired it stays on the old,
   * undo-only list rather than crashing. Rendered reversed (oldest-undone
   * first) above the "you are here" divider so the list still reads
   * newest-at-top throughout and `redoHistory[0]` - the entry Redo acts on
   * next - sits immediately above the divider. */
  redoHistory?: ActionHistoryEntry[];
  undoSelection: Set<string>;
  setUndoSelection: (s: Set<string>) => void;
  onRevertSelected: () => void;
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
          {/* Newest-first throughout, oldest-undone-first here so
              redoHistory[0] - what Redo acts on next - lands right above the
              divider. No checkbox: a step already undone cannot be
              selectively reverted, there is nothing left to check. */}
          {[...redoHistory].reverse().map((action) => {
            const time = new Date(action.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return (
              <div key={action.id} className={`${styles['undo-history-item']} ${styles['undo-history-item--undone']}`}>
                <span className={styles['undo-history-undone-icon']} aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 7v6h6" />
                    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                  </svg>
                </span>
                <div className={styles['undo-history-details']}>
                  <span className={styles['undo-history-desc']}>{action.description}</span>
                  <span className={styles['undo-history-time']}>{time}</span>
                  {/* Real text, not a colour or an ::before - carries the
                      "undone" state on its own for a screen reader, and for a
                      sighted person who cannot rely on the muted tint alone.
                      Grouped with the timestamp rather than the description,
                      which it used to push onto a third line at phone width. */}
                  <span className={styles['undo-history-badge']}>{t.undoneLabel}</span>
                  <span className={styles['undo-history-page']}>{formatMessage(t.pageLabel, { number: action.pageIndex + 1 })}</span>
                </div>
              </div>
            );
          })}

          {redoHistory.length > 0 && (
            <div className={styles['undo-history-divider']} role="separator">
              <span className={styles['undo-history-now']}>{t.historyNowLabel}</span>
            </div>
          )}

          {actionHistory.map((action) => {
            const time = new Date(action.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

      {/* One action, and it is the one this dialog is the only place for.
          Redo lives on the toolbar beside Undo, in both tools: it had a button
          here first, while the toolbar's single control still opened this
          dialog, and keeping both would have left two controls doing the same
          thing in two places with different reach - the dialog's pair is
          unreachable while it is closed, which on a phone was all of redo. */}
      <div className={dialogStyles.footer}>
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
