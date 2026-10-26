import VerbStage from '../../../shell/verb/VerbStage.tsx';
import paperStyles from '../../../shell/verb/paper.module.css';
import styles from './RotatePagesVerb.module.css';

const page = `${paperStyles.page} ${paperStyles.stripA}`;

/** Rotate PDF's verb: the middle page lies on its side, lifts, turns upright and settles back in the row. */
export default function RotatePagesVerb() {
  return (
    <VerbStage>
      <i class={`${page} ${styles.r1}`} />
      <i class={`${page} ${styles.r2}`} />
      <i class={`${page} ${styles.r3}`} />
    </VerbStage>
  );
}
