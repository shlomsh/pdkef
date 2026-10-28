import VerbStage from '#shell/verb/VerbStage.tsx';
import paperStyles from '#shell/verb/paper.module.css';
import styles from './PdfToImageVerb.module.css';

/** PDF to Image's verb: a page lifts and becomes a photo print. */
export default function PdfToImageVerb() {
  return (
    <VerbStage>
      <i class={`${paperStyles.photo} ${styles.print}`} />
    </VerbStage>
  );
}
