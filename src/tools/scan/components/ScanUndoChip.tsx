import { formatMessage } from '#lib/text/formatMessage.ts';
import { englishScanMessages as t } from '../messages.ts';
import styles from './ScanUndoChip.module.css';

interface ScanUndoChipProps {
  /** Where the removed page sat, counted from one. */
  position: number;
  onUndo: () => void;
  /** Inside the page viewer: it rides at the top so it never covers Done. */
  viewer?: boolean;
}

/** The five seconds in which Remove can be taken back. */
export default function ScanUndoChip({ position, onUndo, viewer = false }: ScanUndoChipProps) {
  return (
    <div class={`${styles.chip} ${viewer ? styles.viewer : ''}`} data-undo-chip>
      <span>{formatMessage(t.removedChip, { position })}</span>
      <button type="button" class={styles.undo} onClick={onUndo}>{t.undo}</button>
    </div>
  );
}
