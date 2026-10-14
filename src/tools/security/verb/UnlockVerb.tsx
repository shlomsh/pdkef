import VerbStage from '../../../shell/verb/VerbStage.tsx';
import paperStyles from '../../../shell/verb/paper.module.css';
import styles from './UnlockVerb.module.css';

/** Unlock's verb: the shackle lifts, the lock moves off the page, and the hatching over the page clears. */
export default function UnlockVerb() {
  return (
    <VerbStage>
      <i class={`${paperStyles.page} ${styles.big}`}>
        <i class={styles.hatch} />
      </i>
      <svg class={styles.lock} viewBox="0 0 40 46">
        <path
          class={styles.shackle}
          d="M12 22v-8a8 8 0 0 1 16 0v8"
          fill="none"
          stroke="currentColor"
          stroke-width="4"
          stroke-linecap="round"
        />
        <rect x="6" y="20" width="28" height="23" rx="5" fill="currentColor" />
        <circle class={styles.keyhole} cx="20" cy="30" r="3.2" />
        <rect class={styles.keyhole} x="18.8" y="30" width="2.4" height="6.5" rx="1.2" />
      </svg>
    </VerbStage>
  );
}
