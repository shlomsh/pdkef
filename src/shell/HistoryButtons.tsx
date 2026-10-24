import styles from './HistoryButtons.module.css';

export interface HistoryButtonsMessages {
  undo: string;
  redo: string;
  undoLabel: string;
  redoLabel: string;
}

interface HistoryButtonsProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  labels: HistoryButtonsMessages;
}

/* The Undo / Redo pair over useEditHistory (src/lib/history/), for a tool's
   document header. The keys are bound separately by useHistoryShortcuts. */
export default function HistoryButtons({ canUndo, canRedo, onUndo, onRedo, labels }: HistoryButtonsProps) {
  return (
    <div class={styles.group}>
      <button type="button" class={styles.button} onClick={onUndo} disabled={!canUndo} aria-label={labels.undoLabel}>
        {labels.undo}
      </button>
      <button type="button" class={styles.button} onClick={onRedo} disabled={!canRedo} aria-label={labels.redoLabel}>
        {labels.redo}
      </button>
    </div>
  );
}
