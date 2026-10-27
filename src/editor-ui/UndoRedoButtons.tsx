import styles from './SignToolbar.module.css';

export interface UndoRedoLabels {
  undoTitle: string;
  undoButton: string;
  redoTitle: string;
  redoButton: string;
}

const ENGLISH: UndoRedoLabels = { undoTitle: 'Undo', undoButton: 'Undo', redoTitle: 'Redo', redoButton: 'Redo' };

/**
 * The editors' Undo and Redo pair (ARCH-37): two buttons, one tap each, beside the keyboard
 * shortcuts (src/lib/history/useHistoryShortcuts.js). Folding them into one button once left a phone
 * unable to redo at all - keep them as two.
 *
 * `iconOnly` is Sign's `data-icon-only`: an arrow is a convention and its labelled desktop row has no
 * width to spare. Redact keeps the label. `labels` defaults to English; Sign passes its catalogue's.
 */
export default function UndoRedoButtons({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  iconOnly = false,
  labels = ENGLISH,
}: {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  iconOnly?: boolean;
  labels?: UndoRedoLabels;
}) {
  const iconOnlyAttr = iconOnly ? { 'data-icon-only': true } : {};
  return (
    <>
      <button type="button" className={styles.button} onClick={onUndo} title={labels.undoTitle} disabled={!canUndo} {...iconOnlyAttr}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 7v6h6" />
          <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
        </svg>
        <span className={styles.label}>{labels.undoButton}</span>
      </button>

      <button type="button" className={styles.button} onClick={onRedo} title={labels.redoTitle} disabled={!canRedo} {...iconOnlyAttr}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 7v6h-6" />
          <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
        </svg>
        <span className={styles.label}>{labels.redoButton}</span>
      </button>
    </>
  );
}
