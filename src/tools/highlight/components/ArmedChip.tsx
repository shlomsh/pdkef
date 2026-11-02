import { englishHighlightMessages as t } from '../messages.ts';
import styles from './ArmedChip.module.css';

/** READ-03 on touch: a strip under the toolbar (or the lamp capsule) saying what the armed marker waits for, and Stop, the way out (a phone has no Esc key). */
export default function ArmedChip({ armed, onStop, lamp = false }: { armed: boolean; onStop(): void; /** In the lamp: placed under the fixed capsule. */ lamp?: boolean }) {
  if (!armed) return null;
  return (
    <div class={styles.chip} role="status" data-armed-chip data-lamp={lamp || undefined}>
      <span class={styles.text}>{t.armedAction}</span>
      <button type="button" class={styles.stop} onClick={onStop}>{t.armedStop}</button>
    </div>
  );
}
