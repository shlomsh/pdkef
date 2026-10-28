import VerbStage from '#shell/verb/VerbStage.tsx';
import paperStyles from '#shell/verb/paper.module.css';
import styles from './EditPagesVerb.module.css';

const page = `${paperStyles.page} ${paperStyles.stripA}`;

/** Edit Pages' verb: one page lifts and turns 90 degrees, another lifts out, the row closes. */
export default function EditPagesVerb() {
  return (
    <VerbStage>
      <i class={`${page} ${styles.e1}`} />
      <i class={`${page} ${styles.e2}`} />
      <i class={`${page} ${styles.e3}`} />
      <i class={`${page} ${styles.e4}`} />
    </VerbStage>
  );
}
