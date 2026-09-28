import { useId } from 'preact/hooks';
import styles from './DraftRetentionHint.module.css';

/** A quiet info affordance next to the "Draft saved" chip: what pdkef's
 * on-device draft cache actually promises (28 days, 6 files), stated once
 * rather than left to the FAQ. Static copy, not personalized to this draft. */
export default function DraftRetentionHint({ label }: { label: string }) {
  const tipId = useId();
  return (
    <span class={styles['info-icon']} tabIndex={0} aria-describedby={tipId}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9.25" stroke="currentColor" stroke-width="1.6" />
        <path d="M12 11v5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        <circle cx="12" cy="7.75" r="1.05" fill="currentColor" />
      </svg>
      <span class={styles['tooltip-bubble']} role="tooltip" id={tipId}>{label}</span>
    </span>
  );
}
