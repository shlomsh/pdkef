import { englishHighlightMessages as t } from '../messages.ts';
import styles from './ArmedChip.module.css';

/** READ-03 on touch: what the armed marker waits for, and Stop, the way out (a phone has no Esc key). */
export default function ArmedChip({ armed, onStop }: { armed: boolean; onStop(): void }) {
  if (!armed) return null;
  return (
    <div class={styles.chip} role="status" data-armed-chip>
      <span class={styles.text}>{t.armedAction}</span>
      <button type="button" class={styles.stop} onClick={onStop}>{t.armedStop}</button>
    </div>
  );
}
