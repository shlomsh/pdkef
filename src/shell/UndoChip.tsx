import styles from './UndoChip.module.css';

interface UndoChipProps {
  message: string;
  undoLabel: string;
  onUndo(): void;
  class?: string;
  style?: Record<string, string | number>;
}

/** The chip that offers to take a removal back. */
export default function UndoChip({ message, undoLabel, onUndo, class: className, style }: UndoChipProps) {
  return (
    <div class={`${styles.chip} ${className ?? ''}`} style={style} data-undo-chip>
      <span>{message}</span>
      <button type="button" class={styles.undo} onClick={onUndo}>{undoLabel}</button>
    </div>
  );
}
