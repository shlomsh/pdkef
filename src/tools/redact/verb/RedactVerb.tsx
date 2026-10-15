import VerbStage from '../../../shell/verb/VerbStage.tsx';
import styles from './RedactVerb.module.css';

/** One text line: three word bars. The crisp and the blurred copies share this shape. */
function Line({ cls, part }: { cls: string; part?: string }) {
  return (
    <i class={cls} data-part={part}>
      <i class={styles.w1} />
      <i class={styles.w2} />
      <i class={styles.w3} />
    </i>
  );
}

/**
 * Redact's verb: a frosted box sweeps two lines of a page and the words soften behind its edge,
 * then a white-out box sweeps a faint footer watermark and leaves clean paper.
 */
export default function RedactVerb() {
  return (
    <VerbStage>
      <i class={styles.pg}>
        <i class={styles.hd} />
        <i class={styles.full} />
        <Line cls={`${styles.row} ${styles.r1}`} />
        <Line cls={`${styles.row} ${styles.r2}`} />
        <i class={`${styles.full} ${styles.t1}`} />
        <i class={`${styles.full} ${styles.t2}`} />
        <i class={`${styles.full} ${styles.t3}`} />
        <i class={styles.mark} data-part="watermark" />
        <i class={styles.stamp} data-part="watermark" />
        <i class={styles.frost} data-part="frost">
          <i class={styles.soft}>
            <Line cls={`${styles.row} ${styles.f1}`} part="blurred-line" />
            <Line cls={`${styles.row} ${styles.f2}`} part="blurred-line" />
          </i>
        </i>
        <i class={styles.whiteout} data-part="whiteout" />
      </i>
    </VerbStage>
  );
}
