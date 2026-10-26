import VerbStage from '../../../shell/verb/VerbStage.tsx';
import paperStyles from '../../../shell/verb/paper.module.css';
import styles from './ScanVerb.module.css';

/** Scan's verb: a tilted photo of a page gets four corner dots, then straightens into a clean page. */
export default function ScanVerb() {
  return (
    <VerbStage>
      <em class={styles.desk} />
      <i class={`${paperStyles.photo} ${styles.sheet}`}>
        <b class={styles.tl} />
        <b class={styles.tr} />
        <b class={styles.br} />
        <b class={styles.bl} />
      </i>
    </VerbStage>
  );
}
