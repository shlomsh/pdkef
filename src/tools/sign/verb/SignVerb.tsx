import VerbStage from '../../../shell/verb/VerbStage.tsx';
import styles from './SignVerb.module.css';

const SIG =
  'M26 140 C30 126 34 120 37 128 C39 134 36 142 33 141 C30 140 34 128 40 127 C45 126 43 139 47 138 C51 137 52 127 55 128 C58 129 56 139 60 138 C64 137 64 128 68 129 C72 130 70 139 75 137 C80 135 82 126 86 128 C90 130 87 140 93 137 C99 134 104 128 112 131';

/**
 * Sign's verb: a FULL NAME field types itself in, then a signature writes along its line.
 * The words are CSS generated content, so the static page carries no text from the island.
 */
export default function SignVerb() {
  return (
    <VerbStage>
      <i class={styles.pg}>
        <svg class={styles.art} viewBox="0 0 132 172">
          <rect class={styles.hd} x="12" y="14" width="40" height="5" rx="2.5" />
          <rect class={styles.ln} x="12" y="30" width="108" height="3.5" rx="1.75" />
          <rect class={styles.ln} x="12" y="40" width="80" height="3.5" rx="1.75" />
          <rect class={styles.field} x="12" y="68" width="108" height="18" rx="3" />
          <rect class={styles.ln} x="12" y="98" width="108" height="3.5" rx="1.75" />
          <rect class={styles.ln} x="12" y="108" width="64" height="3.5" rx="1.75" />
          <line class={styles.sigline} x1="22" y1="145" x2="118" y2="145" />
          <path class={styles.sig} pathLength="1" d={SIG} />
        </svg>
        <i class={styles.lbl}>
          <i class={styles.fl} />
        </i>
        <i class={styles.clip}>
          <i class={styles.typed} />
        </i>
        <i class={styles.caret} />
        <i class={styles.x}>
          <i class={styles.xg} />
        </i>
      </i>
    </VerbStage>
  );
}
