import VerbStage from '#shell/verb/VerbStage.tsx';
import paperStyles from '#shell/verb/paper.module.css';
import styles from './ImageToPdfVerb.module.css';

const p = `${paperStyles.photo} ${styles.p}`;

/** Image to PDF's verb: three photos drop in, straighten, and each becomes a page. */
export default function ImageToPdfVerb() {
  return (
    <VerbStage>
      <i class={`${p} ${styles.p1}`} />
      <i class={`${p} ${styles.p2}`} />
      <i class={`${p} ${styles.p3}`} />
    </VerbStage>
  );
}
