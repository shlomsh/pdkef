import VerbStage from '#shell/verb/VerbStage.tsx';
import styles from './HighlightVerb.module.css';

const LINE_TOPS = [32, 46, 60, 74, 88, 102];

/** Highlight's verb: a page of text lines with a marker stroke laid over two of them. */
export default function HighlightVerb() {
  return (
    <VerbStage>
      <i class={styles.pg}>
        {LINE_TOPS.map((top) => (
          <i key={top} class={styles.line} style={{ top: `calc(${top} * var(--s))` }} />
        ))}
        <i class={styles.mark} style={{ top: 'calc(46 * var(--s))' }} />
        <i class={styles.mark} style={{ top: 'calc(60 * var(--s))' }} />
      </i>
    </VerbStage>
  );
}
