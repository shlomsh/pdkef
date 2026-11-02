import type { Marker } from '../lib/marker/markerState.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import LookControls from './LookControls.tsx';
import styles from './ArmedChip.module.css';

/**
 * READ-03 on touch: the pen bar. While the marker is armed it holds the look controls (the pen's, or the open mark's
 * when one is tapped) and Stop, the way out (a phone has no Esc key).
 */
export default function ArmedChip({ armed, look, onLook, onStop }: {
  armed: boolean;
  look: Marker;
  onLook(change: Partial<Marker>): void;
  onStop(): void;
}) {
  if (!armed) return null;
  return (
    <div class={styles.chip} role="status" aria-label={t.armedAction} data-armed-chip>
      <LookControls look={look} onChange={onLook} />
      <button type="button" class={styles.stop} onClick={onStop}>{t.armedStop}</button>
    </div>
  );
}
