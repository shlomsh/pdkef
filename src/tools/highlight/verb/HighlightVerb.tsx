import VerbStage from '#shell/verb/VerbStage.tsx';
import styles from './HighlightVerb.module.css';

/** Highlight's verb: a page of text lines with a marker stroke laid over two of them. Positions live in the CSS (CSP). */
export default function HighlightVerb() {
  return (
    <VerbStage>
      <i class={styles.pg}>
        {[0, 1, 2, 3, 4, 5].map((n) => <i key={n} class={styles.line} />)}
        <i class={styles.mark} />
        <i class={styles.mark} />
      </i>
    </VerbStage>
  );
}
