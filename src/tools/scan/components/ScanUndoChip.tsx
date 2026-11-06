import UndoChip from '#shell/UndoChip.tsx';
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
    <UndoChip
      message={formatMessage(t.removedChip, { position })}
      undoLabel={t.undo}
      onUndo={onUndo}
      class={viewer ? styles.viewer : undefined}
    />
  );
}
