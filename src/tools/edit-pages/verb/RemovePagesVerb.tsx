import VerbStage from '#shell/verb/VerbStage.tsx';
import paperStyles from '#shell/verb/paper.module.css';
import styles from './RemovePagesVerb.module.css';

const page = `${paperStyles.page} ${paperStyles.stripA}`;

/** Remove PDF pages' verb: one page of four lifts out and fades, and the row closes behind it. */
export default function RemovePagesVerb() {
  return (
    <VerbStage>
      <i class={`${page} ${styles.d1}`} />
      <i class={`${page} ${styles.d2}`} />
      <i class={`${page} ${styles.d3}`} />
      <i class={`${page} ${styles.d4}`} />
    </VerbStage>
  );
}
