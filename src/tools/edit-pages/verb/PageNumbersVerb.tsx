import VerbStage from '../../../shell/verb/VerbStage.tsx';
import paperStyles from '../../../shell/verb/paper.module.css';
import styles from './PageNumbersVerb.module.css';

const page = `${paperStyles.page} ${paperStyles.stripA}`;

/** Add page numbers' verb: a number lands at the bottom centre of each page, 1, 2, 3, in reading order. */
export default function PageNumbersVerb() {
  return (
    <VerbStage>
      <i class={`${page} ${styles.p1}`}><b class={`${styles.num} ${styles.n1}`} /></i>
      <i class={page}><b class={`${styles.num} ${styles.n2}`} /></i>
      <i class={`${page} ${styles.p3}`}><b class={`${styles.num} ${styles.n3}`} /></i>
    </VerbStage>
  );
}
