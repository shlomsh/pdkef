import VerbStage from '#shell/verb/VerbStage.tsx';
import paperStyles from '#shell/verb/paper.module.css';
import styles from './MergeVerb.module.css';

const a = `${paperStyles.page} ${paperStyles.stripA}`;
const b = `${paperStyles.page} ${paperStyles.stripB}`;

/** Merge's verb: three pages slide in, two more arc over the top and settle on the stack. */
export default function MergeVerb() {
  return (
    <VerbStage>
      <i class={`${a} ${styles.a1}`} />
      <i class={`${a} ${styles.a2}`} />
      <i class={`${a} ${styles.a3}`} />
      <i class={`${b} ${styles.b1}`} />
      <i class={`${b} ${styles.b2}`} />
    </VerbStage>
  );
}
